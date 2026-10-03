// The learner's account: profile settings and (on the website) owner login.
import { get, run } from '../db/index.js';

export const DEFAULT_USER_ID = 1;

export async function getUser(id) {
  return (await get('SELECT * FROM users WHERE id = ?', id)) || null;
}

/** The user row, created on first use. */
export async function ensureUser(id = DEFAULT_USER_ID) {
  const u = await getUser(id);
  if (u) return u;
  await run('INSERT INTO users (id, name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING', id, 'Learner');
  return getUser(id);
}

export async function updateUser(id, patch) {
  await ensureUser(id);
  for (const key of ['name', 'daily_goal', 'speak_arabic', 'speech_rate']) {
    if (patch[key] !== undefined) await run(`UPDATE users SET ${key} = ? WHERE id = ?`, patch[key], id);
  }
  return ensureUser(id);
}

export async function findByUsername(username) {
  return (await get('SELECT * FROM users WHERE lower(username) = lower(?)', username)) || null;
}

export async function setCredentials(id, username, passwordHash) {
  await ensureUser(id);
  await run('UPDATE users SET username = ?, password_hash = ? WHERE id = ?', username, passwordHash, id);
}

export async function ownerExists() {
  return Boolean(await get('SELECT 1 AS x FROM users WHERE password_hash IS NOT NULL'));
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
    created_at: u.created_at,
  };
}
