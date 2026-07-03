# Inbox Sorter

AI-powered Gmail notification sorter. Connects to Gmail via OAuth, sorts emails
into "worth it" / "skip" using Claude, and further categorizes them into
Important, Useless, and Games tabs.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in real values:
   ```
   cp .env.example .env
   ```

3. **Google OAuth setup** (required):
   - Go to https://console.cloud.google.com
   - Create a new project
   - Enable the "Gmail API"
   - Go to "APIs & Services" > "Credentials" > "Create Credentials" > "OAuth client ID"
   - Application type: Web application
   - Add authorized redirect URI: `http://localhost:3000/auth/google/callback`
   - Copy the Client ID and Client Secret into your `.env`
   - Note: while in "Testing" mode, only up to 100 test users can use this.
     You'll need Google's verification process to go beyond that.

4. **Claude API setup** (required):
   - Go to https://console.anthropic.com
   - Create an API key
   - Paste it into `ANTHROPIC_API_KEY` in `.env`

5. **Stripe setup** (required for payments):
   - Go to https://dashboard.stripe.com
   - Create two Products: "Pro" ($3/mo recurring) and "Pro+" ($5/mo recurring)
   - Copy each Price ID into `.env`
   - Set up a webhook endpoint pointing to `/api/stripe-webhook` for the
     `checkout.session.completed` and `customer.subscription.deleted` events
   - Copy your Stripe secret key and webhook signing secret into `.env`

6. Run the app:
   ```
   npm start
   ```

7. Visit http://localhost:3000

## Important notes before going live

- **Database**: This MVP stores users in memory (`src/users.js`). All data is
  lost on restart. Before real users sign up, replace this with a real
  database (Postgres, SQLite, etc.).
- **Google verification**: Beyond 100 test users, Google requires a security
  review for apps requesting Gmail access. Budget time and possibly money for
  this before scaling up.
- **HTTPS**: Cookies are set to `secure: false` for local testing. Once
  deployed, set this to `true` and serve over HTTPS only.
- **Rate limits**: The current email sorter processes emails one at a time.
  For higher volume, consider batching or parallelizing Claude API calls with
  a concurrency limit.
