// 🎯 The exact word of a rule in the line (e.g. «on»), and the other words of the same rule.
import { esc } from './ui.js';
import { GRAMMAR_ITEMS, itemIn } from './shared/grammar-items.js';

export { itemIn };

/** «🎯 الكلمة في هالجملة»: what it goes with, its uses, an example. */
export function wordFocusHtml(it) {
  return `<div class="g-box g-word">
    <b>🎯 الكلمة في هالجملة: <span class="g-w en" dir="ltr">${esc(it.word)}</span></b>
    <p><span class="g-lbl">تجي مع:</span> ${esc(it.with)}</p>
    <ul class="g-uses">${it.uses.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
    <div class="g-ex"><p class="en" dir="ltr">${esc(it.ex[0])}</p><p class="tiny muted">${esc(it.ex[1])}</p></div>
  </div>`;
}

/** «🔁 الباقين»: every other word of the rule in one line (all of them in the library). */
export function othersHtml(subId, current, all = false) {
  const list = (GRAMMAR_ITEMS[subId] || []).filter((x) => x !== current);
  if (!list.length) return '';
  const title = current ? '🔁 الباقين في نفس القاعدة' : '🔤 كلمات هالقاعدة';
  const rows = list.map((x) => `<li><span class="g-w en" dir="ltr">${esc(x.word)}</span><span><b class="g-lbl">${esc(x.with)}</b> — ${esc(x.uses[0])}${all && x.uses.length > 1 ? ` · ${x.uses.slice(1).map(esc).join(' · ')}` : ''}</span></li>`).join('');
  return `<details class="g-box g-others"${all ? '' : ' open'}><summary><b>${title}</b> <span class="tiny muted">(${list.length})</span></summary><ul>${rows}</ul></details>`;
}

import { GRAMMAR_FORMS, FORM_LABELS, parseFormula } from './shared/grammar-forms.js';

const formRow = (label, s) => {
  const parts = parseFormula(s);
  if (!parts.length) return '';
  const blocks = parts.map((p) => `<span class="g-fp"><b class="en">${esc(p.en)}</b>${p.ar ? `<small>${esc(p.ar)}</small>` : ''}</span>`).join('<span class="g-arrow" aria-hidden="true">→</span>');
  return `<div class="g-f-row"><span class="g-f-k">${label}</span><div class="g-f" dir="ltr">${blocks}</div></div>`;
};

/** 🧩 How the rule is built — left → right blocks for ✅ / ❌ / ❓, signal words and «⚠️ انتبه». */
export function formulaHtml(sub) {
  const fm = GRAMMAR_FORMS[sub.id];
  if (!fm) return `<div class="g-box"><b>🧩 التكوين</b><p>${esc(sub.form)}</p></div>`;
  const lab = FORM_LABELS[sub.id] || [];
  const rows = ['✅ جملة', '❌ نفي', '❓ سؤال'].map((d, i) => formRow(lab[i] || d, fm.f[i] || '')).join('');
  return `<div class="g-box g-form"><b>🧩 التكوين <span class="tiny muted">· اقرأ من اليسار ➜</span></b>${rows}</div>
    ${fm.signs ? `<div class="g-box g-signs"><b>🔎 كلمات تدل عليها</b><p class="en" dir="ltr">${esc(fm.signs)}</p></div>` : ''}
    ${fm.tip ? `<div class="g-box g-tip"><b>⚠️ انتبه</b><p>${esc(fm.tip)}</p></div>` : ''}`;
}
