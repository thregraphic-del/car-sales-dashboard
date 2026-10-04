// Accounts: profile settings and login. Every learner owns their own data;
// the first account with a password is the administrator.
import { get, run, insert } from '../db/index.js';

// The single learner of the local app (no login) and the first account.
export const DEFAULT_USER_ID = 1;

export async function getUser(id) {
  return (await get('SELECT * FROM users WHERE id = ?', id)) || null;
}

/** The user row, created on first use (local single-user mode). */
export async function ensureUser(id = DEFAULT_USER_ID) {
  const u = await getUser(id);
  if (u) return u;
  await run('INSERT INTO users (id, name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING', id, 'Learner');
  return getUser(id);
}

export async function updateUser(id, patch) {
  for (const key of ['name', 'daily_goal', 'speak_arabic', 'speech_rate']) {
    if (patch[key] !== undefined) await run(`UPDATE users SET ${key} = ? WHERE id = ?`, patch[key], id);
  }
  return getUser(id);
}

export async function findByUsername(username) {
  return (await get('SELECT * FROM users WHERE lower(username) = lower(?)', username)) || null;
}

export async function setCredentials(id, username, passwordHash) {
  await run('UPDATE users SET username = ?, password_hash = ? WHERE id = ?', username, passwordHash, id);
}

/** Number of accounts that can sign in. */
export async function accountCount() {
  return (await get('SELECT COUNT(*) AS n FROM users WHERE password_hash IS NOT NULL')).n;
}

export async function ownerExists() {
  return (await accountCount()) > 0;
}

/**
 * Create a login. The very first account becomes the administrator and takes
 * over user 1 when it exists without a login (data from the single-user era).
 */
export async function createAccount({ username, passwordHash, name }) {
  const first = !(await ownerExists());
  const role = first ? 'admin' : 'user';
  const legacy = first ? await get('SELECT id FROM users WHERE id = ? AND password_hash IS NULL', DEFAULT_USER_ID) : null;
  if (legacy) {
    await run('UPDATE users SET username = ?, password_hash = ?, role = ?, name = COALESCE(?, name) WHERE id = ?', username, passwordHash, role, name || null, legacy.id);
    return getUser(legacy.id);
  }
  const id = await insert('INSERT INTO users (name, username, password_hash, role) VALUES (?,?,?,?)', name || username, username, passwordHash, role);
  return getUser(id);
}

/** What the browser may see — never the password hash. */
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    daily_goal: u.daily_goal,
    speak_arabic: u.speak_arabic,
    speech_rate: u.speech_rate,
    username: u.username || null,
    role: u.role || 'user',
    created_at: u.created_at,
  };
}
