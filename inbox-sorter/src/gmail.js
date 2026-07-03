const { google } = require('googleapis');

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Step 1: build the URL the user clicks "Connect Gmail" to visit
function getAuthUrl() {
  const oauth2Client = getOAuthClient();
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
  ];
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // gives us a refresh token
    prompt: 'consent',
    scope: scopes
  });
}

// Step 2: exchange the code Google sends back for tokens
async function getTokensFromCode(code) {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

// Step 3: fetch recent emails for a logged-in user
async function fetchRecentEmails(tokens, maxResults = 20) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    labelIds: ['INBOX']
  });

  const messages = listRes.data.messages || [];
  const emails = [];

  for (const msg of messages) {
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date']
    });

    const headers = full.data.payload.headers;
    const getHeader = (name) =>
      headers.find((h) => h.name === name)?.value || '';

    emails.push({
      id: msg.id,
      sender: getHeader('From'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      snippet: full.data.snippet || ''
    });
  }

  return emails;
}

module.exports = { getAuthUrl, getTokensFromCode, fetchRecentEmails };
