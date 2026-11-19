// A tab left open across an update (or a browser that kept old scripts) can run an older version of the site.
// The build writes its id into /version.json and into build-id.js; when they differ the page says so —
// only when it starts or when the person comes back to the tab (no timers, one tiny static file).
import { BUILD_ID } from './build-id.js';

let last = 0;
let shown = false;

function banner() {
  if (shown) return;
  shown = true;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'update-note';
  b.textContent = '🔄 فيه تحديث جديد للموقع — اضغط هنا لتحديث الصفحة';
  b.addEventListener('click', () => location.reload());
  document.body.appendChild(b);
}

async function check(first) {
  if (BUILD_ID === 'dev' || Date.now() - last < 120000) return;
  last = Date.now();
  try {
    const r = await fetch('/version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const { v } = await r.json();
    if (!v || v === BUILD_ID) return;
    // just opened and already behind: reload once by itself (never in a loop); later on, only ask
    let done = null;
    try { done = sessionStorage.getItem('lx.verReload'); } catch { /* ignore */ }
    if (first && done !== v && !/^#\/(source|practice)/.test(location.hash)) {
      try { sessionStorage.setItem('lx.verReload', v); } catch { /* ignore */ }
      location.reload();
      return;
    }
    banner();
  } catch { /* offline, or no version file (local run): nothing to do */ }
}

export function watchForUpdates() {
  check(true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(false); });
}
