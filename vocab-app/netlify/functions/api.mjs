// Netlify Function serving the whole API (/api/*). The static frontend in
// public/ is served by Netlify's CDN. Secrets (OPENROUTER_API_KEY,
// SESSION_SECRET, SETUP_CODE) and the database connection (NETLIFY_DB_URL)
// are read from Netlify environment variables at runtime — they are never
// part of the code or the static files.
//
// Modern (v2) function: Netlify passes a web Request and the platform
// environment (Netlify.env). The Express app runs on a local port inside the
// function instance and each request is forwarded to it.
import http from 'node:http';

let ready = null;

function start() {
  // Platform variables (e.g. the Netlify Database URL) → process.env, before
  // the server code reads its configuration.
  const platform = globalThis.Netlify?.env?.toObject?.() || {};
  for (const [k, v] of Object.entries(platform)) if (process.env[k] === undefined && typeof v === 'string') process.env[k] = v;
  return import('../../server/app.js').then(({ createApp }) => new Promise((resolve, reject) => {
    const server = http.createServer(createApp());
    server.keepAliveTimeout = 60000;
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  }));
}

export default async (req, context) => {
  ready ??= start().catch((err) => {
    ready = null;
    throw err;
  });
  const base = await ready;
  const url = new URL(req.url);
  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
  if (context?.ip) headers.set('x-forwarded-for', context.ip);
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const res = await fetch(base + url.pathname + url.search, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: 'manual',
  });
  const out = new Headers(res.headers);
  out.delete('content-encoding');
  out.delete('content-length');
  out.delete('transfer-encoding');
  out.delete('connection');
  out.delete('keep-alive');
  // fetch merges multiple Set-Cookie headers; restore them one by one.
  out.delete('set-cookie');
  for (const c of res.headers.getSetCookie?.() || []) out.append('set-cookie', c);
  const empty = req.method === 'HEAD' || [101, 204, 205, 304].includes(res.status);
  return new Response(empty ? null : await res.arrayBuffer(), { status: res.status, headers: out });
};

export const config = { path: '/api/*' };
