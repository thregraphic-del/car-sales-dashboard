// Test setup shared by the API tests: a fresh database (SQLite by default,
// or a real Postgres engine with TEST_DB=pglite) and the app on a free port.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function freshDatabase(prefix = 'lexitube-') {
  delete process.env.NETLIFY_DB_URL;
  if (process.env.TEST_DB === 'pglite') {
    process.env.DATABASE_URL = 'pglite';
    return { cleanup: () => {} };
  }
  delete process.env.DATABASE_URL;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  return { cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** Start the API (with demo data unless seed=false). Returns {base, close}. */
export async function startApp({ seed = true } = {}) {
  const { createApp } = await import('../server/app.js');
  if (seed) {
    const { seedIfEmpty } = await import('../server/data/demo.js');
    await seedIfEmpty();
  }
  const server = await new Promise((resolve) => {
    const s = createApp().listen(0, () => resolve(s));
  });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      server.close();
      await (await import('../server/db/index.js')).close();
    },
  };
}
