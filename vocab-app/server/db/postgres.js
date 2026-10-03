// Postgres driver (production). On Netlify the connection comes from
// @netlify/database (Netlify Database); elsewhere from DATABASE_URL.
// The schema is created by netlify/database/migrations, which Netlify applies
// on every deploy; for a plain DATABASE_URL we apply them here once.
import { toPg, normalizeRows, migrationScripts } from './pg-common.js';
import { config } from '../config.js';

async function openPool(url) {
  if (config.db.netlify) {
    const { getDatabase } = await import('@netlify/database');
    return { pool: getDatabase().pool, managed: true };
  }
  const pg = (await import('pg')).default;
  const pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10000 });
  return { pool, managed: false };
}

export async function createDriver(url) {
  const { pool, managed } = await openPool(url);
  pool.on?.('error', () => {}); // idle client errors must not crash the function

  if (!managed) {
    const { rows } = await pool.query(`SELECT to_regclass('public.users') AS t`);
    if (!rows[0].t) for (const m of migrationScripts()) await pool.query(m.sql);
  }

  const run = async (executor, sql, params) => {
    const r = await executor.query(toPg(sql), params);
    return { rows: normalizeRows(r), changes: r.rowCount ?? 0 };
  };

  return {
    dialect: 'postgres',
    query: (sql, params, client) => run(client || pool, sql, params),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async exec(sqlText) {
      await pool.query(sqlText);
    },
    async close() {
      await pool.end?.();
    },
  };
}
