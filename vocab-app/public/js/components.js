// Reusable pieces: word rows, the detailed word card, the video player modal.
import { api } from './api.js';
import { speak } from './audio.js';
import {
  esc, icon, levelChip, statusChips, typeLabel, fmtTime, highlight, openModal, closeModal, toast, relDate, TOPIC_AR, BUCKET_AR,
} from './ui.js';

/** One row in a list. mode: 'analyzer' (save / not useful) or 'saved'. */
export function wordRowHtml(w, { mode = 'saved', bucket, selectable = false, selected = false } = {}) {
  const id = mode === 'analyzer' ? w.video_vocabulary_id : w.uv_id;
  const state = w.user_state;
  let actions = `<button class="btn icon sm ghost" data-act="listen" title="استمع" aria-label="استمع">${icon.speaker}</button>`;
  if (mode === 'analyzer') {
    actions += state === 'saved'
      ? `<button class="btn sm saved" data-act="unsave">${icon.check} محفوظة</button>`
      : `<button class="btn sm primary" data-act="save">${icon.bookmark} حفظ</button>`;
    actions += state === 'dismissed'
      ? `<button class="btn sm ghost" data-act="unsave">تراجع</button>`
      : `<button class="btn sm ghost" data-act="dismiss">غير مفيدة</button>`;
  } else {
    actions += `<div class="mastery-mini" title="الإتقان ${w.mastery}%"><div class="bar"><span style="width:${w.mastery}%"></span></div></div>`;
  }
  const chips = mode === 'saved'
    ? statusChips(w)
    : `<span class="chip ar-chip">${esc(typeLabel(w))}</span><span class="chip" title="Usefulness">★ ${w.usefulness}</span>`;
  return `
    <div class="word-row ${state === 'dismissed' ? 'dismissed' : ''} ${selectable ? 'check-mode' : ''}" data-id="${id}">
      ${selectable ? `<input type="checkbox" class="check" data-act="select" ${selected ? 'checked' : ''} aria-label="تحديد">` : ''}
      <div>
        <div class="en-row en"><span class="term">${esc(w.term)}</span>${levelChip(w.level)}${bucket ? `<span class="chip ar-chip bucket-chip">${BUCKET_AR[bucket]}</span>` : ''}</div>
        <div class="meaning">${esc(w.arabic)}</div>
        <div class="meta">${chips}</div>
      </div>
      <div class="actions">${actions}</div>
    </div>`;
}

export function listenButtons(text, label = 'استمع') {
  return `<div class="listen-row">
    <button class="btn sm" data-say="${esc(text)}" data-rate="1">${icon.speaker} ${esc(label)}</button>
    <button class="btn sm ghost" data-say="${esc(text)}" data-rate="1">عادي</button>
    <button class="btn sm ghost" data-say="${esc(text)}" data-rate="0.65">بطيء</button>
  </div>`;
}

/** Wire data-say buttons inside a container. */
export function bindSpeech(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-say]');
    if (!b) return;
    e.stopPropagation();
    speak(b.dataset.say, { rate: Number(b.dataset.rate) || 1, lang: b.dataset.lang || 'en' }).catch(() => toast('الصوت غير مدعوم في هذا المتصفح'));
  });
}

export function openVideoAt(video, seconds) {
  if (!video?.youtube_id || video.is_demo) {
    toast('هذا فيديو تجريبي — حلّل فيديو حقيقيًا لتشغيل المقطع.');
    return;
  }
  const start = Math.max(0, Math.floor(seconds || 0) - 2);
  const yt = `https://www.youtube.com/watch?v=${encodeURIComponent(video.youtube_id)}&t=${start}s`;
  openModal(
    `<h3 style="margin-bottom:12px" class="en">${esc(video.title || 'YouTube')}</h3>
     <iframe class="video-frame" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.youtube_id)}?start=${start}&autoplay=1&rel=0"
       allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="YouTube"></iframe>
     <div class="row between" style="margin-top:12px"><span class="muted small en-inline">▶ ${fmtTime(seconds)}</span>
     <a class="btn sm" href="${yt}" target="_blank" rel="noopener">${icon.link} فتح في يوتيوب</a></div>`,
    { wide: true },
  );
}

function similarHtml(similar) {
  if (!similar?.length) return '';
  return `<div class="wd-section"><div class="wd-label">كلمات أسهل / معنى قريب</div><div class="sim-list">
    ${similar.map((s) => `<div class="sim"><span class="w">${esc(s.word)}</span><span class="a">— ${esc(s.arabic)}</span>${s.note ? `<span class="note">${esc(s.note)}</span>` : ''}</div>`).join('')}
  </div></div>`;
}

function historyHtml(w) {
  if (!w.history) return '';
  const next = w.next_review_at ? relDate(w.next_review_at) : 'بعد أول مراجعة';
  const SRC = { flashcard: 'بطاقات', today: 'تعلّم اليوم', listening: 'استماع' };
  return `<div class="wd-section"><div class="wd-label">تقدّمك</div>
    <div class="kv">
      <div><b>${w.mastery}%</b><span>الإتقان</span></div>
      <div><b>${w.review_count}</b><span>مراجعات</span></div>
      <div><b style="color:var(--good)">${w.correct_count}</b><span>صحيحة</span></div>
      <div><b style="color:var(--bad)">${w.wrong_count}</b><span>خاطئة</span></div>
    </div>
    <p class="small muted" style="margin-top:10px">المراجعة القادمة: <b class="ink-2">${esc(next)}</b> · آخر مراجعة: ${esc(relDate(w.last_reviewed_at))}</p>
    ${w.history.length ? `<details style="margin-top:8px"><summary class="small muted" style="cursor:pointer">سجل المراجعات (${w.history.length})</summary>
      <div class="stack" style="gap:4px;margin-top:8px">${w.history.map((h) => `<div class="row between small"><span>${h.correct ? '✅' : '❌'} ${esc(SRC[h.source] || h.source.replace('game:', 'لعبة: '))}</span><span class="muted">${esc(relDate(h.created_at))}</span></div>`).join('')}</div></details>` : ''}
  </div>`;
}

/**
 * Detailed word card.
 * @param w word (saved) or analyzer item
 * @param opts.mode 'analyzer' | 'saved'
 * @param opts.onChange called with (updated word | null) after save / dismiss / remove
 */
export async function openWordDetail(w, { mode = 'saved', onChange } = {}) {
  if (mode === 'saved' && !w.history) {
    try {
      w = await api.word(w.uv_id);
    } catch {
      /* show what we have */
    }
  }
  const easy = w.examples?.find((e) => e.kind === 'easy');
  const example = w.examples?.find((e) => e.kind === 'example' && e.sentence !== w.context_sentence);
  const ctxTime = fmtTime(w.timestamp_seconds);
  const playable = w.video && !w.video.is_demo && w.video.youtube_id;
  const generalDiffers = w.arabic_general && w.arabic_general !== w.arabic;

  const html = `
    <div class="wd-head">
      <div>
        <div class="en"><div class="wd-term">${esc(w.term)}</div>
        <div class="wd-ipa">${esc(w.pronunciation || '')}</div></div>
        <div class="row wrap" style="gap:6px;margin-top:10px">${levelChip(w.level)}<span class="chip ar-chip">${esc(typeLabel(w))}</span>
          ${w.topic ? `<span class="chip ar-chip">${esc(TOPIC_AR[w.topic] || w.topic)}</span>` : ''}
          <span class="chip" title="Usefulness">★ ${w.usefulness}</span>
          ${mode === 'saved' ? statusChips(w) : ''}</div>
      </div>
    </div>
    <div class="wd-section">${listenButtons(w.term)}</div>

    <div class="wd-section">
      <div class="wd-label">المعنى بالعربية${w.context_sentence ? ' (حسب السياق)' : ''}</div>
      <div class="wd-arabic">${esc(w.arabic)}</div>
      ${generalDiffers ? `<div class="small muted" style="margin-top:4px">المعنى العام: ${esc(w.arabic_general)}</div>` : ''}
    </div>
    <div class="wd-section">
      <div class="wd-label">بالإنجليزية البسيطة</div>
      <p class="en" style="font-size:16px">${esc(w.simple_english)}</p>
    </div>

    ${w.context_sentence ? `
    <div class="wd-section">
      <div class="wd-label">السياق الأصلي من الفيديو</div>
      <div class="quote"><p class="en">“${highlight(w.context_sentence, w.term)}”</p>
        ${w.context_arabic ? `<p style="margin-top:8px;color:var(--ink-2)"><span class="small muted">المعنى في هذا السياق: </span>${esc(w.context_arabic)}</p>` : ''}
      </div>
      <div class="row wrap" style="margin-top:10px;gap:8px">
        ${ctxTime ? `<button class="ts-btn" data-act="ts" ${playable ? '' : 'title="فيديو تجريبي"'}>▶ ${ctxTime}</button>` : ''}
        <button class="btn sm ghost" data-say="${esc(w.context_sentence)}" data-rate="1">${icon.speaker} استمع للجملة</button>
        ${w.video ? `<span class="small muted en-inline" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px">${esc(w.video.title || '')}</span>` : ''}
      </div>
    </div>` : ''}

    ${similarHtml(w.similar)}

    ${example ? `<div class="wd-section"><div class="wd-label">مثال</div>
      <div class="quote"><p class="en">${highlight(example.sentence, w.term)}</p>${example.arabic ? `<p class="small" style="margin-top:6px;color:var(--ink-2)">${esc(example.arabic)}</p>` : ''}</div>
      <div style="margin-top:8px">${listenButtons(example.sentence, 'استمع للمثال')}</div></div>` : ''}

    ${easy ? `<div class="wd-section"><div class="wd-label">مثال سهل آخر</div>
      <div class="quote"><p class="en">“${highlight(easy.sentence, w.term)}”</p>${easy.arabic ? `<p class="small" style="margin-top:6px;color:var(--ink-2)">${esc(easy.arabic)}</p>` : ''}</div>
      <div style="margin-top:8px">${listenButtons(easy.sentence, 'استمع')}</div></div>` : ''}

    ${mode === 'saved' ? historyHtml(w) : ''}

    <div class="wd-foot">
      ${mode === 'analyzer'
        ? `<div class="btn-row">
            ${w.user_state === 'saved' ? `<button class="btn saved" data-act="unsave">${icon.check} محفوظة</button>` : `<button class="btn primary" data-act="save">${icon.bookmark} حفظ في مفرداتي</button>`}
            ${w.user_state === 'dismissed' ? '' : '<button class="btn ghost" data-act="dismiss">غير مفيدة</button>'}
          </div>`
        : `<div class="btn-row">
            <a class="btn sm" href="#/review?ids=${w.uv_id}" data-close>${icon.cards} بطاقة</a>
            ${w.campaigns?.length ? w.campaigns.map((c) => `<a class="chip ar-chip" href="#/campaigns/${c.id}" data-close>${esc(c.name)}</a>`).join('') : ''}
          </div>
          <button class="btn sm ghost" data-act="remove" style="color:var(--bad)">${icon.trash} إزالة</button>`}
    </div>`;

  const box = openModal(html);
  bindSpeech(box);
  box.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    try {
      if (act === 'ts') openVideoAt(w.video, w.timestamp_seconds);
      if (act === 'save') {
        await api.saveItem(w.video_vocabulary_id);
        toast(`تم حفظ “${w.term}” في مفرداتك`);
        onChange?.({ ...w, user_state: 'saved' });
        closeModal();
      }
      if (act === 'dismiss') {
        await api.dismissItem(w.video_vocabulary_id);
        onChange?.({ ...w, user_state: 'dismissed' });
        closeModal();
      }
      if (act === 'unsave') {
        await api.resetItem(w.video_vocabulary_id);
        onChange?.({ ...w, user_state: null });
        closeModal();
      }
      if (act === 'remove') {
        if (!confirm(`إزالة “${w.term}” من مفرداتك؟ سيُحذف سجل مراجعاتها.`)) return;
        await api.deleteWord(w.uv_id);
        toast('تمت الإزالة');
        onChange?.(null);
        closeModal();
      }
    } catch (err) {
      toast(err.message);
    }
  });
}

/** Wire listen/save/dismiss/open actions for a list of word rows. */
export function bindWordList(container, getWords, { mode = 'saved', onChange } = {}) {
  container.addEventListener('click', async (e) => {
    const row = e.target.closest('.word-row');
    if (!row) return;
    const id = Number(row.dataset.id);
    const words = getWords();
    const w = words.find((x) => (mode === 'analyzer' ? x.video_vocabulary_id : x.uv_id) === id);
    if (!w) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'select') return;
    e.stopPropagation();
    try {
      if (act === 'listen') return void speak(w.term).catch(() => toast('الصوت غير مدعوم في هذا المتصفح'));
      if (act === 'save') {
        await api.saveItem(w.video_vocabulary_id);
        toast(`تم حفظ “${w.term}”`);
        return onChange?.({ ...w, user_state: 'saved' });
      }
      if (act === 'dismiss') {
        await api.dismissItem(w.video_vocabulary_id);
        return onChange?.({ ...w, user_state: 'dismissed' });
      }
      if (act === 'unsave') {
        await api.resetItem(w.video_vocabulary_id);
        return onChange?.({ ...w, user_state: null });
      }
      openWordDetail(w, { mode, onChange });
    } catch (err) {
      toast(err.message);
    }
  });
}
