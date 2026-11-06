// 🔔 An estimate of the Netlify credits, with no background work at all:
// each production deploy is recorded once (on the first request it serves) and counts
// 15 credits; the owner enters the plan's credits and, once, what Netlify shows as left.
import { all, get, run } from '../db/index.js';

export const DEPLOY_COST = 15;
let recorded = false;

/** Called on requests: the first one served by a new deploy records it (one tiny write per deploy). */
export async function recordDeploy() {
  const id = process.env.LEXI_DEPLOY_ID;
  if (recorded || !id) return;
  recorded = true;
  await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', `deploy:${id}`, new Date().toISOString());
}

const SETTINGS = 'credits:settings';
export async function creditSettings() {
  try { return JSON.parse((await get('SELECT value FROM app_settings WHERE key = ?', SETTINGS))?.value || '{}'); } catch { return {}; }
}

export async function saveCreditSettings({ plan, left, cycleDay }) {
  const s = await creditSettings();
  if (Number.isFinite(plan) && plan > 0) s.plan = Math.round(plan);
  if (Number.isFinite(cycleDay) && cycleDay >= 1 && cycleDay <= 28) s.cycleDay = Math.round(cycleDay);
  if (Number.isFinite(left) && left >= 0) { s.left = Math.round(left); s.at = new Date().toISOString(); }
  await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', SETTINGS, JSON.stringify(s));
  return creditStatus();
}

/** {plan, used, left, pct, deploys, since, estimated} — numbers are estimates from the deploys. */
export async function creditStatus(now = new Date()) {
  const s = await creditSettings();
  const plan = s.plan || 300;
  const cycleDay = s.cycleDay || 1;
  // the start of the current billing month
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), cycleDay));
  if (start > now) start.setUTCMonth(start.getUTCMonth() - 1);
  const deploys = (await all("SELECT value FROM app_settings WHERE key LIKE 'deploy:%'")).map((r) => r.value);
  const since = s.at && new Date(s.at) > start ? s.at : start.toISOString();
  const n = deploys.filter((d) => d >= since).length;
  let left;
  if (s.at && new Date(s.at) > start && Number.isFinite(s.left)) left = s.left - n * DEPLOY_COST;
  else left = plan - n * DEPLOY_COST;
  left = Math.max(0, left);
  const used = Math.max(0, plan - left);
  return {
    plan, used, left, pct: Math.min(100, Math.round((100 * used) / plan)), deploys: n, deploy_cost: DEPLOY_COST,
    since, cycle_day: cycleDay, from_netlify: Boolean(s.at && new Date(s.at) > start), set: Boolean(s.plan),
  };
}
