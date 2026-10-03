// Server-side key/value settings (e.g. the generated session signing key).
// Never exposed through the API.
import { get, run } from '../db/index.js';

export async function getOrCreateSetting(key, create) {
  const row = await get('SELECT value FROM app_settings WHERE key = ?', key);
  if (row) return row.value;
  await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', key, create());
  return (await get('SELECT value FROM app_settings WHERE key = ?', key)).value;
}
