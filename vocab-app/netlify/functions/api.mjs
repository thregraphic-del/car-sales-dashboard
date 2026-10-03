// Netlify Function serving the whole API (/api/*). The static frontend in
// public/ is served by Netlify's CDN. Secrets (OPENROUTER_API_KEY,
// SESSION_SECRET, SETUP_CODE) are read from Netlify environment variables at
// runtime — they are never part of the code or the static files.
import serverless from 'serverless-http';
import { createApp } from '../../server/app.js';

const app = createApp();
const wrapped = serverless(app);

export const handler = async (event, context) => {
  // Requests arrive via the /api/* rewrite; keep the public path for Express.
  if (event.path?.startsWith('/.netlify/functions/api')) event.path = event.path.replace('/.netlify/functions/api', '/api');
  context.callbackWaitsForEmptyEventLoop = false; // keep the DB pool open between requests
  return wrapped(event, context);
};
