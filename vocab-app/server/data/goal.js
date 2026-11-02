// Daily goal while watching: the distinct words a learner went through today
// (opened, or saved one by one — "save all" does not count).
import { get, run } from '../db/index.js';
import { localDate } from '../lib/time.js';

async function goalOf(userId) {
  return Number((await get('SELECT daily_goal FROM users WHERE id = ?', userId))?.daily_goal) || 10;
}

export async function viewsToday(userId) {
  const count = Number((await get('SELECT COUNT(*) AS n FROM word_views WHERE user_id = ? AND day = ?', userId, localDate())).n);
  return { count, goal: await goalOf(userId) };
}

/** Count a word for today; just_reached is true on the word that completes the goal. */
export async function recordView(userId, vocabularyId) {
  const day = localDate();
  const before = Number((await get('SELECT COUNT(*) AS n FROM word_views WHERE user_id = ? AND day = ?', userId, day)).n);
  await run('INSERT INTO word_views (user_id, day, vocabulary_id) VALUES (?,?,?) ON CONFLICT DO NOTHING', userId, day, vocabularyId);
  const count = Number((await get('SELECT COUNT(*) AS n FROM word_views WHERE user_id = ? AND day = ?', userId, day)).n);
  const goal = await goalOf(userId);
  return { count, goal, just_reached: before < goal && count >= goal };
}
