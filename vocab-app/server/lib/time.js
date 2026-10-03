// Calendar helpers in the learner's time zone (config.app.timezone), so
// "today", streaks and daily plans are correct even on a UTC server.
import { config } from '../config.js';

const fmtCache = new Map();
function partsFormatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }));
  }
  return fmtCache.get(tz);
}

function parts(date, tz) {
  const o = {};
  for (const p of partsFormatter(tz).formatToParts(date)) o[p.type] = p.value;
  return o;
}

/** YYYY-MM-DD of a moment in the configured time zone. */
export function localDate(d = new Date(), tz = config.app.timezone) {
  const p = parts(d instanceof Date ? d : new Date(d), tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Offset (ms) of the time zone from UTC at a given instant. */
function offsetMs(ts, tz) {
  const p = parts(new Date(ts), tz);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** The UTC instant of local midnight for a YYYY-MM-DD date. */
export function midnightOf(dateStr, tz = config.app.timezone) {
  const guess = Date.parse(`${dateStr}T00:00:00Z`);
  let ts = guess - offsetMs(guess, tz);
  ts = guess - offsetMs(ts, tz); // second pass handles DST edges
  return new Date(ts);
}

/** Local midnight `days` days ago (0 = today), as a Date. */
export function startOfDay(days = 0, tz = config.app.timezone) {
  const today = localDate(new Date(), tz);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return midnightOf(d.toISOString().slice(0, 10), tz);
}

/** End of the local day (23:59:59.999) as ISO. */
export function endOfTodayIso(tz = config.app.timezone) {
  return new Date(startOfDay(-1, tz).getTime() - 1).toISOString();
}

/** The day before a YYYY-MM-DD date. */
export function previousDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const nowIso = () => new Date().toISOString();
