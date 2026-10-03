// Learner-named groups of words (many-to-many: a word can be in several).
import { all, get, run, insert, tx } from '../db/index.js';
import { config } from '../config.js';
import { httpError } from '../lib/errors.js';

const cleanName = (name) => {
  const clean = String(name || '').trim().slice(0, config.limits.groupNameChars);
  if (!clean) throw httpError(400, 'اكتب اسم المجموعة.');
  return clean;
};

/** Create a group; an existing group with the same name (any case) is returned instead. */
export async function createGroup(userId, name, color = null) {
  const clean = cleanName(name);
  const dup = await get('SELECT * FROM word_groups WHERE user_id = ? AND lower(name) = lower(?)', userId, clean);
  if (dup) return { ...dup, existed: true };
  const id = await insert('INSERT INTO word_groups (user_id, name, color) VALUES (?,?,?)', userId, clean, color);
  return { ...(await get('SELECT * FROM word_groups WHERE id = ?', id)), existed: false };
}

export async function renameGroup(userId, id, name) {
  const clean = cleanName(name);
  await ownGroup(userId, id);
  const dup = await get('SELECT id FROM word_groups WHERE user_id = ? AND lower(name) = lower(?) AND id <> ?', userId, clean, id);
  if (dup) throw httpError(409, 'عندك مجموعة بهذا الاسم.');
  await run('UPDATE word_groups SET name = ? WHERE id = ? AND user_id = ?', clean, id, userId);
  return get('SELECT * FROM word_groups WHERE id = ?', id);
}

/** Deleting a group keeps its words. */
export async function deleteGroup(userId, id) {
  await run('DELETE FROM word_groups WHERE id = ? AND user_id = ?', id, userId);
}

async function ownGroup(userId, groupId) {
  const g = await get('SELECT * FROM word_groups WHERE id = ? AND user_id = ?', groupId, userId);
  if (!g) throw httpError(404, 'لم نجد هذه المجموعة.');
  return g;
}

export async function addToGroup(userId, groupId, uvIds) {
  await ownGroup(userId, groupId);
  for (const uv of uvIds) {
    if (await get('SELECT 1 AS x FROM user_vocabulary WHERE id = ? AND user_id = ?', uv, userId)) {
      await run('INSERT INTO word_group_items (group_id, user_vocabulary_id) VALUES (?,?) ON CONFLICT DO NOTHING', groupId, uv);
    }
  }
}

export async function removeFromGroup(userId, groupId, uvIds) {
  await ownGroup(userId, groupId);
  for (const uv of uvIds) await run('DELETE FROM word_group_items WHERE group_id = ? AND user_vocabulary_id = ?', groupId, uv);
}

export async function groupIdsFor(uvId) {
  if (!uvId) return [];
  return (await all('SELECT group_id FROM word_group_items WHERE user_vocabulary_id = ? ORDER BY group_id', uvId)).map((r) => r.group_id);
}

/** Replace a word's group membership with exactly groupIds. */
export async function setWordGroups(userId, uvId, groupIds) {
  if (!await get('SELECT 1 AS x FROM user_vocabulary WHERE id = ? AND user_id = ?', uvId, userId)) throw httpError(404, 'لم نجد هذه الكلمة.');
  await tx(async () => {
    const want = new Set(groupIds.map(Number));
    for (const g of want) await ownGroup(userId, g);
    for (const g of await groupIdsFor(uvId)) if (!want.has(g)) await run('DELETE FROM word_group_items WHERE group_id = ? AND user_vocabulary_id = ?', g, uvId);
    for (const g of want) await run('INSERT INTO word_group_items (group_id, user_vocabulary_id) VALUES (?,?) ON CONFLICT DO NOTHING', g, uvId);
  });
  return groupIdsFor(uvId);
}
