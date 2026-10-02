import { api } from '../api.js';
import { state } from '../state.js';
import { esc, icon, thumbHtml, fmtDuration, relDate, toast, $ } from '../ui.js';
import { wordRowHtml, bindWordList } from '../components.js';

const ERRORS_AR = {
  no_captions: 'هذا الفيديو لا يحتوي على ترجمة (Captions) إنجليزية، لذلك لا يمكن تحليله تلقائيًا.',
  transcript_fetch_failed: 'تعذّر تنزيل نص الفيديو (Transcript) من يوتيوب.',
  no_items: 'لم نجد في هذا النص مفردات من مستوى B1–C1 تستحق التعلّم.',
};

const STEPS = ['جلب معلومات الفيديو', 'قراءة النص (Transcript)', 'اختيار المفردات المفيدة (B1–C1)', 'تجهيز البطاقات'];

export async function render(view, { params }) {
  let result = null; // { video, items }
  let level = 'all';
  let timers = [];

  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">YouTube → Vocabulary</div><h1>محلّل يوتيوب</h1>
      <p>الصق رابط فيديو إنجليزي، وسنختار لك الكلمات والتعابير التي تستحق التعلّم فعلًا.</p></div></div>
    <div class="card analyzer-box">
      <form id="form" class="stack">
        <div class="url-row">
          <input class="input" id="url" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=..." autocomplete="off" required>
          <button class="btn primary lg" id="go" type="submit">${icon.sparkle} حلّل</button>
        </div>
        <div class="row between wrap small">
          <span class="muted">${state.config.ai.configured ? '✨ تحليل سياقي بالذكاء الاصطناعي: المعنى العربي حسب جملة الفيديو.' : '📘 وضع القاموس: معاني عامة من قاموس مختار. أضف مفتاح الذكاء الاصطناعي في الخادم لتحليل سياقي.'}</span>
          <button type="button" class="btn sm ghost" id="pasteToggle">${icon.pen} لصق النص يدويًا</button>
        </div>
        <div id="pasteBox" class="hidden stack">
          <textarea class="input en" id="transcript" placeholder="0:05 So today I want to talk about...&#10;0:12 Most of us take our free time for granted..."></textarea>
          <p class="tiny muted">يدعم سطورًا بالشكل "04:37 النص" أو نصًا بدون توقيت. سيتم استخدامه بدل جلب النص من يوتيوب.</p>
        </div>
      </form>
      <div id="status"></div>
    </div>
    <div id="result"></div>
    <div class="section-title"><h2>فيديوهات حلّلتها</h2></div>
    <div id="history" class="grid cols-3"></div>`;

  const form = $('#form', view);
  const urlInput = $('#url', view);
  const status = $('#status', view);
  const resultEl = $('#result', view);
  const pasteBox = $('#pasteBox', view);

  $('#pasteToggle', view).addEventListener('click', () => pasteBox.classList.toggle('hidden'));

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function showLoading(video) {
    status.innerHTML = `
      ${video ? `<div class="divider"></div><div class="video-card">${thumbHtml(video)}<div><div class="en" style="font-weight:600">${esc(video.title || '')}</div></div></div>` : ''}
      <div class="loading-steps">${STEPS.map((s, i) => `<div class="loading-step ${i === 0 ? 'active' : ''}" data-step="${i}"><span class="dot"></span>${s}</div>`).join('')}</div>`;
    // Indicative progress while the single analysis request runs.
    [1500, 3500, 9000].forEach((ms, i) => {
      timers.push(setTimeout(() => setStep(i + 1), ms));
    });
  }
  function setStep(n) {
    status.querySelectorAll('.loading-step').forEach((el) => {
      const i = Number(el.dataset.step);
      el.classList.toggle('done', i < n);
      el.classList.toggle('active', i === n);
    });
  }

  function renderResult() {
    if (!result) return;
    const { video, items } = result;
    const shown = level === 'all' ? items : items.filter((i) => i.level === level);
    const saved = items.filter((i) => i.user_state === 'saved').length;
    const pending = items.filter((i) => !i.user_state).length;
    const counts = { B1: 0, B2: 0, C1: 0 };
    items.forEach((i) => (counts[i.level] += 1));
    const extractorLabel = { claude: '✨ تحليل سياقي بالذكاء الاصطناعي', dictionary: '📘 قاموس مختار (معانٍ عامة)', demo: 'بيانات تجريبية' }[video.extractor] || video.extractor;
    const sourceLabel = { pasted: 'نص ملصوق', demo: 'تجريبي', 'youtube-captions': 'ترجمة يوتيوب', 'youtube-auto-captions': 'ترجمة يوتيوب التلقائية', 'transcript-service': 'خدمة نصوص' }[video.transcript_source] || '';
    resultEl.innerHTML = `
      <div class="card" style="margin-top:16px">
        <div class="video-card">
          ${thumbHtml(video, { duration: video.duration_seconds })}
          <div class="stack" style="gap:8px">
            <div class="en" style="font-size:19px;font-weight:650;line-height:1.35">${esc(video.title)}</div>
            <div class="small ink-2 en">${esc(video.channel || '')}${video.duration_seconds ? ` · ${fmtDuration(video.duration_seconds)}` : ''}</div>
            <div class="row wrap" style="gap:6px"><span class="chip ar-chip">${extractorLabel}</span>${sourceLabel ? `<span class="chip ar-chip">${sourceLabel}</span>` : ''}${video.word_count ? `<span class="chip">${video.word_count} words</span>` : ''}</div>
            <div class="row" style="gap:14px;margin-top:6px;align-items:flex-end">
              <div class="found-count">${items.length}</div><div class="small ink-2" style="padding-bottom:4px">عنصرًا مفيدًا وجدناه<br><span class="muted">${saved} محفوظة · ${pending} بانتظار قرارك</span></div>
            </div>
          </div>
        </div>
      </div>
      <div class="row between wrap" style="margin:22px 0 12px;gap:10px">
        <div class="segmented" id="lvl">
          ${['all', 'B1', 'B2', 'C1'].map((l) => `<button data-l="${l}" class="${l === level ? 'active' : ''}">${l === 'all' ? `الكل (${items.length})` : `${l} (${counts[l]})`}</button>`).join('')}
        </div>
        <div class="btn-row">
          ${pending ? `<button class="btn primary" id="saveAll">${icon.bookmark} حفظ كل المقترحات (${pending})</button>` : ''}
          ${saved ? `<a class="btn" href="#/today">ابدأ التعلّم ←</a>` : ''}
        </div>
      </div>
      <div class="word-list" id="items">${shown.map((w) => wordRowHtml(w, { mode: 'analyzer' })).join('')}</div>
      <p class="tiny muted" style="margin-top:14px">اخترنا الكلمات حسب الفائدة للمتعلّم المتوسط، واستبعدنا الكلمات الأساسية والأسماء والأرقام والكلمات النادرة جدًا.</p>`;

    $('#lvl', resultEl).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-l]');
      if (!b) return;
      level = b.dataset.l;
      renderResult();
    });
    $('#saveAll', resultEl)?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      const todo = items.filter((i) => !i.user_state);
      for (const it of todo) {
        try {
          await api.saveItem(it.video_vocabulary_id);
          it.user_state = 'saved';
        } catch {
          /* continue */
        }
      }
      toast(`تم حفظ ${todo.length} عنصرًا في مفرداتك`);
      renderResult();
    });
  }

  bindWordList(resultEl, () => result?.items || [], {
    mode: 'analyzer',
    onChange: (updated) => {
      const i = result.items.findIndex((x) => x.video_vocabulary_id === updated.video_vocabulary_id);
      if (i >= 0) result.items[i] = { ...result.items[i], user_state: updated.user_state };
      renderResult();
    },
  });

  async function analyze({ force = false } = {}) {
    const url = urlInput.value.trim();
    const transcript = pasteBox.classList.contains('hidden') ? '' : $('#transcript', view).value;
    if (!url) return;
    resultEl.innerHTML = '';
    $('#go', view).disabled = true;
    showLoading(null);
    try {
      result = await api.analyze({ url, transcript, force });
      clearTimers();
      setStep(STEPS.length);
      setTimeout(() => (status.innerHTML = ''), 400);
      if (result.cached) toast('تم تحليل هذا الفيديو سابقًا — عرض النتائج المحفوظة');
      history.replaceState(null, '', `#/analyzer?video=${result.video.id}`);
      renderResult();
      loadHistory();
    } catch (err) {
      clearTimers();
      const d = err.data || {};
      const video = d.video;
      status.innerHTML = `
        <div class="divider"></div>
        ${video?.title ? `<div class="video-card" style="margin-bottom:14px">${thumbHtml(video)}<div class="en" style="font-weight:600">${esc(video.title)}</div></div>` : ''}
        <div class="alert">
          <b dir="auto">${esc(ERRORS_AR[d.code] || err.message)}</b>
          ${d.code === 'no_captions' || d.code === 'transcript_fetch_failed'
            ? `<span class="small">لم نتمكن من الحصول على النص، لذلك لم نحلّل شيئًا. يمكنك نسخ النص من يوتيوب (⋯ ← Show transcript) ولصقه هنا.</span>
               <div><button class="btn sm" id="openPaste">${icon.pen} لصق النص يدويًا</button></div>`
            : ''}
          ${d.details?.length ? `<details><summary>تفاصيل تقنية</summary><div class="en">${d.details.map(esc).join('<br>')}</div></details>` : ''}
        </div>`;
      $('#openPaste', status)?.addEventListener('click', () => {
        pasteBox.classList.remove('hidden');
        $('#transcript', view).focus();
      });
    } finally {
      $('#go', view).disabled = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    analyze();
  });

  async function loadHistory() {
    const videos = await api.videos();
    const el = $('#history', view);
    if (!el) return;
    el.innerHTML = videos.map((v) => `
      <a class="video-mini" href="#/analyzer?video=${v.id}">
        ${thumbHtml(v, { duration: v.duration_seconds })}
        <div style="min-width:0"><div class="en small" style="font-weight:600;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(v.title)}</div>
        <div class="tiny muted">${v.saved_count}/${v.item_count} محفوظة · ${esc(relDate(v.analyzed_at))}</div></div>
      </a>`).join('');
  }
  loadHistory();

  if (params.video) {
    try {
      result = await api.video(params.video);
      urlInput.value = result.video.is_demo ? '' : result.video.url;
      renderResult();
    } catch (err) {
      toast(err.message);
    }
  }
  return clearTimers;
}
