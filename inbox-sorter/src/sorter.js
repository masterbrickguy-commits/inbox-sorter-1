const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Sorts a single email into verdict (worth_it/skip) and category
// (important/useless/games) using Claude, returns parsed JSON.
async function sortEmail(email) {
  const prompt = `You are an email triage assistant. Given the email below, decide:
1. "verdict": either "worth_it" or "skip"
2. "category": one of "important", "useless", or "games" (games = notifications from video games, gaming platforms, or game-related services)
3. "reason": a single short sentence (under 12 words) explaining the verdict

Email:
From: ${email.sender}
Subject: ${email.subject}
Preview: ${email.snippet}

Respond with ONLY raw JSON, no markdown, no backticks, in this exact shape:
{"verdict": "worth_it", "category": "important", "reason": "..."}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();

  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      id: email.id,
      sender: email.sender,
      subject: email.subject,
      verdict: parsed.verdict === 'worth_it' ? 'worth_it' : 'skip',
      category: ['important', 'useless', 'games'].includes(parsed.category)
        ? parsed.category
        : 'useless',
      reason: parsed.reason || ''
    };
  } catch (err) {
    // If Claude's output can't be parsed, fail safe to "useless/skip"
    return {
      id: email.id,
      sender: email.sender,
      subject: email.subject,
      verdict: 'skip',
      category: 'useless',
      reason: 'Could not be classified automatically'
    };
  }
}

// Sorts a batch of emails one at a time (simple, reliable version).
// For production scale, this should be parallelized with a concurrency limit.
async function sortEmails(emails) {
  const results = [];
  for (const email of emails) {
    const result = await sortEmail(email);
    results.push(result);
  }
  return results;
}

module.exports = { sortEmail, sortEmails };
