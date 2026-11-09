// Reusable pieces: word rows, the in-context word panel, the full word card
// and the group picker. The same word UI appears everywhere a word appears.
import { api } from './api.js';
import { speak } from './audio.js';
import { state, loadGroups, groupName } from './state.js';
import {
  esc, icon, levelChip, statusChips, typeLabel, fmtTime, highlight, openModal, closeModal, toast, relDate, $, usageDot, usageLegend,
} from './ui.js';

export const BAND_AR = { function: 'كلمة نحوية', basic: 'كلمة أساسية', useful: 'مفيدة', advanced: 'متقدمة', specialized: 'متخصصة' };

/* -------------------------------------------------------------- rows */

export function wordRowHtml(w, { selectable = false, selected = false, extra = '' } = {}) {
  const groups = (w.group_ids || []).map(groupName).filter(Boolean);
  return `
    <div class="word-row ${selectable ? 'check-mode' : ''}" data-id="${w.uv_id}">
      ${selectable ? `<input type="checkbox" class="check" data-act="select" ${selected ? 'checked' : ''} aria-label="تحديد">` : ''}
      <div style="min-width:0">
        <div class="en-row en">${usageDot(w.usage)}<span class="term u-t-${esc(w.usage || '')}">${esc(w.term)}</span>${levelChip(w.level)}${extra}</div>
        <div class="meaning">${w.arabic ? esc(w.arabic) : '<span class="muted">بدون معنى بعد</span>'}</div>
        ${groups.length || statusChips(w) ? `<div class="meta">${statusChips(w)}${groups.map((g) => `<span class="chip ar-chip group-chip">${esc(g)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="actions"><button class="btn icon sm ghost" data-act="listen" aria-label="استمع">${icon.speaker}</button></div>
    </div>`;
}

export function bindSpeech(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-say]');
    if (!b) return;
    e.stopPropagation();
    speak(b.dataset.say, { rate: Number(b.dataset.rate) || 1, lang: b.dataset.lang || 'en' }).catch(() => toast('الصوت غير مدعوم في هذا المتصفح'));
  });
}

/** Open a word list row → full card; listen button speaks. */
export function bindWordList(container, getWords, { onChange } = {}) {
  container.addEventListener('click', (e) => {
    const row = e.target.closest('.word-row');
    if (!row) return;
    const w = getWords().find((x) => x.uv_id === Number(row.dataset.id));
    if (!w) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'select') return;
    if (act === 'listen') {
      e.stopPropagation();
      speak(w.term).catch(() => toast('الصوت غير مدعوم في هذا المتصفح'));
      return;
    }
    openWordCard(w.uv_id, { onChange });
  });
}

/* ------------------------------------------------------- shared blocks */

function listenRow(text) {
  return `<span class="listen-mini"><button class="btn icon sm ghost" data-say="${esc(text)}" data-rate="1" aria-label="استمع">${icon.speaker}</button></span>`; // tap 🔊 twice quickly = slow
}

function headHtml(w, { big = false } = {}) {
  return `
    <div class="wp-head">
      <div class="en" style="min-width:0">
        <div class="${big ? 'wd-term' : 'wp-term'}">${esc(w.term)}</div>
        <div class="wd-ipa">${listenRow(w.term)}</div>
      </div>
    </div>
    <div class="row wrap" style="gap:6px;margin-top:6px">${levelChip(w.level)}${typeLabel(w) ? `<span class="chip ar-chip">${esc(typeLabel(w))}</span>` : ''}${w.band === 'specialized' ? '<span class="chip ar-chip">متخصصة</span>' : ''}</div>`;
}

function meaningHtml(w) {
  const general = w.arabic_general && w.arabic && w.arabic_general !== w.arabic ? `<div class="tiny muted" style="margin-top:2px">المعنى العام: ${esc(w.arabic_general)}</div>` : '';
  return `
    <div class="wp-meaning">${w.arabic ? esc(w.arabic) : '<span class="muted" style="font-size:15px;font-weight:500">ما فيه معنى محفوظ بعد</span>'}</div>
    ${general}
    ${w.simple_english ? `<p class="en ink-2 wp-simple">${esc(w.simple_english)}</p>` : ''}`;
}

function sentenceHtml(sentence, arabic, term, { time, sourceId } = {}) {
  if (!sentence) return '';
  return `<div class="quote wp-quote"><p class="en">${highlight(sentence, term)}</p>${arabic ? `<p class="small ink-2" style="margin-top:4px">${esc(arabic)}</p>` : ''}
    ${time !== undefined && time !== null && sourceId ? `<a class="ts-btn" href="#/source/${sourceId}?t=${time}" data-close style="margin-top:6px">▶ ${fmtTime(time)}</a>` : ''}</div>`;
}

/* ------------------------------------------------------- group picker */

/** Chips to put a saved word into groups; includes inline "new group". */
export function groupPickerHtml(selected = []) {
  const sel = new Set(selected);
  return `<div class="group-picker">
    ${state.groups.map((g) => `<button type="button" class="gchip ${sel.has(g.id) ? 'on' : ''}" data-gid="${g.id}">${sel.has(g.id) ? '✓ ' : '+ '}${esc(g.name)}</button>`).join('')}
    <button type="button" class="gchip new" data-gnew>+ مجموعة جديدة</button>
  </div>`;
}

/** Wire a picker. onToggle(groupId, on) must persist; returns new selection. */
export function bindGroupPicker(root, getSelected, onToggle) {
  root.addEventListener('click', async (e) => {
    const chip = e.target.closest('.gchip');
    if (!chip || !root.contains(chip)) return;
    e.stopPropagation();
    let gid = Number(chip.dataset.gid);
    if (chip.hasAttribute('data-gnew')) {
      const name = prompt('اسم المجموعة الجديدة (مثال: Finance، Work، University)');
      if (!name?.trim()) return;
      try {
        const g = await api.createGroup(name.trim());
        await loadGroups();
        gid = g.id;
        if (g.existed) toast(`المجموعة "${g.name}" موجودة — أضفنا الكلمة إليها`);
      } catch (err) {
        return toast(err.message);
      }
    }
    const on = !getSelected().includes(gid);
    try {
      await onToggle(gid, on);
      const picker = root.querySelector('.group-picker');
      if (picker) picker.outerHTML = groupPickerHtml(getSelected());
    } catch (err) {
      toast(err.message);
    }
  });
}

/* ------------------------------------------------- in-context word panel */

let panelEl = null;
let panelOnClose = null;
export function closeWordPanel() {
  (panelEl?.closest('.wp-overlay') || panelEl)?.remove();
  panelEl = null;
  const cb = panelOnClose;
  panelOnClose = null;
  cb?.();
  document.removeEventListener('keydown', onPanelKey);
  document.removeEventListener('pointerdown', onOutside, true);
}
function onPanelKey(e) {
  if (e.key === 'Escape') closeWordPanel();
}
function onOutside(e) {
  if (panelEl && !panelEl.contains(e.target) && !e.target.closest('.tok, .mark')) closeWordPanel();
}
export const isPanelOpen = () => !!panelEl;

// The word panel sits in a full-screen layer that centres it (sheet from the
// bottom on phones) inside the space the browser really shows (Safari's bars
// included), so it is never cut at the top or bottom; it scrolls inside.
function placePanel(el) {
  const sheet = window.matchMedia('(max-width: 720px)').matches;
  const layer = document.createElement('div');
  layer.className = `wp-overlay${sheet ? ' is-sheet' : ''}`;
  el.classList.add(sheet ? 'sheet' : 'centered');
  document.body.appendChild(layer);
  layer.appendChild(el);
  if (sheet) {
    // Swipe the sheet down to close it.
    let y0 = null;
    el.addEventListener('touchstart', (e) => { y0 = el.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) el.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0;
      y0 = null;
      if (dy > 90) closeWordPanel();
      else el.style.transform = '';
    });
  }
}

/**
 * Show a word in context without leaving the page.
 * query: {line_id, word, vocabulary_id}; onChange(info) after save/groups.
 */
const formsMemo = new Map();
function loadForms(term) {
  const key = String(term || '').toLowerCase();
  if (!formsMemo.has(key)) {
    formsMemo.set(key, api.wordForms(key)
      .then((r) => ({ ...r, forms: (r.forms || []).filter((f) => /^[a-z]/i.test(formTerm(f))) })) // English forms only
      .catch((err) => { formsMemo.delete(key); throw err; }));
  }
  return formsMemo.get(key);
}

const formTerm = (f) => String(f.word || f.form || '').split(/[(/,]/)[0].trim();
const POS_EN = { 'فعل': 'verb', 'اسم': 'noun', 'صفة': 'adjective', 'ظرف': 'adverb', 'اسم فاعل': 'noun' };

/** The simplest (dictionary) form, shown right under the word. */
function baseHtml(forms, term) {
  if (!forms?.base) return '';
  const same = forms.base.toLowerCase() === String(term || '').toLowerCase();
  if (same) return '';
  return `<div class="wp-base"><span class="tiny muted">الأصل</span>
    <b class="en" dir="ltr">${esc(forms.base)}</b> ${listenRow(forms.base)}</div>`;
}

/** "All forms of the word": verb / noun / adjective… each with an example and its own Save. */
function formsHtml(forms, savedForms = new Set()) {
  if (!forms) return '';
  if (forms.loading) return '<div class="wp-forms tiny muted"><span class="spinner"></span> نجلب صيغ الكلمة…</div>';
  if (forms.error || !forms.forms?.length) return forms.error ? `<p class="tiny muted wp-forms">صيغ الكلمة: ${esc(forms.error)}</p>` : '';
  return `<details class="wp-forms" open><summary class="hidden"></summary>
    ${forms.forms.map((f, k) => `<div class="wf"><div class="wf-head"><span class="wf-pos">${esc(f.pos)}</span>${usageDot(f.usage)}<b class="en u-t-${esc(f.usage || '')}" dir="ltr">${esc(formTerm(f))}</b>${f.form && f.form.trim() !== formTerm(f) ? ` <span class="tiny muted en-inline">${esc(f.form)}</span>` : ''} ${listenRow(formTerm(f))}${savedForms.has(k) ? `<button class="btn icon sm saved wf-save" disabled aria-label="محفوظة" title="محفوظة">${icon.check}</button>` : `<button class="btn icon sm ghost wf-save" data-form="${k}" aria-label="احفظ" title="احفظ">${icon.bookmark}</button>`}</div>
      <div class="small ink-2">${esc(f.arabic)}</div>
      ${f.example ? `<p class="en small" dir="ltr">${esc(f.example)}</p>${f.example_ar ? `<p class="tiny ink-2">${esc(f.example_ar)}</p>` : ''}` : ''}</div>`).join('')}</details>`;
}

export async function openWordPanel(anchor, query, { onChange, onClose } = {}) {
  panelOnClose = null; // switching to another word is not "closing"
  closeWordPanel();
  panelOnClose = onClose || null;
  const el = document.createElement('div');
  el.className = 'word-pop';
  el.innerHTML = '<div class="wp-loading"><span class="spinner"></span> جارٍ البحث…</div>';
  placePanel(el);
  panelEl = el;
  document.addEventListener('keydown', onPanelKey);
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
  bindSpeech(el);

  let info;
  try {
    info = await api.lookup(query);
    if (info.goal) window.dispatchEvent(new CustomEvent('lexitube:goal', { detail: info.goal }));
  } catch (err) {
    if (panelEl === el) el.innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    return;
  }
  if (panelEl !== el) return;

  const render = () => {
    if (!info.found) {
      el.innerHTML = `
        <button class="btn icon sm ghost wp-close" aria-label="إغلاق">${icon.x}</button>
        <div class="wp-term en">${esc(info.word)} ${listenRow(info.word)}</div>
        <p class="small ink-2" style="margin-top:8px">${info.tier === 'function' ? 'كلمة نحوية شائعة — لا تحتاج حفظًا.'
          : info.tier === 'basic' ? 'كلمة أساسية (A1–A2) — مهمة، احفظها إن لم تكن متأكدًا منها.'
          : 'ما فيه معنى لهذه الكلمة في القاموس المحلي.'}</p>
        ${baseHtml(forms, info.word)}
        ${info.ai_error ? `<p class="tiny muted">${esc(info.ai_error)}</p>` : ''}
        ${formsHtml(forms, savedForms)}
        ${info.tier !== 'function' ? `<div class="wp-actions wp-sticky"><button class="btn primary" data-act="save-own">${icon.bookmark} احفظها بمعناك</button></div>` : ''}`;
      return;
    }
    const saved = info.state === 'saved';
    el.innerHTML = `
      <button class="btn icon sm ghost wp-close" aria-label="إغلاق">${icon.x}</button>
      ${headHtml(info)}
      ${baseHtml(forms, info.term)}
      ${meaningHtml(info)}
      ${synHtml()}
      ${info.context_note ? `<p class="small ctx-note">💡 ${esc(info.context_note)}</p>` : ''}
      ${info.contextual ? '' : info.arabic ? '<div class="tiny muted">معنى عام من القاموس (ليس حسب هذه الجملة)</div>' : ''}
      ${info.can_explain ? '<button class="btn sm ghost explain-btn" data-act="explain">✨ اشرح معناها في هذه الجملة</button>' : ''}
      ${info.ai_error ? `<p class="tiny muted">${esc(info.ai_error)}</p>` : ''}
      ${formsHtml(forms, savedForms)}
      ${sentenceHtml(info.context_sentence, info.context_arabic, info.term)}
      ${(() => {
        const ex = (info.examples || []).find((e) => e.kind === 'example' && e.sentence !== info.context_sentence) || (info.examples || []).find((e) => e.kind === 'easy');
        return ex ? `<div class="tiny muted" style="margin-top:8px">مثال</div><p class="en small">${highlight(ex.sentence, info.term)}</p>${ex.arabic ? `<p class="tiny ink-2">${esc(ex.arabic)}</p>` : ''}` : '';
      })()}
      ${saved ? `<div class="wp-groups"><div class="tiny muted" style="margin-bottom:6px">المجموعات</div>${groupPickerHtml(info.groups || [])}</div>` : ''}
      <div class="wp-actions wp-sticky">
        ${saved ? `<button class="btn sm saved" data-act="noop">${icon.check} محفوظة ✓</button>` : `<button class="btn primary" data-act="save">${icon.bookmark} حفظ «${esc(info.term)}»</button>`}
        ${saved ? `<button class="btn sm ghost" data-act="details">التفاصيل</button>` : `<button class="btn sm ghost" data-act="known" title="أعرفها — لا تقترحها عليّ مرة أخرى">أعرفها ✓</button>`}
      </div>`;
  };
  // Easier, more common words with the same meaning: just the word and a short Arabic, tap for details.
  // Same meaning only (strict AI list, saved once per word); without AI, nothing — never other meanings.
  let syns = [];
  function synHtml() {
    if (!syns.length) return '';
    return `<div class="syn-row"><span class="tiny muted">أسهل وأشهر:</span>${syns.map((x) => `<button type="button" class="syn-chip" data-syn="${esc(x.word)}"><b class="en">${esc(x.word)}</b>${x.arabic ? `<span>${esc(x.arabic)}</span>` : ''}</button>`).join('')}</div>`;
  }
  if (info.found && info.tier !== 'function' && state.config?.ai?.configured) {
    api.synonyms(info.term, (info.user_arabic || info.arabic || '').split(/[،,؛]/)[0].trim()).then((r) => {
      if (panelEl !== el || !r.items?.length) return;
      syns = r.items.slice(0, 5);
      render();
    }).catch(() => {});
  }
  const formsWord = info.found ? info.term : info.word;
  let forms = formsWord && info.tier !== 'function' && state.config?.ai?.configured ? { loading: true } : null;
  const savedForms = new Set();
  render();
  if (forms) {
    loadForms(formsWord).then((r) => { forms = r; }, (err) => { forms = { error: err.message }; })
      .finally(() => { if (panelEl === el) render(); });
  }

  bindGroupPicker(el, () => info.groups || [], async (gid, on) => {
    const next = on ? [...(info.groups || []), gid] : (info.groups || []).filter((g) => g !== gid);
    const r = await api.setWordGroups(info.uv_id, next);
    info.groups = r.group_ids;
    onChange?.(info);
  });

  el.addEventListener('click', async (e) => {
    if (e.target.closest('.wp-close')) return closeWordPanel();
    const sy = e.target.closest('[data-syn]');
    if (sy) return openWordPanel(anchor, { word: sy.dataset.syn }, { onChange, onClose });
    const fb = e.target.closest('.wf-save[data-form]');
    if (fb && forms?.forms) {
      const k = Number(fb.dataset.form);
      const f = forms.forms[k];
      fb.disabled = true;
      try {
        const r = await api.importSave([{ term: formTerm(f), arabic: f.arabic, meaning_from: 'ai', part_of_speech: POS_EN[f.pos] || null, examples: f.example ? [{ sentence: f.example, arabic: f.example_ar || null }] : [] }]);
        savedForms.add(k);
        toast(r.results?.[0]?.result === 'unchanged' ? `موجودة عندك ✓ ${formTerm(f)}` : `تم الحفظ ✓ ${formTerm(f)}`);
        render();
        onChange?.(info);
      } catch (err) {
        fb.disabled = false;
        toast(err.message);
      }
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    try {
      if (act === 'save') {
        const r = await api.saveWord(info.vocabulary_id, info.occurrence_id);
        if (r.goal) window.dispatchEvent(new CustomEvent('lexitube:goal', { detail: r.goal }));
        Object.assign(info, { state: 'saved', uv_id: r.uv_id, groups: r.groups });
        toast(r.already ? 'موجودة عندك ✓' : `تم الحفظ ✓ ${info.term}`);
        render();
        onChange?.(info);
        if (onClose) setTimeout(() => panelEl === el && closeWordPanel(), 900); // back to the video
      }
      if (act === 'explain') {
        const btn = e.target.closest('[data-act]');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> نشرح المعنى في هذه الجملة…';
        const groups = info.groups;
        info = { ...(await api.lookup({ ...query, vocabulary_id: info.vocabulary_id, context: 1 })), groups: groups ?? info.groups };
        render();
        onChange?.(info);
      }
      if (act === 'known') {
        await api.dismissWord(info.vocabulary_id);
        toast(`حسنًا — لن نقترح «${info.term}» عليك بعد الحين`);
        onChange?.(info);
        closeWordPanel();
        return;
      }
      if (act === 'details') {
        closeWordPanel();
        openWordCard(info.uv_id, { onChange });
      }
      if (act === 'save-own') {
        const meaning = prompt(`ما معنى "${info.word}" بالعربية؟ (اختياري)`) ?? null;
        if (meaning === null) return;
        const res = await api.importSave([{ term: info.word, arabic: meaning.trim() || null, meaning_from: meaning.trim() ? 'you' : null, examples: info.sentence ? [{ sentence: info.sentence, arabic: info.sentence_ar }] : [] }]);
        toast(res.results[0]?.result === 'unchanged' ? 'موجودة عندك ✓' : 'تم الحفظ ✓');
        closeWordPanel();
        onChange?.({ ...info, state: 'saved' });
      }
    } catch (err) {
      toast(err.message);
    }
  });
}

/* ------------------------------------------------------ full word card */

export async function openWordCard(uvId, { onChange } = {}) {
  let w;
  try {
    w = await api.word(uvId);
  } catch (err) {
    return toast(err.message);
  }
  const easy = w.examples.find((e) => e.kind === 'easy');
  const otherExamples = w.examples.filter((e) => e !== easy && e.sentence !== w.context_sentence).slice(0, 3);
  const contexts = w.contexts.filter((c) => c.sentence);
  const next = w.next_review_at ? relDate(w.next_review_at) : 'بعد أول تدريب';

  const box = openModal(`
    ${headHtml(w, { big: true })}
    <div class="wd-section">${meaningHtml(w)}
      <button class="btn sm ghost" data-act="edit-meaning" style="margin-top:6px">${icon.edit} ${w.user_arabic ? 'عدّل معناك' : 'اكتب معناك الخاص'}</button></div>
    ${state.config?.ai?.configured ? '<div class="wd-section" id="wdForms"><div class="tiny muted"><span class="spinner"></span> نجلب صيغ الكلمة…</div></div>' : ''}

    ${contexts.length ? `<div class="wd-section"><div class="wd-label">وجدتها في</div>
      ${contexts.slice(0, 4).map((c) => `<div class="ctx">
        ${sentenceHtml(c.sentence, c.sentence_ar, w.term, { time: c.kind === 'youtube' ? c.timestamp_seconds : undefined, sourceId: c.source_id })}
        <a class="tiny muted ctx-src" href="#/source/${c.source_id}?${c.line_id ? `line=${c.line_id}&` : ''}${c.kind === 'youtube' && c.timestamp_seconds != null ? `t=${Math.max(0, Math.floor(c.timestamp_seconds) - 2)}&` : ''}jump=1" data-close>${c.kind === 'text' ? '📄' : '▶'} ${esc(c.title)}</a></div>`).join('')}
      ${contexts.length > 4 ? `<p class="tiny muted">و${contexts.length - 4} سياقات أخرى</p>` : ''}</div>` : ''}

    ${easy || otherExamples.length ? `<div class="wd-section"><div class="wd-label">أمثلة</div>
      ${[easy, ...otherExamples].filter(Boolean).map((e) => `<div class="quote" style="margin-bottom:8px"><p class="en">${highlight(e.sentence, w.term)} ${listenRow(e.sentence)}</p>${e.arabic ? `<p class="small ink-2">${esc(e.arabic)}</p>` : ''}</div>`).join('')}</div>` : ''}

    <div class="wd-section hidden" id="wdSyn"></div>

    <div class="wd-section"><div class="wd-label">المجموعات</div><div id="gp">${groupPickerHtml(w.group_ids)}</div></div>

    <div class="wd-section progress-line">
      ${statusChips(w)} <span class="small ink-2">الإتقان ${w.mastery}% · ✅ ${w.correct_count} · ❌ ${w.wrong_count} · التدريب القادم: ${esc(next)}</span>
    </div>

    <div class="wd-foot">
      <a class="btn primary" href="#/practice?ids=${w.uv_id}&mode=cards" data-close>${icon.cards} تدرّب عليها</a>
      <button class="btn sm ghost" data-act="remove" style="color:var(--bad)">${icon.trash} إزالة من كلماتي</button>
    </div>`);
  bindSpeech(box);
  // 🔤 One short line at the end: easier words with exactly the same meaning (nothing if none).
  if (state.config?.ai?.configured) {
    api.synonyms(w.term, (w.user_arabic || w.arabic || '').split(/[،,؛\/]/)[0].trim()).then((r) => {
      const el = box.querySelector('#wdSyn');
      if (!el || !r.items?.length) return;
      el.innerHTML = `<div class="syn-row"><span class="tiny muted">مرادفات أسهل:</span>${r.items.map((x) => `<button type="button" class="syn-chip" data-say="${esc(x.word)}"><b class="en">${esc(x.word)}</b>${x.arabic ? `<span>${esc(x.arabic)}</span>` : ''}</button>`).join('')}</div>`;
      el.classList.remove('hidden');
    }).catch(() => {});
  }
  // All forms of the word (verb, noun, adjective…), each can be saved on its own.
  const formsBox = box.querySelector('#wdForms');
  if (formsBox) {
    let forms = null;
    const saved = new Set();
    const drawForms = () => { formsBox.innerHTML = `${baseHtml(forms, w.term)}${formsHtml(forms, saved)}`; };
    loadForms(w.term).then((r) => { forms = r; }, (err) => { forms = { error: err.message }; }).finally(() => { if (formsBox.isConnected) drawForms(); });
    formsBox.addEventListener('click', async (e) => {
      const b = e.target.closest('.wf-save[data-form]');
      if (!b || !forms?.forms) return;
      const k = Number(b.dataset.form);
      const f = forms.forms[k];
      b.disabled = true;
      try {
        const r = await api.importSave([{ term: formTerm(f), arabic: f.arabic, meaning_from: 'ai', part_of_speech: POS_EN[f.pos] || null, examples: f.example ? [{ sentence: f.example, arabic: f.example_ar || null }] : [] }]);
        saved.add(k);
        toast(r.results?.[0]?.result === 'unchanged' ? `موجودة عندك ✓ ${formTerm(f)}` : `تم الحفظ ✓ ${formTerm(f)}`);
        drawForms();
        onChange?.(w);
      } catch (err) {
        b.disabled = false;
        toast(err.message);
      }
    });
  }
  bindGroupPicker(box, () => w.group_ids, async (gid, on) => {
    const nextIds = on ? [...w.group_ids, gid] : w.group_ids.filter((g) => g !== gid);
    w.group_ids = (await api.setWordGroups(w.uv_id, nextIds)).group_ids;
    toast(on ? `أُضيفت إلى ${groupName(gid)}` : `أُزيلت من ${groupName(gid)}`);
    onChange?.(w);
  });
  box.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    try {
      if (act === 'edit-meaning') {
        const v = prompt('معناك بالعربية (اتركه فارغًا لاستخدام المعنى الافتراضي)', w.user_arabic || w.arabic || '');
        if (v === null) return;
        await api.updateWord(w.uv_id, { user_arabic: v });
        toast('تم الحفظ ✓');
        closeModal(true);
        openWordCard(w.uv_id, { onChange });
        onChange?.(w);
      }
      if (act === 'remove') {
        if (!confirm(`إزالة "${w.term}" من كلماتك؟ سيُحذف تقدّمك فيها.`)) return;
        await api.deleteWord(w.uv_id);
        toast('تمت الإزالة');
        closeModal();
        onChange?.(null);
      }
    } catch (err) {
      toast(err.message);
    }
  });
}

export { $ };

/** 🎉 Today's goal reached while watching: keep going, or practise now. */
export function celebrateGoal(goal, practiceHref = '#/practice?session=today') {
  openModal(`<div class="celebrate"><div class="celebrate-emoji">🎉</div>
    <h2>مبروك! حققت هدف اليوم</h2>
    <p class="ink-2">مررت على <b class="en-inline">${goal.count}</b> كلمة اليوم (الهدف ${goal.goal}).</p>
    <div class="btn-row" style="justify-content:center;margin-top:14px"><button class="btn primary" data-close>▶ أكمل</button><a class="btn" href="${practiceHref}" data-close>🎯 تدرّب الحين</a></div></div>`);
}
