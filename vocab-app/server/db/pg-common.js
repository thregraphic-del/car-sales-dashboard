// Shared helpers for the two Postgres drivers (real Postgres and PGlite).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MIGRATIONS_DIR = path.join(ROOT, 'netlify', 'database', 'migrations');

/** Portable SQL (`?` placeholders, group_concat) → Postgres. */
export function toPg(sql) {
  let i = 0;
  return sql
    .replace(/group_concat\(([^)]+)\)/gi, "string_agg(($1)::text, ',')")
    .replace(/\?/g, () => `$${++i}`);
}

// COUNT(*) is bigint and NUMERIC is arbitrary precision: both arrive as
// strings. Values in this app are small, so convert them to numbers.
const NUMERIC_TYPES = new Set([20, 1700]);
export function normalizeRows(result) {
  const fields = (result.fields || []).filter((f) => NUMERIC_TYPES.has(f.dataTypeID));
  if (!fields.length) return result.rows;
  for (const row of result.rows) {
    for (const f of fields) if (row[f.name] !== null && row[f.name] !== undefined) row[f.name] = Number(row[f.name]);
  }
  return result.rows;
}

/** The migration scripts in order (the same ones Netlify applies on deploy). */
export function migrationScripts() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR).sort()
    .map((dir) => path.join(MIGRATIONS_DIR, dir, 'migration.sql'))
    .filter((f) => fs.existsSync(f))
    .map((f) => ({ name: path.basename(path.dirname(f)), sql: fs.readFileSync(f, 'utf8') }));
}
