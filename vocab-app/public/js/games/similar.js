// Game: الكلمات المتشابهة (Look-alike words) — words that start or end the same,
// or differ by a letter or two, shown together with the shared or different
// part highlighted; then a "spot the difference" round.
import { api } from '../api.js';
import { speak } from '../audio.js';
import { esc, shuffle } from '../ui.js';

// Well-known confusing pairs, used when the learner's own words give too few groups.
const CLASSIC = [
  ['affect=يؤثر في', 'effect=تأثير/نتيجة'], ['accept=يقبل', 'except=باستثناء'], ['advice=نصيحة', 'advise=ينصح'],
  ['quiet=هادئ', 'quite=إلى حد ما', 'quit=يترك'], ['lose=يخسر/يفقد', 'loose=فضفاض/مرتخٍ'], ['desert=صحراء', 'dessert=حلوى'],
  ['principal=مدير مدرسة/رئيسي', 'principle=مبدأ'], ['weather=طقس', 'whether=ما إذا'], ['then=ثم', 'than=من (للمقارنة)'],
  ['breath=نَفَس', 'breathe=يتنفس'], ['cloth=قماش', 'clothes=ملابس'], ['complement=يكمّل', 'compliment=مجاملة/مديح'],
  ['adapt=يتكيف', 'adopt=يتبنى'], ['personal=شخصي', 'personnel=الموظفون'], ['later=لاحقًا', 'latter=الأخير (من اثنين)'],
  ['through=عبر/خلال', 'though=رغم أن', 'thorough=شامل/دقيق', 'thought=فكرة'], ['diary=مذكرات', 'dairy=ألبان'],
];

const lower = (s) => String(s || '').toLowerCase();

function distance(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const commonPrefix = (list) => list.reduce((p, w) => {
  let i = 0;
  while (i < p.length && i < w.length && p[i] === w[i]) i += 1;
  return p.slice(0, i);
}, list[0]);
const commonSuffix = (list) => commonPrefix(list.map((w) => [...w].reverse().join(''))).split('').reverse().join('');

/** Letters of `word` that are not shared with `ref` (longest common subsequence). */
function diffMask(word, ref) {
  const a = word;
  const b = ref;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keep = new Array(a.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { keep[i] = true; i += 1; j += 1; } else if (dp[i + 1][j] >= dp[i][j + 1]) i += 1; else j += 1;
  }
  return keep.map((k) => !k);
}

/** The word with the shared part (prefix/suffix) or the different letters highlighted. */
export function markWord(word, group) {
  const w = word.term;
  const lw = lower(w);
  if (group.kind === 'prefix' || group.kind === 'suffix') {
    const part = group.part;
    const at = group.kind === 'prefix' ? 0 : lw.length - part.length;
    return `${esc(w.slice(0, at))}<span class="sim-same">${esc(w.slice(at, at + part.length))}</span>${esc(w.slice(at + part.length))}`;
  }
  const ref = group.words.find((x) => x !== word) || word;
  const mask = diffMask(lw, lower(ref.term));
  return [...w].map((ch, k) => (mask[k] ? `<span class="sim-diff">${esc(ch)}</span>` : esc(ch))).join('');
}

/** Groups of look-alike words (single words only), most confusing first. */
export function buildGroups(words, max = 4) {
  const singles = words.filter((w) => w.arabic && /^[a-z]+$/i.test(w.term) && w.term.length >= 3);
  const used = new Set();
  const groups = [];
  // 1) differ by one or two letters
  for (const a of singles) {
    if (used.has(a.term)) continue;
    const near = singles.filter((b) => b !== a && !used.has(b.term) && lower(b.term) !== lower(a.term) && Math.min(a.term.length, b.term.length) >= 4 && distance(lower(a.term), lower(b.term)) <= 2);
    if (near.length) {
      const g = [a, ...near].slice(0, 10);
      g.forEach((x) => used.add(x.term));
      groups.push({ kind: 'spelling', title: 'متشابهة في الحروف', words: g });
    }
  }
  // 2) same beginning / 3) same ending
  for (const [kind, key, title] of [['prefix', (t) => t.slice(0, 4), (p) => `نفس البداية «${p}…»`], ['suffix', (t) => t.slice(-4), (p) => `نفس النهاية «…${p}»`]]) {
    const by = new Map();
    for (const w of singles) {
      if (used.has(w.term) || w.term.length < 5) continue;
      const k = key(lower(w.term));
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(w);
    }
    for (const list of [...by.values()].filter((l) => l.length >= 2).sort((x, y) => y.length - x.length)) {
      const g = list.slice(0, 10);
      const terms = g.map((x) => lower(x.term));
      const part = kind === 'prefix' ? commonPrefix(terms) : commonSuffix(terms);
      g.forEach((x) => used.add(x.term));
      groups.push({ kind, part, title: title(part), words: g });
    }
  }
  return groups.slice(0, max);
}

function classicGroups(n) {
  return shuffle(CLASSIC).slice(0, n).map((pair) => ({
    kind: 'spelling',
    title: 'كلمات يخلط بينها كثيرون',
    words: pair.map((p) => {
      const [term, arabic] = p.split('=');
      return { term, arabic, uv_id: null };
    }),
  }));
}

function study(stage, groups) {
  return new Promise((resolve) => {
    stage.innerHTML = `
      <div class="card question" style="padding:16px"><div class="prompt" style="margin:0">انظر إلى الكلمات المتشابهة: الجزء الملوّن هو ${'المشترك أو المختلف'}. استمع لكل كلمة ثم ابدأ لعبة الفروقات.</div></div>
      <div class="sim-groups">${groups.map((g) => `
        <div class="card sim-group"><div class="tiny muted" style="margin-bottom:8px">${esc(g.title)}</div>
          ${g.words.map((w) => `<div class="sim-row"><button class="btn icon sm ghost" data-say="${esc(w.term)}" aria-label="استمع">🔊</button>
            <span class="sim-term en" dir="ltr">${markWord(w, g)}</span><span class="small ink-2">${esc(w.arabic)}</span></div>`).join('')}</div>`).join('')}</div>
      <div class="btn-row" style="justify-content:center;margin-top:16px"><button class="btn primary" id="simStart">ابدأ لعبة الفروقات ←</button></div>`;
    stage.querySelector('#simStart').addEventListener('click', resolve);
  });
}

function ask(stage, q) {
  return new Promise((resolve) => {
    const { word, group, type } = q;
    const others = shuffle(group.words.filter((x) => x !== word)).slice(0, 3);
    const opts = shuffle([word, ...others]);
    const prompt = type === 'listen'
      ? `<div class="prompt">استمع واختر الكلمة الصحيحة</div><button class="btn" id="simSay">🔊 استمع مرة أخرى</button>`
      : type === 'meaning'
        ? `<div class="prompt">أي كلمة معناها:</div><div class="q-big" style="font-size:24px">${esc(word.arabic)}</div>`
        : `<div class="prompt">ما معنى</div><div class="q-big en">${esc(word.term)}</div>`;
    const label = (o) => (type === 'word' ? esc(o.arabic) : `<span class="en-inline">${esc(o.term)}</span>`);
    stage.innerHTML = `<div class="card question">${prompt}</div>
      <div class="options">${opts.map((o, k) => `<button class="option" data-k="${k}">${label(o)}</button>`).join('')}</div>
      <div class="feedback" id="fb"></div>
      <div class="next-wrap"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
    if (type === 'listen') {
      setTimeout(() => speak(word.term).catch(() => {}), 200);
      stage.querySelector('#simSay').addEventListener('click', () => speak(word.term).catch(() => {}));
    }
    let done = false;
    stage.querySelectorAll('.option').forEach((btn) => btn.addEventListener('click', () => {
      if (done) return;
      done = true;
      const picked = opts[Number(btn.dataset.k)];
      const ok = picked === word;
      stage.querySelectorAll('.option').forEach((b) => {
        b.disabled = true;
        if (opts[Number(b.dataset.k)] === word) b.classList.add('correct');
      });
      if (!ok) btn.classList.add('wrong');
      const fb = stage.querySelector('#fb');
      fb.className = `feedback show ${ok ? 'ok' : 'no'}`;
      const pair = { kind: 'spelling', words: [word, picked] };
      fb.innerHTML = `<b>${ok ? 'صحيح ✓' : 'انتبه للفرق:'}</b>
        <div class="sim-compare"><div><span class="sim-term en" dir="ltr">${markWord(word, ok ? group : pair)}</span> <span class="small">${esc(word.arabic)}</span></div>
        ${ok ? '' : `<div><span class="sim-term en" dir="ltr">${markWord(picked, { kind: 'spelling', words: [picked, word] })}</span> <span class="small">${esc(picked.arabic)}</span></div>`}</div>`;
      speak(word.term).catch(() => {});
      const next = stage.querySelector('#nextBtn');
      next.classList.remove('hidden');
      next.addEventListener('click', () => resolve(ok));
    }));
  });
}

export default {
  key: 'similar',
  name: 'الكلمات المتشابهة',
  en: 'Look-alike words',
  icon: 'search',
  description: 'كلمات متشابهة في البداية أو النهاية أو الحروف: شاهد الفرق ثم العب لعبة الفروقات.',
  can: (w) => !!w.arabic,
  round: async (stage, { words, record, onProgress }) => {
    stage.innerHTML = '<p class="muted"><span class="spinner"></span> نجمع الكلمات المتشابهة…</p>';
    let mine = [];
    try {
      mine = await api.words();
    } catch {
      mine = words;
    }
    const roundIds = new Set(words.map((w) => w.uv_id));
    let groups = buildGroups([...words, ...mine.filter((w) => !roundIds.has(w.uv_id))]);
    if (groups.length < 3) groups = [...groups, ...classicGroups(3 - groups.length)];
    await study(stage, groups);
    const questions = shuffle(groups.flatMap((g) => g.words.map((word) => ({ word, group: g }))))
      .slice(0, 12)
      .map((q, i) => ({ ...q, type: ['meaning', 'listen', 'word'][i % 3] }));
    for (let i = 0; i < questions.length; i += 1) {
      onProgress?.(i, questions.length);
      const ok = await ask(stage, questions[i]);
      if (questions[i].word.uv_id) await record(questions[i].word, ok);
    }
    onProgress?.(questions.length, questions.length);
    return {};
  },
};
