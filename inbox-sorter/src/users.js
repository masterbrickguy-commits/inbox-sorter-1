// In-memory store for the MVP. Replace with a real database
// (Postgres, SQLite, etc.) before going live with real users.

const users = new Map(); // key: user email, value: user object

const PLAN_LIMITS = {
  pro: { emailsPerMonth: 3000, gmailAccounts: 1, prioritySupport: false },
  pro_plus: { emailsPerMonth: 10000, gmailAccounts: 1, prioritySupport: true }
};

function getOrCreateUser(email) {
  if (!users.has(email)) {
    users.set(email, {
      email,
      plan: null, // 'pro' | 'pro_plus' | null (no active plan yet)
      tokens: null, // Gmail OAuth tokens
      emailsSortedThisMonth: 0,
      monthResetDate: new Date(),
      stripeCustomerId: null
    });
  }
  return users.get(email);
}

function canSortMoreEmails(user) {
  if (!user.plan) return false;
  const limit = PLAN_LIMITS[user.plan].emailsPerMonth;
  return user.emailsSortedThisMonth < limit;
}

function recordEmailsSorted(user, count) {
  user.emailsSortedThisMonth += count;
}

module.exports = {
  users,
  PLAN_LIMITS,
  getOrCreateUser,
  canSortMoreEmails,
  recordEmailsSorted
};
