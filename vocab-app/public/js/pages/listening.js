import { api } from '../api.js';
import { state } from '../state.js';
import { speak, stop, wait } from '../audio.js';
import { esc, icon, levelChip, emptyState, highlight, typeLabel } from '../ui.js';

const SCOPES = [
  ['today', 'كلمات اليوم'],
  ['review', 'المستحقة'],
  ['difficult', 'الصعبة'],
  ['week', 'هذا الأسبوع'],
  ['all', 'الكل'],
];

export async function render(view, { params }) {
  const scope = params.scope || (params.campaign ? null : 'today');
  let words;
  let title = 'استمع وتعلّم';
  if (params.campaign) {
    const c = await api.campaign(params.campaign);
    words = c.words;
    title = `استماع: ${c.name}`;
  } else if (scope === 'today') {
    words = (await api.gamePool('today')).words;
  } else {
    words = await api.words({ section: scope });
  }

  let idx = 0;
  let rate = 1;
  let playing = false;
  let auto = true;
  let runId = 0;
  let speakArabic = !!state.user?.speak_arabic;

  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Listen &amp; Learn</div><h1>${esc(title)}</h1>
      <p>الكلمة ← النطق ← المعنى ← المثال. استمع أثناء المشي أو قبل النوم.</p></div></div>
    ${scope ? `<div class="tabs">${SCOPES.map(([k, l]) => `<a class="tab ${k === scope ? 'active' : ''}" href="#/listening?scope=${k}">${l}</a>`).join('')}</div>` : ''}
    <div id="body"></div>`;
  const body = view.querySelector('#body');
  if (!words.length) {
    body.innerHTML = emptyState('🎧', 'لا توجد كلمات هنا', 'اختر مجموعة أخرى أو احفظ كلمات جديدة.', '<a class="btn" href="#/listening?scope=all">استمع لكل الكلمات</a>');
    return;
  }

  body.innerHTML = `
    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start" id="lg">
      <div class="stack">
        <div class="card player" id="player"></div>
        <div class="card">
          <div class="controls">
            <button class="btn icon" id="prev" aria-label="السابق">${icon.prev}</button>
            <button class="btn icon" id="repeat" aria-label="إعادة" title="إعادة">${icon.repeat}</button>
            <button class="big-play" id="play" aria-label="تشغيل" style="width:68px;height:68px">${icon.play}</button>
            <div class="segmented" id="rate"><button data-r="1" class="active">عادي</button><button data-r="0.7">بطيء</button></div>
            <button class="btn icon" id="next" aria-label="التالي">${icon.next}</button>
          </div>
          <div class="row wrap" style="justify-content:center;gap:18px;margin-top:14px">
            <label class="row small" style="gap:6px"><input type="checkbox" class="check" id="auto" checked> انتقال تلقائي للكلمة التالية</label>
            <label class="row small" style="gap:6px"><input type="checkbox" class="check" id="ar" ${speakArabic ? 'checked' : ''}> نطق المعنى العربي</label>
          </div>
        </div>
      </div>
      <div class="card" style="padding:14px"><div class="card-title" style="padding:0 8px">القائمة · ${words.length}</div><div class="queue" id="queue"></div></div>
    </div>`;
  const mq = window.matchMedia('(max-width: 900px)');
  const lg = body.querySelector('#lg');
  const applyLayout = () => (lg.style.gridTemplateColumns = mq.matches ? '1fr' : 'minmax(0,2fr) minmax(0,1fr)');
  applyLayout();
  mq.addEventListener('change', applyLayout);

  const player = body.querySelector('#player');
  const queue = body.querySelector('#queue');

  function drawWord(step = 4) {
    const w = words[idx];
    const ex = w.examples?.find((e) => e.kind === 'easy') || w.examples?.[0];
    const exText = ex?.sentence || w.context_sentence;
    player.innerHTML = `
      <div class="row" style="gap:6px">${levelChip(w.level)}<span class="chip ar-chip">${esc(typeLabel(w))}</span><span class="tiny muted en-inline">${idx + 1} / ${words.length}</span></div>
      <div class="lt-step lt-term ${step >= 0 ? 'on' : ''}">${esc(w.term)}</div>
      <div class="lt-step en muted ${step >= 1 ? 'on' : ''}" style="font-size:17px">${esc(w.pronunciation || '')}</div>
      <div class="lt-step ${step >= 2 ? 'on' : ''}"><div style="font-size:23px;font-weight:700">${esc(w.arabic)}</div><div class="en ink-2" style="text-align:center">${esc(w.simple_english)}</div></div>
      ${exText ? `<div class="lt-step quote ${step >= 3 ? 'on' : ''}" style="max-width:520px;text-align:left"><p class="en">${highlight(exText, w.term)}</p></div>` : ''}`;
    queue.innerHTML = words.map((x, k) => `<button class="${k === idx ? 'on' : ''}" data-k="${k}"><span class="en-inline">${esc(x.term)}</span><span class="tiny muted">${esc(x.level)}</span></button>`).join('');
    queue.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }

  async function playWord() {
    const my = ++runId;
    const alive = () => my === runId && view.isConnected;
    const w = words[idx];
    const ex = w.examples?.find((e) => e.kind === 'easy') || w.examples?.[0];
    const exText = ex?.sentence || w.context_sentence;
    try {
      drawWord(0);
      await speak(w.term, { rate });
      if (!alive()) return;
      await wait(500);
      drawWord(1);
      if (!alive()) return;
      await speak(w.term, { rate: rate * 0.8 });
      if (!alive()) return;
      await wait(400);
      drawWord(2);
      if (speakArabic) {
        await speak(w.arabic.split('/')[0], { lang: 'ar', rate });
        if (!alive()) return;
      }
      await speak(w.simple_english, { rate });
      if (!alive()) return;
      await wait(500);
      drawWord(3);
      if (exText) await speak(exText, { rate });
      if (!alive()) return;
      await wait(1200);
      if (!alive()) return;
      if (auto && playing && idx < words.length - 1) {
        idx += 1;
        playWord();
      } else {
        setPlaying(false);
      }
    } catch {
      setPlaying(false);
    }
  }

  function setPlaying(p) {
    playing = p;
    body.querySelector('#play').innerHTML = p ? icon.pause : icon.play;
    if (!p) {
      runId += 1;
      stop();
    }
  }

  const go = (k) => {
    idx = (k + words.length) % words.length;
    if (playing) playWord();
    else drawWord();
  };

  body.querySelector('#play').addEventListener('click', () => {
    if (playing) setPlaying(false);
    else {
      setPlaying(true);
      playWord();
    }
  });
  body.querySelector('#repeat').addEventListener('click', () => {
    setPlaying(true);
    playWord();
  });
  body.querySelector('#next').addEventListener('click', () => go(idx + 1));
  body.querySelector('#prev').addEventListener('click', () => go(idx - 1));
  body.querySelector('#rate').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    rate = Number(b.dataset.r);
    body.querySelectorAll('#rate button').forEach((x) => x.classList.toggle('active', x === b));
    if (playing) playWord();
  });
  body.querySelector('#auto').addEventListener('change', (e) => (auto = e.target.checked));
  body.querySelector('#ar').addEventListener('change', (e) => (speakArabic = e.target.checked));
  queue.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (b) go(Number(b.dataset.k));
  });
  drawWord();
  return () => {
    runId += 1;
    stop();
  };
}
