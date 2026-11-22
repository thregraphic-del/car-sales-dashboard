// أضف — one box for everything: a YouTube link, a word list, notes or a text.
import { bindMyVideos } from '../my-videos.js';
import { bindMyTexts } from '../my-texts.js';
import { api } from '../api.js';
import { speak } from '../audio.js';
import { state, loadGroups } from '../state.js';
import { esc, icon, levelChip, thumbHtml, relDate, toast, fmtTime, $ } from '../ui.js';
import { groupPickerHtml, bindGroupPicker } from '../components.js';
import { bindAttach, packsHtml, bindPacks, suggestionsHtml, bindSuggestions, suggestWordsHtml, bindSuggestWords, channelsHtml, bindChannels, fieldsHtml, bindFields } from '../add-extras.js';

const ICO = {
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.3-8.3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
};
// the three platforms a link can come from (simple marks, shown inside the empty box)
const LOGO = {
  tiktok: '<svg viewBox="0 0 24 24" aria-label="TikTok"><path fill="currentColor" d="M16.6 5.8A4.3 4.3 0 0 1 15.6 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 1 0 5 5.7V9a7.4 7.4 0 0 0 4.3 1.4V7.3a4.3 4.3 0 0 1-3.4-1.5z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" aria-label="Instagram"><defs><linearGradient id="igg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#F9A03F"/><stop offset=".5" stop-color="#E1306C"/><stop offset="1" stop-color="#7B3FE4"/></linearGradient></defs><rect x="3" y="3" width="18" height="18" rx="5.5" fill="none" stroke="url(#igg)" stroke-width="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="url(#igg)" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.2" fill="#E1306C"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" aria-label="YouTube"><rect x="2" y="5" width="20" height="14" rx="4.5" fill="#FF0000"/><path fill="#fff" d="M10 9.2v5.6l5-2.8z"/></svg>',
};
// a link to a normal page (an article), not YouTube
// TikTok / Instagram / Facebook / X links: recognised, but they give no transcript to read
const SOCIAL = [[/(^|\.)(tiktok\.com|vm\.tiktok\.com)/i, 'تيك توك'], [/(^|\.)(instagram\.com|instagr\.am)/i, 'انستقرام'], [/(^|\.)(facebook\.com|fb\.watch|fb\.com)/i, 'فيسبوك'], [/(^|\.)(twitter\.com|x\.com)/i, 'إكس']];
const socialOf = (s) => { try { const h = new URL(String(s).trim()).hostname; return SOCIAL.find(([re]) => re.test(h))?.[1] || ''; } catch { return ''; } };
const isArticle = (s) => /^\s*https?:\/\/[^\s]+\s*$/i.test(s) && !isYoutube(s) && !socialOf(s);
const isYoutube = (s) => /^\s*(https?:\/\/)?((www|m|music)\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\/\S+\s*$/i.test(s);
// Pasting the transcript is offered for every reason except a bad link.
const PASTE_HELP = new Set(['no_captions', 'blocked', 'service_limit', 'fetch_failed', 'age_restricted', 'region_blocked', 'transcript_fetch_failed']);

// «مقاطعي»: drawn at once from the last list kept on this device, then refreshed quietly.
const srcKey = () => `add.sources.${state.user?.id || 'me'}`; // per account on a shared device
// mostly Arabic words (a text to translate to English), not an English text or a word list
const isArabicProse = (s) => { const ar = (String(s).match(/[\u0600-\u06FF]/g) || []).length; const en = (String(s).match(/[A-Za-z]/g) || []).length; return ar >= 12 && ar > en * 1.5 && String(s).trim().split(/\s+/).length >= 6; };

export async function render(view, { params }) {
  let cached = [];
  try { cached = JSON.parse(localStorage.getItem(srcKey()) || '[]'); } catch { /* none yet */ }
  view.innerHTML = `
    <div class="card add-box add-hero">
      <h1 class="ah-title"><svg class="ah-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3.5l-3.2 5.2M11.5 8.2 5 6.2M9.8 14.8 3.5 17"/></svg>أضف محتوى للتعلّم</h1>
      <span class="add-kind hidden" id="kindChip"></span>
      <input type="file" id="attachInput" accept="image/*,.pdf,.txt,.csv,.md,.srt,.vtt,.docx" hidden>
      <div class="add-field">
        <textarea class="input add-input" id="input" dir="auto" rows="3" aria-label="الصق هنا النص أو الرابط"></textarea>
        <div class="add-ph" id="addPh" aria-hidden="true"><div class="ph-main"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="5" width="12" height="16" rx="3"/><path d="M9 5.5V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5v1M9.5 12h5M9.5 15.5h3"/></svg><span id="phTxt">الصق هنا</span></div>
          <div class="ph-rest"><div>رابط: يوتيوب، تيك توك، مقال</div><div>نص: فقرة، ملخص، حوار</div><label for="attachInput" id="attachBtn" class="ph-file" title="صورة لصفحة كلمات، PDF، Word أو ملف نصي">ملف: PDF, Word, صورة ${ICO.clip}</label></div></div>
      </div>
      <div class="ah-foot"><p class="ah-hint" id="hint">ما يهم التنسيق، إحنا نستخرجه تلقائيًا ✨</p>
        <button class="btn primary" id="go" disabled><span id="goLabel">استخرج</span>${ICO.arrow}</button></div>
      <div id="manual" class="hidden stack" style="margin-top:14px">
        <label class="field">الصق نص الفيديو (Transcript) من يوتيوب
          <textarea class="input en" id="transcript" rows="6" placeholder="0:05 So today I want to talk about…"></textarea></label>
        <ol class="tiny muted" style="margin:0;padding-inline-start:20px;line-height:1.9">
          <li>افتح الفيديو في يوتيوب، ثم تحت الفيديو: <b>…المزيد</b> ← <b>عرض النص (Show transcript)</b>.</li>
          <li>حدّد النص كله في لوحة النص وانسخه (مع الأوقات).</li>
          <li>الصقه هنا واضغط «افتح الفيديو» — سيعمل الفيديو داخل 3Goal والنص يتابعه جملةً جملة.</li>
        </ol>
      </div>
      <div id="status"></div>
    </div>
    <div id="result"></div>
    <div class="src-tabs hidden" id="srcTabs">
      <div class="section-title"><h2>نشاطي</h2></div>
      <div class="act-bar"><div class="segmented fd-kind" id="srcKind"><button type="button" class="active" data-sk="videos">${icon.video} مقاطعي <span class="tiny" id="cV"></span></button><button type="button" data-sk="texts">${icon.doc} نصوص <span class="tiny" id="cT"></span></button></div>
        <button type="button" class="fd-selbtn" id="srcPick" title="تحديد: اختر عدة مقاطع ونفّذ عليها إجراءً">☑ تحديد</button>
        <button type="button" class="fd-sq fav-chip" id="srcFav" aria-label="المفضلة" title="المفضلة">${icon.star}</button></div>
    </div>
    <div id="sources"></div>
    <div id="texts" class="tx-sec hidden"></div>
    ${fieldsHtml()}
    ${suggestionsHtml()}
    <div class="section-title"><h2>اختصارات سريعة</h2></div>
    ${packsHtml()}
    ${suggestWordsHtml()}`;
  // videos → «مقاطعي», pasted texts → «نصوص» (3 lines each)
  const videosOf = (l) => l.filter((s) => s.kind !== 'text');
  const textsOf = (l) => l.filter((s) => s.kind === 'text');
  // one box, two tabs: 🎬 مقاطعي | 📄 نصوص — and «المفضلة» shows the favourites of the tab you are on
  let srcKind = 'videos';
  try { srcKind = localStorage.getItem('add.srcKind') === 'texts' ? 'texts' : 'videos'; } catch { /* ignore */ }
  const favOn = { videos: false, texts: false };
  let myTexts = null;
  const myVids = bindMyVideos(view.querySelector('#sources'), videosOf(cached), { onPrefs: () => myTexts?.redraw(), onPick: (on) => { const b = view.querySelector('#srcPick'); if (b) { b.classList.toggle('on', on); b.textContent = on ? '✓ تم' : '☑ تحديد'; } } });
  myTexts = bindMyTexts(view.querySelector('#texts'), textsOf(cached), { isFav: (id) => myVids.isFav(id), toggleFav: (id) => myVids.toggleFav(id) });
  let counts = [videosOf(cached).length, textsOf(cached).length];
  const drawTabs = () => {
    view.querySelector('#srcTabs').classList.toggle('hidden', !counts[0] && !counts[1]);
    view.querySelector('#cV').textContent = `(${counts[0]})`;
    view.querySelector('#cT').textContent = `(${counts[1]})`;
    view.querySelectorAll('#srcKind [data-sk]').forEach((b) => b.classList.toggle('active', b.dataset.sk === srcKind));
    view.querySelector('#sources').classList.toggle('hidden', srcKind !== 'videos');
    view.querySelector('#texts').classList.toggle('hidden', srcKind !== 'texts');
    view.querySelector('#srcFav').classList.toggle('on', favOn[srcKind]);
    view.querySelector('#srcPick').classList.toggle('hidden', srcKind !== 'videos');
  };
  view.querySelector('#srcTabs').addEventListener('click', (e) => {
    const k = e.target.closest('[data-sk]');
    if (k) { srcKind = k.dataset.sk; if (srcKind !== 'videos') myVids.setPicking(false); try { localStorage.setItem('add.srcKind', srcKind); } catch { /* ignore */ } drawTabs(); return; }
    if (e.target.closest('#srcPick')) { myVids.setPicking(!myVids.isPicking()); return; }
    if (e.target.closest('#srcFav')) {
      favOn[srcKind] = !favOn[srcKind];
      (srcKind === 'videos' ? myVids : myTexts).setFavOnly(favOn[srcKind]);
      drawTabs();
    }
  });
  drawTabs();
  const refreshLists = () => api.sources().then((list) => {
    try { localStorage.setItem(srcKey(), JSON.stringify(list.slice(0, 60))); } catch { /* storage unavailable */ }
    if (view.isConnected) { myVids.update(videosOf(list)); myTexts.update(textsOf(list)); counts = [videosOf(list).length, textsOf(list).length]; drawTabs(); }
  }).catch(() => {});
  refreshLists();

  const input = $('#input', view);
  const go = $('#go', view);
  const status = $('#status', view);
  const result = $('#result', view);
  const manual = $('#manual', view);

  const update = () => {
    const v = input.value.trim();
    go.disabled = !v;
    $('#goLabel', view).textContent = isYoutube(v) ? 'افتح الفيديو' : isArticle(v) ? 'افتح المقال' : 'استخرج';
    const sn = socialOf(v);
    const k = !v ? '' : isYoutube(v) ? 'video' : sn ? 'social' : isArticle(v) ? 'article' : isArabicProse(v) ? 'arabic' : 'words';
    const chip = $('#kindChip', view);
    chip.classList.toggle('hidden', !k);
    chip.dataset.k = k;
    chip.textContent = sn ? `رابط ${sn}` : { video: 'فيديو يوتيوب', article: 'مقال', arabic: 'نص عربي ← إنجليزي', words: 'كلمات أو نص' }[k] || '';
    $('#hint', view).textContent = {
      video: 'نقرأ نص المقطع كامل ونجهّز الترجمة والكلمات.',
      article: 'نقرأ المقال ونستخرج كلماته، ويُحفظ في «نصوص».',
      social: `ما نقدر نقرأ نص الفيديو من ${sn}. انسخي النص أو الوصف اللي تبينه والصقيه هنا مكان الرابط.`,
      arabic: 'نترجمه للإنجليزي (يستهلك الذكاء الاصطناعي) ويظهر في «نصوص».',
    }[k] || 'ما يهم التنسيق، إحنا نستخرجه تلقائيًا ✨';
    view.querySelectorAll('#ahStrip [data-cell]').forEach((c) => c.classList.toggle('on', (c.dataset.cell === 'link' && ['video', 'article', 'social'].includes(k)) || (c.dataset.cell === 'text' && ['words', 'arabic'].includes(k))));
    $('#addPh', view)?.classList.toggle('hidden', !!v);
    if (!isYoutube(v)) manual.classList.add('hidden');
  };
  input.addEventListener('input', update);
  // «رابط» / «نص»: aim the box (the file cell opens the picker by itself)
  view.querySelector('#ahStrip')?.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cell]');
    if (!c) return;
    $('#phTxt', view).textContent = c.dataset.cell === 'link' ? 'الصق الرابط هنا' : 'الصق النص هنا';
    input.focus();
  });
  if (params.text) input.value = params.text;
  update();
  bindAttach(view, { input, go, status });
  bindPacks(view);
  bindSuggestWords(view);
  const pickVideo = (url) => {
    input.value = url;
    update();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    go.click();
  };
  bindSuggestions(view, { onPick: pickVideo });
  bindChannels(view, { onPick: pickVideo });
  bindFields(view);

  const steps = (labels) => {
    status.innerHTML = `<div class="loading-steps">${labels.map((s, i) => `<div class="loading-step ${i === 0 ? 'active' : ''}" data-step="${i}"><span class="dot"></span>${s}</div>`).join('')}</div>`;
    const timers = labels.slice(1).map((_, i) => setTimeout(() => {
      status.querySelectorAll('.loading-step').forEach((el) => {
        const k = Number(el.dataset.step);
        el.classList.toggle('done', k <= i);
        el.classList.toggle('active', k === i + 1);
      });
    }, [1500, 4000, 9000][i] || 12000));
    return () => timers.forEach(clearTimeout);
  };

  async function openVideo() {
    const stop = steps(['جلب الفيديو', 'قراءة النص كاملًا', 'اختيار الكلمات المفيدة', 'تجهيز الترجمة']);
    try {
      const body = { url: input.value.trim(), transcript: manual.classList.contains('hidden') ? '' : $('#transcript', view).value };
      // A dropped connection or a server that was still waking up: try again quietly (twice) before showing an error.
      const ask = async () => {
        for (let t = 0; ; t++) {
          try { return await api.analyzeYoutube(body); } catch (err) {
            if (t >= 1 || !(err.status === 0 || err.status === 502 || err.status === 503)) throw err; // never re-run a request that timed out (504)
            await new Promise((res) => setTimeout(res, 1500 * (t + 1)));
          }
        }
      };
      let r = await ask();
      // A long video: its transcript is prepared in the background — ask again every few seconds (up to ~3 min).
      // a long video: ask again every 10 s, for about 2 minutes (each check may cost the service a credit)
      for (let i = 0; r?.pending && i < 12 && view.isConnected; i++) {
        status.innerHTML = `<p class="small muted" style="margin-top:12px"><span class="spinner"></span> ${esc(r.message || 'نجهّز نص الفيديو…')} (${(i + 1) * 10} ث)</p>`;
        await new Promise((res) => setTimeout(res, 10000));
        r = await ask();
      }
      if (r?.pending) throw Object.assign(new Error('الفيديو طويل جدًا وما زال نصّه يُجهَّز — جرّب بعد دقيقة.'), { data: {} });
      status.innerHTML = '';
      stop();
      try { sessionStorage.setItem('reader.openWide', String(r.source_id)); } catch { /* ignore */ } // just pasted: open wide
      location.hash = `#/source/${r.source_id}`;
    } catch (err) {
      stop();
      const d = err.data || {};
      // The server explains exactly why (private, removed, no captions, blocked…).
      status.innerHTML = `<div class="alert" style="margin-top:14px" role="alert"><b>${esc(err.message)}</b>
        ${d.video?.title ? `<span class="small">الفيديو: <span class="en-inline">${esc(d.video.title)}</span></span>` : ''}
        ${PASTE_HELP.has(d.code) ? '<span class="small">الصق نص الفيديو في المربع أدناه (الخطوات تحته)، وسنكمل كالمعتاد مع الفيديو والتوقيتات والمتابعة المباشرة.</span>' : ''}
        ${d.details?.length ? `<details class="tiny muted"><summary>تفاصيل تقنية</summary><div class="en" dir="ltr">${d.details.map(esc).join('<br>')}</div></details>` : ''}</div>`;
      if (PASTE_HELP.has(d.code) && manual.classList.contains('hidden')) {
        manual.classList.remove('hidden');
        $('#transcript', view).focus();
      }
    }
  }

  async function analyzeInput() {
    const stop = steps(isArabicProse(input.value) ? ['قراءة النص العربي', 'نترجمه للإنجليزي', 'نستخرج الكلمات المفيدة'] : ['قراءة ما كتبته', 'التعرّف على الكلمات والمعاني', 'مقارنتها بكلماتك']);
    try {
      const preview = await api.importPreview(input.value);
      stop();
      status.innerHTML = '';
      renderPreview(preview);
      if (preview.source) refreshLists(); // a pasted text joins «نصوص» right away
    } catch (err) {
      stop();
      status.innerHTML = `<div class="alert" style="margin-top:14px"><b>${esc(err.message)}</b></div>`;
    }
  }

  // 📰 an article link: the site reads the page and opens it like a text (new words in teal, yours in purple)
  async function openArticle() {
    const stop = steps(['فتح الصفحة', 'قراءة المقال', 'استخراج الكلمات', 'تجهيز النص']);
    try {
      const r = await api.analyzeArticle(input.value.trim());
      stop();
      status.innerHTML = '';
      location.hash = `#/source/${r.source_id}`;
    } catch (err) {
      stop();
      status.innerHTML = `<div class="alert" style="margin-top:14px" role="alert"><b>${esc(err.message)}</b></div>`;
    }
  }
  go.addEventListener('click', () => { const v = input.value.trim(); if (socialOf(v)) return toast(`روابط ${socialOf(v)} ما نقدر نقرأ نصها. انسخي النص أو الوصف والصقيه بدل الرابط.`); return isYoutube(v) ? openVideo() : isArticle(v) ? openArticle() : analyzeInput(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !go.disabled) go.click();
  });

  /* ------------------------------------------------------- import preview */

  function renderPreview(p) {
    // Uncertain items start unticked: the learner decides, we don't guess.
    const items = p.items.map((it) => ({ ...it, keep: (it.status !== 'saved' && !it.unsure) || it.new_info.length > 0 }));
    let groupIds = [];
    // Missing details are completed by AI in small batches (one short request each).
    const needsDetails = (it) => !it.arabic || !it.level || !it.simple_english;
    const pending = p.needs_ai ? items.filter(needsDetails) : [];
    let enriching = pending.length > 0;
    let enriched = 0;
    const draw = () => {
      const keepCount = items.filter((i) => i.keep).length;
      result.innerHTML = `
        ${p.source ? `<a class="card source-ready" href="#/source/${p.source.id}">
            <div class="row" style="gap:12px">${icon.doc}<div><b>نصك جاهز للقراءة</b>
            <div class="small ink-2">اقرأه واضغط على أي كلمة لفهمها${p.source.items ? ` · ${p.source.items} كلمة مقترحة` : ''}</div></div></div>
            <span class="btn sm primary">افتح ←</span></a>` : ''}
        ${items.length ? `
        <div class="card" style="margin-top:14px">
          <div class="row between wrap" style="gap:8px;margin-bottom:12px">
            <b>${items.length} ${items.length === 1 ? 'كلمة' : 'كلمات'} من قائمتك</b>
            ${!p.ai ? '<span class="tiny muted">بدون الذكاء الاصطناعي: المعاني من قاموس مختار فقط.</span>' : ''}
          </div>
          <div class="import-list">${items.map((it, i) => rowHtml(it, i)).join('')}</div>
          <div class="divider"></div>
          <div class="tiny muted" style="margin-bottom:8px">أضفها إلى مجموعة (اختياري)</div>
          <div id="gp">${groupPickerHtml(groupIds)}</div>
          <div class="row between wrap" style="margin-top:14px;gap:10px">
            <span class="small ink-2">${keepCount} محددة</span>
            <button class="btn primary" id="save" ${keepCount ? '' : 'disabled'}>${icon.bookmark} حفظ المحدد</button>
          </div>
        </div>` : ''}
        ${p.unclear.length ? `<div class="card soft" style="margin-top:14px"><b class="small">لم نفهم هذه الأسطر — لم نضف منها شيئًا:</b>
          <ul class="small ink-2" style="margin:6px 0 0">${p.unclear.map((l) => `<li dir="auto">${esc(l)}</li>`).join('')}</ul></div>` : ''}
        ${enriching ? `<p class="tiny muted" style="margin-top:8px"><span class="spinner"></span> ✨ نكمل المعاني والمستويات بالذكاء الاصطناعي… ${enriched}/${pending.length}</p>` : ''}
        ${p.ai_error ? `<p class="tiny muted" style="margin-top:8px">تعذّر إكمال بعض التفاصيل بالذكاء الاصطناعي: ${esc(p.ai_error)}</p>` : ''}
        ${!items.length && !p.source ? '<div class="card empty"><h3>ما لقينا كلمات أو نصًا إنجليزيًا</h3><p>جرّب كلمات إنجليزية، أو "word = معنى"، أو فقرة إنجليزية.</p></div>' : ''}`;
    };
    const rowHtml = (it, i) => {
      const badge = it.status === 'saved'
        ? `<span class="chip ar-chip st-mastered">موجودة عندك ✓</span>${it.new_info.length ? `<span class="chip ar-chip st-new">+ ${it.new_info.map((n) => (n === 'example' ? 'مثال جديد' : 'معنى جديد')).join(' و')}</span>` : ''}`
        : it.status === 'known' ? '<span class="chip ar-chip">جديدة عليك</span>' : '<span class="chip ar-chip st-new">جديدة</span>';
      return `
        <div class="import-row ${it.keep ? '' : 'off'} ${it.saved_result ? 'done' : ''}" data-i="${i}">
          <input type="checkbox" class="check" ${it.keep ? 'checked' : ''} ${it.saved_result ? 'disabled' : ''} aria-label="تحديد">
          <div style="min-width:0">
            <div class="row wrap" style="gap:6px"><b class="en term-sm">${esc(it.term)}</b><button type="button" class="btn icon sm ghost" data-say="${esc(it.term)}" aria-label="استمع">${icon.speaker}</button>${levelChip(it.level)}${badge}
              ${it.unsure ? '<span class="chip ar-chip st-difficult" title="لم نتعرّف عليها بثقة">غير متأكدين منها</span>' : ''}
              ${it.saved_result ? `<span class="chip ar-chip st-mastered">${it.saved_result === 'added' ? 'تم الحفظ ✓' : it.saved_result === 'updated' ? 'تم التحديث ✓' : 'موجودة عندك ✓'}</span>` : ''}</div>
            ${it.term.toLowerCase() !== it.input.toLowerCase() ? `<div class="tiny muted en">كتبتَ: ${esc(it.input)}</div>` : ''}
            <input class="input meaning-input" data-i="${i}" dir="rtl" value="${esc(it.arabic || '')}" placeholder="المعنى بالعربية (اختياري)" ${it.saved_result ? 'disabled' : ''}>
            ${it.meaning_from && it.meaning_from !== 'you' ? `<div class="tiny muted">المعنى من ${it.meaning_from === 'ai' ? 'الذكاء الاصطناعي' : it.meaning_from === 'saved' ? 'كلماتك' : 'القاموس'}</div>` : ''}
            ${it.examples.map((e) => `<div class="small en ink-2" style="margin-top:4px">“${esc(e.sentence)}”</div>`).join('')}
          </div>
        </div>`;
    };
    draw();
    // 🔊 the pasted words are read aloud once (up to 10), one after another
    (async () => {
      for (const it of items.slice(0, 10)) {
        if (!result.isConnected || !document.contains(result)) break;
        await speak(it.term).catch(() => {});
      }
    })();

    (async () => {
      const size = p.enrich_batch || 10;
      for (let k = 0; enriching && k < pending.length; k += size) {
        const batch = pending.slice(k, k + size);
        try {
          const r = await api.importEnrich(batch.map(({ keep, touched, ...row }) => row));
          r.items.forEach((fresh, n) => {
            const it = batch[n];
            if (it.saved_result) return;
            const typed = it.meaning_from === 'you' ? it.arabic : null;
            Object.assign(it, fresh, typed ? { arabic: typed, meaning_from: 'you' } : {});
            if (!it.touched) it.keep = (it.status !== 'saved' && !it.unsure) || it.new_info.length > 0;
          });
          if (r.ai_error) {
            p.ai_error = r.ai_error;
            break;
          }
        } catch (err) {
          p.ai_error = err.message;
          break;
        }
        enriched = Math.min(pending.length, k + size);
        if (!result.contains(document.activeElement) || !document.activeElement.matches('.meaning-input')) draw();
      }
      enriching = false;
      if (!result.contains(document.activeElement) || !document.activeElement.matches('.meaning-input')) draw();
    })();

    result.addEventListener('change', (e) => {
      const row = e.target.closest('.import-row');
      if (!row || !e.target.matches('.check')) return;
      items[Number(row.dataset.i)].keep = e.target.checked;
      items[Number(row.dataset.i)].touched = true;
      draw();
    });
    result.addEventListener('input', (e) => {
      if (!e.target.matches('.meaning-input')) return;
      const it = items[Number(e.target.dataset.i)];
      it.arabic = e.target.value.trim() || null;
      it.meaning_from = it.arabic ? 'you' : null;
      it.touched = true;
    });
    bindGroupPicker(result, () => groupIds, async (gid, on) => {
      groupIds = on ? [...groupIds, gid] : groupIds.filter((g) => g !== gid);
    });
    result.addEventListener('click', async (e) => {
      if (!e.target.closest('#save')) return;
      const chosen = items.filter((i) => i.keep && !i.saved_result);
      e.target.closest('#save').disabled = true;
      try {
        const r = await api.importSave(chosen.map(({ keep, touched, saved_result: _s, ...row }) => row), groupIds);
        r.results.forEach((res, k) => {
          chosen[k].saved_result = res.result;
          chosen[k].keep = false;
        });
        const added = r.results.filter((x) => x.result === 'added').length;
        const updated = r.results.filter((x) => x.result === 'updated').length;
        toast([added ? `حُفظت ${added} كلمات` : '', updated ? `حُدّثت ${updated}` : ''].filter(Boolean).join(' · ') || 'كلها موجودة عندك ✓');
        await loadGroups();
        draw();
      } catch (err) {
        toast(err.message);
        draw();
      }
    });
  }
  return () => {};
}
