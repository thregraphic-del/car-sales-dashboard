// "اقتراحاتكم": suggestions from learners to improve the site.
import { all, insert } from '../db/index.js';

export async function addFeedback(userId, { message, contact = null, page = null }) {
  return insert('INSERT INTO feedback (user_id, message, contact, page) VALUES (?,?,?,?)', userId || null, message, contact, page);
}

/** Newest first; the administrator sees everyone's, a learner only their own. */
export async function listFeedback(userId, { admin = false, limit = 200 } = {}) {
  return admin
    ? all('SELECT f.id, f.message, f.contact, f.page, f.created_at, u.username, u.name FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT ?', limit)
    : all('SELECT id, message, contact, page, created_at FROM feedback WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, limit);
}
