// PGlite driver: a real Postgres engine running in-process (WASM). Used by the
// tests so every query is verified against Postgres, not only SQLite.
// DATABASE_URL=pglite → fresh in-memory database with the production schema.
import { toPg, normalizeRows, migrationScripts } from './pg-common.js';

export async function createDriver() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  for (const m of migrationScripts()) await db.exec(m.sql);

  // PGlite has one connection: serialize transactions.
  let chain = Promise.resolve();
  let inTx = false;
  const run = async (executor, sql, params) => {
    const r = await executor.query(toPg(sql), params);
    return { rows: normalizeRows(r), changes: r.affectedRows ?? 0 };
  };

  return {
    dialect: 'postgres',
    async query(sql, params, client) {
      if (client) return run(client, sql, params);
      if (inTx) await chain;
      return run(db, sql, params);
    },
    transaction(fn) {
      const p = chain.then(() => {
        inTx = true;
        return db.transaction((t) => fn(t)).finally(() => {
          inTx = false;
        });
      });
      chain = p.catch(() => {});
      return p;
    },
    async exec(sqlText) {
      await db.exec(sqlText);
    },
    async close() {
      await db.close();
    },
  };
}
