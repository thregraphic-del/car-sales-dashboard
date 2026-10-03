// Small helpers shared by the route files: async handlers and input parsing.
import { httpError } from './lib/errors.js';

/** Wrap an async handler; a returned value is sent as JSON. */
export const wrap = (fn) => async (req, res, next) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (err) {
    next(err);
  }
};

/** Optional positive integer (query/body), else undefined. */
export function num(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 2 ** 31) throw httpError(400, 'قيمة رقمية غير صالحة.');
  return n;
}

/** Required id from a route parameter. */
export function idParam(req, name = 'id') {
  const n = num(req.params[name]);
  if (!n) throw httpError(400, 'معرّف غير صالح.');
  return n;
}

/** List of ids from an array or "1,2,3" (max 5000). */
export function idList(v, max = 5000) {
  const list = (Array.isArray(v) ? v : String(v ?? '').split(',')).filter((x) => x !== '' && x !== null && x !== undefined);
  if (list.length > max) throw httpError(413, 'عدد كبير جدًا من العناصر.');
  return list.map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

/** Optional string, trimmed and cut to max length. */
export function str(v, max = 200) {
  if (v === undefined || v === null) return undefined;
  return String(v).slice(0, max);
}

export const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
