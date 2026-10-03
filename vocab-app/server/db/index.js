// Database layer: one async API over three drivers.
//   - Postgres (production, Netlify Database / DATABASE_URL)
//   - PGlite   (tests: real Postgres in-process, DATABASE_URL=pglite)
//   - SQLite   (local development, no setup)
// Queries are written once with `?` placeholders in portable SQL; the driver
// adapts them. Everything else in the app talks to the database through here.
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from '../config.js';

let driverPromise = null;
const txStore = new AsyncLocalStorage();

// Development/test drivers are imported through a variable so the production
// bundle (Netlify Function) contains only the Postgres driver.
const devDriver = (name) => import(new URL(`./${name}.js`, import.meta.url).href);

function chooseDriver() {
  const url = config.db.url;
  if (url === 'pglite' || url.startsWith('pglite:')) return devDriver('pglite').then((m) => m.createDriver(url));
  if (url) return import('./postgres.js').then((m) => m.createDriver(url));
  return devDriver('sqlite').then((m) => m.createDriver(config.db.sqlitePath));
}

export function driver() {
  if (!driverPromise) driverPromise = chooseDriver();
  return driverPromise;
}

export async function dialect() {
  return (await driver()).dialect;
}

const norm = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

async function query(sql, params) {
  const d = await driver();
  const client = txStore.getStore();
  return d.query(sql, norm(params), client);
}

/** All rows. */
export async function all(sql, ...params) {
  return (await query(sql, params)).rows;
}

/** First row or undefined. */
export async function get(sql, ...params) {
  return (await query(sql, params)).rows[0];
}

/** Statement without rows → {changes}. */
export async function run(sql, ...params) {
  const r = await query(sql, params);
  return { changes: r.changes };
}

/** INSERT … RETURNING id → the new id (number). */
export async function insert(sql, ...params) {
  const r = await query(`${sql.trim().replace(/;$/, '')} RETURNING id`, params);
  return Number(r.rows[0]?.id);
}

/** Run fn in a transaction. Nested calls join the outer transaction. */
export async function tx(fn) {
  if (txStore.getStore()) return fn();
  const d = await driver();
  return d.transaction((client) => txStore.run(client, fn));
}

/** Execute a multi-statement script (schema / migrations). */
export async function exec(sqlText) {
  return (await driver()).exec(sqlText);
}

export async function close() {
  if (!driverPromise) return;
  const d = await driverPromise;
  driverPromise = null;
  await d.close?.();
}

/** Insert many rows into a table with explicit columns (used by import/seed). */
export async function bulkInsert(table, columns, rows, { chunk = 200, conflict = '' } = {}) {
  if (!rows.length) return 0;
  const per = Math.max(1, Math.min(chunk, Math.floor(30000 / columns.length)));
  let n = 0;
  for (let i = 0; i < rows.length; i += per) {
    const part = rows.slice(i, i + per);
    const values = part.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    const params = part.flatMap((r) => columns.map((c) => r[c]));
    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values} ${conflict}`;
    n += (await query(sql, params)).changes ?? part.length;
  }
  return n;
}

/** After inserting explicit ids, move identity counters past them (Postgres). */
export async function resetSequences(tables) {
  const d = await driver();
  if (d.dialect === 'sqlite') return;
  for (const t of tables) {
    await query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`, []);
  }
}
