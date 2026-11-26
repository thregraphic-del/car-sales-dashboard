// 👋 A brand-new account (no words yet) is guided once, in this order:
//   1) a goal screen — how many new words and practice questions per day
//   2) the «أضف» page, with the three ready clips highlighted as a trial
//   3) inside the clip: every icon explained with «التالي»
//   4) the clip's settings page: every option explained, then back to the clip.
// Existing accounts (any word saved) never see it. It runs once and is remembered on the account.
import { state } from './state.js';
import { setGoalN, goalFor } from './goal.js';
import { openModal, closeModal, toast } from './ui.js';
import { api } from './api.js';

const FLAG = 'onb.step'; // sessionStorage: pick → tour → clipset
const get = () => { try { return sessionStorage.getItem(FLAG); } catch { return null; } };
const set = (v) => { try { if (v) sessionStorage.setItem(FLAG, v); else sessionStorage.removeItem(FLAG); } catch { /* ignore */ } };
export const onboardingStep = get;
export const setOnboardingStep = set;
const isDone = () => { try { return localStorage.getItem('tour.onboard') === '1'; } catch { return true; } };
export function finishOnboarding() {
  set(null);
  try { localStorage.setItem('tour.onboard', '1'); } catch { /* ignore */ }
  api.tourSeen('onboard').catch(() => {});
}

const WORDS = [5, 10, 15, 20];
const PRACTICE = [10, 20, 30, 50];

/** Call when the home page opens: true when the new-account guide took over. */
export function maybeOnboard() {
  if (isDone()) return false;
  if ((state.stats?.total || 0) > 0 || get()) { if ((state.stats?.total || 0) > 0) finishOnboarding(); return false; }
  goalScreen();
  return true;
}

function goalScreen() {
  let w = WORDS.includes(goalFor('pass')) ? goalFor('pass') : 10;
  let q = PRACTICE.includes(goalFor('practice')) ? goalFor('practice') : 20;
  const chips = (list, cur, k) => list.map((n) => `<button type="button" class="onb-chip${n === cur ? ' on' : ''}" data-${k}="${n}">${n}</button>`).join('');
  const box = openModal(`<div class="onb">
    <div class="onb-ic">🎯</div>
    <h2>أهلًا بك في 3Goal</h2>
    <p class="muted">خلّنا نحدد هدفك اليومي — تقدر تغيّره بعدين.</p>
    <div class="onb-q"><b>كم كلمة جديدة تبغى تتعلم كل يوم؟</b><div class="onb-chips" id="onbW">${chips(WORDS, w, 'w')}</div></div>
    <div class="onb-q"><b>كم سؤال تدريب تبغى تحل كل يوم؟</b><div class="onb-chips" id="onbQ">${chips(PRACTICE, q, 'q')}</div></div>
    <button type="button" class="btn primary lg" id="onbGo">التالي ←</button>
  </div>`);
  const pick = (sel, attr, setter) => box.querySelector(sel).addEventListener('click', (e) => {
    const b = e.target.closest(`[data-${attr}]`);
    if (!b) return;
    setter(Number(b.dataset[attr]));
    box.querySelectorAll(`${sel} .onb-chip`).forEach((x) => x.classList.toggle('on', x === b));
  });
  pick('#onbW', 'w', (n) => { w = n; });
  pick('#onbQ', 'q', (n) => { q = n; });
  const go = () => {
    setGoalN('pass', w);
    setGoalN('practice', q);
    set('pick');
    closeModal();
    location.hash = '#/add';
  };
  box.querySelector('#onbGo').addEventListener('click', go);
  box.querySelector('.modal-close')?.addEventListener('click', () => { set('pick'); location.hash = '#/add'; });
}

/** The «add» page: a banner that says the three clips are a trial. Returns the HTML (or ''). */
export const pickBannerHtml = () => (get() === 'pick'
  ? `<div class="onb-banner" id="onbBanner">
      <b class="onb-ban-title">هذي تجربة للموقع</b>
      <div class="onb-ban-cue"><span class="onb-arrow" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M24 6v30M11 25l13 14 13-14" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg></span><em>اختر مقطع من تحت ونوريك كيف يشتغل</em></div>
    </div>`
  : '');
export const onPicked = () => { if (get() === 'pick') set('tour'); };
export const toastDone = () => toast('🎉 جاهز! الحين ابدأ تتعلم');
