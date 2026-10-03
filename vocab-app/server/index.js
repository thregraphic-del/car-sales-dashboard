// Local development server: the API plus the static frontend on one port.
// Production uses netlify/functions/api.mjs (API) and Netlify's CDN (public/).
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, aiConfigured } from './config.js';
import { createApp } from './app.js';
import { driver } from './db/index.js';
import { seedIfEmpty } from './data/demo.js';
import { OFFLINE_MESSAGE_EN } from './services/ai.js';
import { ttsConfigured } from './services/tts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createLocalServer() {
  const app = createApp();
  // no-cache: the browser revalidates every file, so an update is never hidden.
  app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));
  return app;
}

async function main() {
  const d = await driver();
  // Local single-user mode starts with demo data; with login enabled (like the
  // public site) the account starts empty and the owner chooses.
  const seeded = config.auth.required ? null : await seedIfEmpty();
  if (seeded) console.log('First run — demo data created:', seeded);
  const port = config.app.port;
  const server = createLocalServer().listen(port, () => {
    console.log(`LexiTube v${config.app.version} running on http://localhost:${port}`);
    console.log(`  project folder: ${ROOT}`);
    console.log(`  database: ${d.dialect}${d.file ? ` (${path.relative(ROOT, d.file)})` : ''}`);
    console.log(`  AI: ${aiConfigured() ? `OpenRouter (${config.ai.model()}) — offline dictionary first, results cached` : OFFLINE_MESSAGE_EN}`);
    console.log(`  text-to-speech: ${ttsConfigured() ? config.tts.provider : 'browser voices'}`);
    console.log(`  login: ${config.auth.required ? 'required (SESSION_SECRET set)' : 'off (local single user)'}`);
  });
  // Port already taken (usually an older LexiTube still running): say which.
  server.on('error', async (err) => {
    if (err.code !== 'EADDRINUSE') throw err;
    let other = null;
    try {
      other = await (await fetch(`http://127.0.0.1:${port}/api/version`)).json();
    } catch {
      /* not LexiTube */
    }
    console.error('');
    console.error(`✖ Port ${port} is already in use — this copy (v${config.app.version}) did NOT start.`);
    if (other?.version) console.error(`  Another LexiTube v${other.version} is running on that port.`);
    console.error('  Close the other LexiTube window (or press Ctrl+C in it), then start this one again.');
    console.error(`  المنفذ ${port} مستخدم — أغلق نافذة LexiTube القديمة ثم شغّل هذه النسخة من جديد.`);
    process.exit(1);
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) main();
