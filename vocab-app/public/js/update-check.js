// A tab left open across an update (or a browser that kept old scripts) can run an older version of the site.
// The build writes its id into /version.json and into build-id.js. When they differ the page updates ITSELF — no message, no button:
//   · at once when the person comes back to the tab or opens the site, if nothing would be lost;
//   · otherwise (a video is playing, a practice round is running, a window or a half-written text is open) at the next page change.
// Only when it starts or when the person comes back to the tab (no timers, one tiny static file). Never more than once per new version.
import { BUILD_ID } from './build-id.js';

let last = 0;
let behind = '';

const typing = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && String(el.value || '').trim().length > 0;
};
// something would be lost by a reload right now
const busy = () => !!document.querySelector('#modalRoot.open .modal') || /^#\/(source|practice)/.test(location.hash) || typing();

function reloadOnce() {
  let done = null;
  try { done = sessionStorage.getItem('lx.verReload'); } catch { /* ignore */ }
  if (done === behind) return; // already tried for this version (a slow cache): never a loop
  try { sessionStorage.setItem('lx.verReload', behind); } catch { /* ignore */ }
  location.reload();
}

async function check() {
  if (BUILD_ID === 'dev' || Date.now() - last < 120000) return;
  last = Date.now();
  try {
    const r = await fetch('/version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const { v } = await r.json();
    if (!v || v === BUILD_ID) return;
    behind = v;
    if (!busy()) reloadOnce();
  } catch { /* offline, or no version file (local run): nothing to do */ }
}

export function watchForUpdates() {
  check();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  // the next page change carries the new version along (the page is being replaced anyway)
  window.addEventListener('hashchange', () => { if (behind) reloadOnce(); });
}
