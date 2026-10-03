import { state } from './state.js';
import { speak, stop, wait } from './audio.js';
import { esc, icon, levelChip, highlight, typeLabel } from './ui.js';


/** Listening mode: word → pronunciation → meaning → example, hands-free. */
export function runListening(body, words) {
  let idx = 0;
  let rate = 1;
  let playing = false;
  let auto = true;
  let runId = 0;
  let speakArabic = !!state.user?.speak_arabic;
  const view = body;
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
      <div class="lt-step ${step >= 2 ? 'on' : ''}"><div style="font-size:23px;font-weight:700">${esc(w.arabic || '')}</div><div class="en ink-2" style="text-align:center">${esc(w.simple_english || '')}</div></div>
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
      if (speakArabic && w.arabic) {
        await speak(w.arabic.split('/')[0], { lang: 'ar', rate });
        if (!alive()) return;
      }
      if (w.simple_english) await speak(w.simple_english, { rate });
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
