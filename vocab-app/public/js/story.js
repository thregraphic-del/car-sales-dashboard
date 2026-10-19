// Story mode: a short story written with the learner's words, a translation
// under every sentence, read aloud sentence by sentence (Arabic optional).
import { api } from './api.js';
import { speak, stop, wait } from './audio.js';
import { esc, icon, termRegex, toast } from './ui.js';

const pref = (k, d) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const setPref = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

/** The sentence with the learner's words marked. */
function markWords(text, words) {
  const ranges = [];
  for (const w of words) {
    const re = termRegex(w.term);
    if (!re) continue;
    const g = new RegExp(re.source, 'gi');
    let m;
    while ((m = g.exec(text))) {
      if (!m[0]) break;
      ranges.push([m.index, m.index + m[0].length, w]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '';
  let pos = 0;
  for (const [s, e, w] of ranges) {
    if (s < pos) continue;
    out += esc(text.slice(pos, s));
    out += `<mark class="story-word" title="${esc(w.arabic || '')}">${esc(text.slice(s, e))}</mark>`;
    pos = e;
  }
  return out + esc(text.slice(pos));
}

export function runStory(stage, { groupId = null, label = 'كلماتك الأخيرة' } = {}) {
  let story = null;
  let runId = 0;
  let idx = 0;
  let playing = false;
  let rate = 1;
  let readAr = pref('story.readAr', '0') === '1';
  let showAr = pref('story.showAr', '1') === '1';

  const intro = () => {
    stage.innerHTML = `
      <div class="card story-intro">
        <div class="row" style="gap:12px;align-items:flex-start"><div class="pack-icon">📖</div>
          <div><b>قصة من ${esc(label)}</b>
          <p class="small ink-2" style="margin:4px 0 0">نكتب لك قصة قصيرة تستخدم كلماتك، مع ترجمة كل جملة تحتها، ونقرؤها لك جملةً جملة.</p></div></div>
        <div class="btn-row" style="margin-top:14px"><button class="btn primary" id="makeStory">✨ اكتب القصة</button></div>
        <div id="storyStatus" class="small" style="margin-top:10px"></div>
      </div>`;
    stage.querySelector('#makeStory').addEventListener('click', make);
  };

  async function make() {
    const st = stage.querySelector('#storyStatus');
    const btn = stage.querySelector('#makeStory');
    if (btn) btn.disabled = true;
    if (st) st.innerHTML = '<span class="spinner"></span> نكتب القصة بكلماتك…';
    try {
      story = await api.story(groupId);
      idx = 0;
      draw();
    } catch (err) {
      if (btn) btn.disabled = false;
      if (st) st.innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  }

  function draw() {
    stage.innerHTML = `
      <div class="card story-card">
        <div class="row between wrap" style="gap:8px">
          <div><h2 class="en" dir="ltr" style="margin:0">${esc(story.title)}</h2><div class="small ink-2">${esc(story.title_ar)}</div></div>
          <button class="btn sm ghost" id="newStory">↻ قصة أخرى</button>
        </div>
        <div class="row wrap story-words">${story.words.map((w) => `<span class="chip"><b class="en-inline">${esc(w.term)}</b> ${esc(w.arabic)}</span>`).join('')}</div>
        <div class="story-controls">
          <button class="big-play" id="storyPlay" aria-label="تشغيل">${icon.play}</button>
          <div class="segmented" id="storyRate"><button data-r="1" class="active">عادي</button><button data-r="0.75">بطيء</button></div>
          <label class="row small" style="gap:6px"><input type="checkbox" class="check" id="readAr" ${readAr ? 'checked' : ''}> اقرأ العربي أيضًا</label>
          <label class="row small" style="gap:6px"><input type="checkbox" class="check" id="showAr" ${showAr ? 'checked' : ''}> أظهر الترجمة</label>
        </div>
        <div class="story-lines ${showAr ? '' : 'hide-ar'}" id="storyLines">${story.sentences.map((s, k) => `
          <div class="story-line" data-k="${k}"><p class="en" dir="ltr">${markWords(s.en, story.words)}</p><p class="story-ar" dir="rtl">${esc(s.ar)}</p></div>`).join('')}</div>
        <p class="tiny muted" style="margin-top:8px">اضغط أي جملة لتبدأ القراءة منها.</p>
      </div>`;
    const lines = stage.querySelector('#storyLines');
    stage.querySelector('#storyPlay').addEventListener('click', () => (playing ? setPlaying(false) : play(idx)));
    stage.querySelector('#newStory').addEventListener('click', () => {
      setPlaying(false);
      intro();
      make();
    });
    stage.querySelectorAll('#storyRate [data-r]').forEach((b) => b.addEventListener('click', () => {
      rate = Number(b.dataset.r);
      stage.querySelectorAll('#storyRate [data-r]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    stage.querySelector('#readAr').addEventListener('change', (e) => {
      readAr = e.target.checked;
      setPref('story.readAr', readAr ? '1' : '0');
    });
    stage.querySelector('#showAr').addEventListener('change', (e) => {
      showAr = e.target.checked;
      setPref('story.showAr', showAr ? '1' : '0');
      lines.classList.toggle('hide-ar', !showAr);
    });
    lines.addEventListener('click', (e) => {
      const line = e.target.closest('.story-line');
      if (line) play(Number(line.dataset.k));
    });
    mark(-1);
  }

  const mark = (k) => {
    stage.querySelectorAll('.story-line').forEach((el) => el.classList.toggle('current', Number(el.dataset.k) === k));
    const el = stage.querySelector(`.story-line[data-k="${k}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  function setPlaying(p) {
    playing = p;
    const btn = stage.querySelector('#storyPlay');
    if (btn) btn.innerHTML = p ? icon.pause : icon.play;
    if (!p) {
      runId += 1;
      stop();
    }
  }

  async function play(from) {
    setPlaying(false);
    setPlaying(true);
    const my = runId;
    const alive = () => my === runId && stage.isConnected;
    try {
      for (let k = from; k < story.sentences.length; k += 1) {
        idx = k;
        mark(k);
        await speak(story.sentences[k].en, { rate });
        if (!alive()) return;
        if (readAr && story.sentences[k].ar) {
          await wait(250);
          if (!alive()) return;
          await speak(story.sentences[k].ar, { lang: 'ar', rate });
          if (!alive()) return;
        }
        await wait(450);
        if (!alive()) return;
      }
      idx = 0;
      setPlaying(false);
      mark(-1);
    } catch {
      setPlaying(false);
      toast('الصوت غير مدعوم في هذا المتصفح');
    }
  }

  intro();
  return () => setPlaying(false);
}
