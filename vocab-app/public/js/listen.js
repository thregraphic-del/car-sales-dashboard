// 🎧 الاستماع: every word of the session in one list (English + Arabic meaning). It goes down the list by itself,
// saying each word in English and then its Arabic meaning, highlighting the one being read.
// No settings — one button: pause / continue.
import { speak, stop, wait, prefetchPronunciation, needsTap } from './audio.js';
import { esc, icon } from './ui.js';

export function runListening(body, words) {
  let idx = 0;
  let playing = false;
  let finished = false;
  let runId = 0;
  prefetchPronunciation(words.map((w) => w.term));

  body.innerHTML = `
    <div class="lt2">
      <div class="lt2-bar card"><span class="lt2-count en-inline" id="ltCount"></span>
        <button type="button" class="btn primary lt2-pp" id="ltPlay"></button></div>
      <ol class="lt2-list card" id="ltList">${words.map((w, i) => `<li data-k="${i}"><span class="lt2-n en-inline">${i + 1}</span><b class="lt2-en en" dir="ltr">${esc(w.term)}</b><span class="lt2-ar">${esc(w.arabic || '—')}</span></li>`).join('')}</ol>
    </div>`;
  const btn = body.querySelector('#ltPlay');
  const count = body.querySelector('#ltCount');
  const list = body.querySelector('#ltList');
  const alive = (my) => my === runId && body.isConnected;

  function mark() {
    count.textContent = `${idx + 1} / ${words.length}`;
    list.querySelectorAll('li').forEach((li, i) => {
      li.classList.toggle('on', i === idx);
      li.classList.toggle('done', i < idx);
    });
    list.querySelector('li.on')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function paintButton() {
    btn.innerHTML = playing ? `${icon.pause} إيقاف مؤقت` : finished ? `${icon.repeat} إعادة من البداية` : `${icon.play} ${idx ? 'كمّل' : 'ابدأ'}`;
  }

  async function playFrom() {
    const my = ++runId;
    while (alive(my) && playing && idx < words.length) {
      const w = words[idx];
      mark();
      try {
        await speak(w.term);
        if (!alive(my)) return;
        await wait(450);
        if (w.arabic) {
          await speak(w.arabic.split('/')[0], { lang: 'ar' });
          if (!alive(my)) return;
        }
        await wait(900);
      } catch {
        break;
      }
      if (!alive(my)) return;
      idx += 1;
    }
    if (!alive(my)) return;
    playing = false;
    if (idx >= words.length) { finished = true; idx = words.length - 1; mark(); }
    paintButton();
  }

  function pause() {
    playing = false;
    runId += 1;
    stop();
    paintButton();
  }
  function play() {
    if (finished) { finished = false; idx = 0; }
    playing = true;
    paintButton();
    playFrom();
  }

  btn.addEventListener('click', () => (playing ? pause() : play()));
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-k]');
    if (!li) return;
    idx = Number(li.dataset.k);
    finished = false;
    stop();
    play();
  });

  mark();
  paintButton();
  if (!needsTap()) play(); // iPhone only lets sound start from a tap: it waits for «ابدأ»
  return () => { runId += 1; stop(); };
}
