// Reusable pieces: word rows, the in-context word panel, the full word card
// and the group picker. The same word UI appears everywhere a word appears.
import { api } from './api.js';
import { speak } from './audio.js';
import { state, loadGroups, groupName } from './state.js';
import {
  esc, icon, levelChip, statusChips, typeLabel, fmtTime, highlight, openModal, closeModal, toast, relDate, $,
} from './ui.js';

export const BAND_AR = { function: 'كلمة نحوية', basic: 'كلمة أساسية', useful: 'مفيدة', advanced: 'متقدمة', specialized: 'متخصصة' };

/* -------------------------------------------------------------- rows */

export function wordRowHtml(w, { selectable = false, selected = false, extra = '' } = {}) {
  const groups = (w.group_ids || []).map(groupName).filter(Boolean);
  return `
    <div class="word-row ${selectable ? 'check-mode' : ''}" data-id="${w.uv_id}">
      ${selectable ? `<input type="checkbox" class="check" data-act="select" ${selected ? 'checked' : ''} aria-label="تحديد">` : ''}
      <div style="min-width:0">
        <div class="en-row en"><span class="term">${esc(w.term)}</span>${levelChip(w.level)}${extra}</div>
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
  return `<span class="listen-mini"><button class="btn icon sm ghost" data-say="${esc(text)}" data-rate="1" aria-label="استمع">${icon.speaker}</button><button class="btn sm ghost slow-btn" data-say="${esc(text)}" data-rate="0.6">بطيء</button></span>`;
}

function headHtml(w, { big = false } = {}) {
  return `
    <div class="wp-head">
      <div class="en" style="min-width:0">
        <div class="${big ? 'wd-term' : 'wp-term'}">${esc(w.term)}</div>
        <div class="wd-ipa">${esc(w.pronunciation || '')} ${listenRow(w.term)}</div>
      </div>
    </div>
    <div class="row wrap" style="gap:6px;margin-top:6px">${levelChip(w.level)}${typeLabel(w) ? `<span class="chip ar-chip">${esc(typeLabel(w))}</span>` : ''}${w.band === 'specialized' ? '<span class="chip ar-chip">متخصصة</span>' : ''}</div>`;
}

function meaningHtml(w) {
  const general = w.arabic_general && w.arabic && w.arabic_general !== w.arabic ? `<div class="tiny muted" style="margin-top:2px">المعنى العام: ${esc(w.arabic_general)}</div>` : '';
  return `
    <div class="wp-meaning">${w.arabic ? esc(w.arabic) : '<span class="muted" style="font-size:15px;font-weight:500">لا يوجد معنى محفوظ بعد</span>'}</div>
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
  panelEl?.remove();
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

function placePanel(el, anchor) {
  if (window.matchMedia('(max-width: 720px)').matches || !anchor) {
    el.classList.add('sheet');
    return;
  }
  const r = anchor.getBoundingClientRect();
  const w = 340;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(12, Math.min(window.innerWidth - w - 12, left));
  el.style.left = `${left}px`;
  el.style.width = `${w}px`;
  const below = r.bottom + 10;
  if (below + 360 < window.innerHeight) el.style.top = `${below}px`;
  else el.style.bottom = `${window.innerHeight - r.top + 10}px`;
}

/**
 * Show a word in context without leaving the page.
 * query: {line_id, word, vocabulary_id}; onChange(info) after save/groups.
 */
export async function openWordPanel(anchor, query, { onChange, onClose } = {}) {
  panelOnClose = null; // switching to another word is not "closing"
  closeWordPanel();
  panelOnClose = onClose || null;
  const el = document.createElement('div');
  el.className = 'word-pop';
  el.innerHTML = '<div class="wp-loading"><span class="spinner"></span> جارٍ البحث…</div>';
  document.body.appendChild(el);
  placePanel(el, anchor);
  panelEl = el;
  document.addEventListener('keydown', onPanelKey);
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
  bindSpeech(el);

  let info;
  try {
    info = await api.lookup(query);
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
          : info.tier === 'basic' ? 'كلمة أساسية (A1–A2) تعرفها على الأغلب.'
          : 'لا يوجد معنى لهذه الكلمة في القاموس المحلي.'}</p>
        ${info.ai_error ? `<p class="tiny muted">${esc(info.ai_error)}</p>` : ''}
        ${info.tier !== 'function' ? `<div class="wp-actions"><button class="btn sm" data-act="save-own">${icon.bookmark} احفظها بمعناك</button></div>` : ''}`;
      return;
    }
    const saved = info.state === 'saved';
    el.innerHTML = `
      <button class="btn icon sm ghost wp-close" aria-label="إغلاق">${icon.x}</button>
      ${headHtml(info)}
      ${meaningHtml(info)}
      ${info.context_note ? `<p class="small ctx-note">💡 ${esc(info.context_note)}</p>` : ''}
      ${info.contextual ? '' : info.arabic ? '<div class="tiny muted">معنى عام من القاموس (ليس حسب هذه الجملة)</div>' : ''}
      ${info.can_explain ? '<button class="btn sm ghost explain-btn" data-act="explain">✨ اشرح معناها في هذه الجملة</button>' : ''}
      ${info.ai_error ? `<p class="tiny muted">${esc(info.ai_error)}</p>` : ''}
      ${sentenceHtml(info.context_sentence, info.context_arabic, info.term)}
      ${(() => {
        const ex = (info.examples || []).find((e) => e.kind === 'example' && e.sentence !== info.context_sentence) || (info.examples || []).find((e) => e.kind === 'easy');
        return ex ? `<div class="tiny muted" style="margin-top:8px">مثال</div><p class="en small">${highlight(ex.sentence, info.term)}</p>${ex.arabic ? `<p class="tiny ink-2">${esc(ex.arabic)}</p>` : ''}` : '';
      })()}
      <div class="wp-actions">
        ${saved ? `<button class="btn sm saved" data-act="noop">${icon.check} محفوظة ✓</button>` : `<button class="btn sm primary" data-act="save">${icon.bookmark} حفظ</button>`}
        ${saved ? `<button class="btn sm ghost" data-act="details">التفاصيل</button>` : ''}
      </div>
      ${saved ? `<div class="wp-groups"><div class="tiny muted" style="margin-bottom:6px">المجموعات</div>${groupPickerHtml(info.groups || [])}</div>` : ''}`;
  };
  render();

  bindGroupPicker(el, () => info.groups || [], async (gid, on) => {
    const next = on ? [...(info.groups || []), gid] : (info.groups || []).filter((g) => g !== gid);
    const r = await api.setWordGroups(info.uv_id, next);
    info.groups = r.group_ids;
    onChange?.(info);
  });

  el.addEventListener('click', async (e) => {
    if (e.target.closest('.wp-close')) return closeWordPanel();
    const act = e.target.closest('[data-act]')?.dataset.act;
    try {
      if (act === 'save') {
        const r = await api.saveWord(info.vocabulary_id, info.occurrence_id);
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

    ${contexts.length ? `<div class="wd-section"><div class="wd-label">وجدتها في</div>
      ${contexts.slice(0, 4).map((c) => `<div class="ctx">
        ${sentenceHtml(c.sentence, c.sentence_ar, w.term, { time: c.kind === 'youtube' ? c.timestamp_seconds : undefined, sourceId: c.source_id })}
        <a class="tiny muted ctx-src" href="#/source/${c.source_id}${c.line_id ? `?line=${c.line_id}` : ''}" data-close>${c.kind === 'text' ? '📄' : '▶'} ${esc(c.title)}</a></div>`).join('')}
      ${contexts.length > 4 ? `<p class="tiny muted">و${contexts.length - 4} سياقات أخرى</p>` : ''}</div>` : ''}

    ${w.similar?.length ? `<div class="wd-section"><div class="wd-label">كلمات أسهل بمعنى قريب</div><div class="sim-list">
      ${w.similar.map((s) => `<div class="sim"><span class="w">${esc(s.word)}</span><span class="a">— ${esc(s.arabic)}</span>${s.note ? `<span class="note">${esc(s.note)}</span>` : ''}</div>`).join('')}</div></div>` : ''}

    ${easy || otherExamples.length ? `<div class="wd-section"><div class="wd-label">أمثلة</div>
      ${[easy, ...otherExamples].filter(Boolean).map((e) => `<div class="quote" style="margin-bottom:8px"><p class="en">${highlight(e.sentence, w.term)} ${listenRow(e.sentence)}</p>${e.arabic ? `<p class="small ink-2">${esc(e.arabic)}</p>` : ''}</div>`).join('')}</div>` : ''}

    <div class="wd-section"><div class="wd-label">المجموعات</div><div id="gp">${groupPickerHtml(w.group_ids)}</div></div>

    <div class="wd-section progress-line">
      ${statusChips(w)} <span class="small ink-2">الإتقان ${w.mastery}% · ✅ ${w.correct_count} · ❌ ${w.wrong_count} · التدريب القادم: ${esc(next)}</span>
    </div>

    <div class="wd-foot">
      <a class="btn primary" href="#/practice?ids=${w.uv_id}&mode=cards" data-close>${icon.cards} تدرّب عليها</a>
      <button class="btn sm ghost" data-act="remove" style="color:var(--bad)">${icon.trash} إزالة من كلماتي</button>
    </div>`);
  bindSpeech(box);
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
