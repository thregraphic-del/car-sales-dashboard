// Build step (Netlify runs it before every deploy):
//  1. the API module graph loads (syntax / import errors fail the deploy)
//  2. nothing that looks like a secret is inside the published static files
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createApp } = await import('../server/app.js');
createApp();

const SECRET = /(sk-or-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{20,}|OPENROUTER_API_KEY\s*=|SESSION_SECRET\s*=|BEGIN [A-Z ]*PRIVATE KEY)/;
const bad = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (SECRET.test(fs.readFileSync(p, 'utf8'))) bad.push(path.relative(root, p));
  }
})(path.join(root, 'public'));
if (bad.length) {
  console.error('Possible secret in published files:', bad);
  process.exit(1);
}
// On Netlify: stamp this build, so an open tab can tell it is behind (see public/js/update-check.js)
if (process.env.NETLIFY) {
  const id = String(process.env.COMMIT_REF || process.env.DEPLOY_ID || Date.now()).slice(0, 12);
  fs.writeFileSync(path.join(root, 'public/js/build-id.js'), `export const BUILD_ID = '${id}';\n`);
  fs.writeFileSync(path.join(root, 'public/version.json'), JSON.stringify({ v: id }));
  // the first page is preloaded under the same versioned address the app will ask for (so the early download is reused)
  const indexFile = path.join(root, 'public/index.html');
  fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8').replace('/js/pages/today.js?v=dev', `/js/pages/today.js?v=${id}`));
  console.log(`build stamped ${id}`);
}
console.log('build check ok: API loads, no secrets in public/');
