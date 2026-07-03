require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const Stripe = require('stripe');

const { getAuthUrl, getTokensFromCode, fetchRecentEmails } = require('./gmail');
const { sortEmails } = require('./sorter');
const {
  getOrCreateUser,
  canSortMoreEmails,
  recordEmailsSorted,
  PLAN_LIMITS
} = require('./users');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // set true once deployed behind HTTPS
  })
);

// ---------- Auth routes ----------

// Step 1: user clicks "Connect Gmail" -> redirected here -> sent to Google
app.get('/auth/google', (req, res) => {
  res.redirect(getAuthUrl());
});

// Step 2: Google redirects back here with a code
app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const tokens = await getTokensFromCode(code);

    // Get the user's email address to use as their account ID
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const { data } = await oauth2.userinfo.get();

    const user = getOrCreateUser(data.email);
    user.tokens = tokens;

    req.session.userEmail = data.email;
    res.redirect('/dashboard.html');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Something went wrong connecting your Gmail account.');
  }
});

// ---------- API routes ----------

// Returns the logged-in user's plan + usage info
app.get('/api/me', (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ error: 'Not logged in' });
  const user = getOrCreateUser(req.session.userEmail);
  res.json({
    email: user.email,
    plan: user.plan,
    emailsSortedThisMonth: user.emailsSortedThisMonth,
    limit: user.plan ? PLAN_LIMITS[user.plan].emailsPerMonth : 0
  });
});

// Fetches and sorts the user's recent emails
app.get('/api/sort-emails', async (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ error: 'Not logged in' });
  const user = getOrCreateUser(req.session.userEmail);

  if (!user.tokens) {
    return res.status(400).json({ error: 'Gmail not connected' });
  }
  if (!user.plan) {
    return res.status(402).json({ error: 'No active subscription. Please choose a plan.' });
  }
  if (!canSortMoreEmails(user)) {
    return res.status(429).json({ error: 'Monthly email sorting limit reached.' });
  }

  try {
    const maxResults = Math.min(20, PLAN_LIMITS[user.plan].emailsPerMonth - user.emailsSortedThisMonth);
    const emails = await fetchRecentEmails(user.tokens, maxResults);
    const sorted = await sortEmails(emails);
    recordEmailsSorted(user, sorted.length);

    res.json({
      important: sorted.filter((e) => e.category === 'important'),
      useless: sorted.filter((e) => e.category === 'useless'),
      games: sorted.filter((e) => e.category === 'games')
    });
  } catch (err) {
    console.error('Sort emails error:', err);
    res.status(500).json({ error: 'Failed to sort emails' });
  }
});

// ---------- Stripe billing routes ----------

app.post('/api/create-checkout-session', async (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ error: 'Not logged in' });
  const { plan } = req.body; // 'pro' or 'pro_plus'

  const priceId =
    plan === 'pro_plus'
      ? process.env.STRIPE_PROPLUS_PRICE_ID
      : process.env.STRIPE_PRO_PRICE_ID;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: req.session.userEmail,
      success_url: `${process.env.APP_URL}/dashboard.html?success=true`,
      cancel_url: `${process.env.APP_URL}/pricing.html?canceled=true`,
      metadata: { plan, userEmail: req.session.userEmail }
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe sends events here (subscription created, canceled, etc.)
// NOTE: must use raw body for signature verification — see Stripe docs
app.post(
  '/api/stripe-webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { plan, userEmail } = session.metadata;
      const user = getOrCreateUser(userEmail);
      user.plan = plan;
      user.stripeCustomerId = session.customer;
      user.emailsSortedThisMonth = 0;
    }

    if (event.type === 'customer.subscription.deleted') {
      // Find user by stripeCustomerId and clear their plan
      const { users } = require('./users');
      for (const user of users.values()) {
        if (user.stripeCustomerId === event.data.object.customer) {
          user.plan = null;
        }
      }
    }

    res.json({ received: true });
  }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Inbox Sorter running at http://localhost:${PORT}`);
});
