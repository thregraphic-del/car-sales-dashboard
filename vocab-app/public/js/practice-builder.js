// «جهّز تدريبك» — the practice builder.
// Five filters that each answer one question the learner actually has, read from the
// learner's own data (when and where a word was saved, and every answer given):
//   1) 📚 من أين؟     the words of the last video, the last few videos, chosen videos or groups
//   2) 🕒 متى؟        the last N words saved, today, this week, this month, older than a month
//   3) 📈 أدائي       missed lately, weak, never practised, due now, about to be forgotten, mastered
//   4) 🎚 الصعوبة     CEFR level, how common, single words or expressions
//   5) 🎯 كم وبأي ترتيب  how many, smart priority / random / newest / oldest / hardest,
//                       and «not again today» so the same words don't come back in one day
// Presets set the five filters in one tap; when nothing matches, the builder says which
// filter to loosen and how many words that would give. The result is the exact list.
import { esc, levelChip, usageDot } from './ui.js';
import { filterBarHtml, filterBarClick, placeMenus, closeOnOutside, ytThumb } from './filter-bar.js';

const DAY = 86400000;
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const DEFAULTS = {
  from: 'all', sources: [], groups: [],
  when: 'all', lastN: 10,
  perf: [],
  levels: [], usage: [], kind: 'all',
  count: 20, order: 'smart', notToday: true,
};

const PRESETS = [
  ['smart', '⚡ جلسة ذكية', 'أهم ٢٠ كلمة الحين: الأخطاء الحديثة ثم المستحقة ثم الضعيفة', { order: 'smart', count: 20 }],
  ['mistakes', '🔥 أخطائي', 'كل كلمة أخطأت فيها في آخر ٧ أيام', { perf: ['wrong'], count: 0, order: 'smart' }],
  ['lastVideo', '🎬 آخر مقطع', 'كلمات آخر مقطع حفظت منه', { from: 'lastVideo', count: 0, order: 'old' }],
  ['lastN', '🆕 آخر ١٠ كلمات', 'آخر ١٠ كلمات حفظتها', { when: 'lastN', lastN: 10, count: 0, order: 'new', notToday: false }],
  ['fresh', '🌱 لم أتدرب عليها', 'كلمات حفظتها ولم تتدرّب عليها أبدًا', { perf: ['never'], count: 20, order: 'new' }],
  ['fading', '🌫 مهدّدة بالنسيان', 'كلمات لم ترها منذ أسبوعين ولم تتقنها بعد', { perf: ['fading'], count: 20, order: 'smart' }],
  ['due', '⏰ مستحقة الحين', 'ما حان وقت مراجعته حسب جدول التكرار المتباعد', { perf: ['due'], count: 30, order: 'smart' }],
];

/** Learning signals of one word, from its review history. */
function signals(w, now) {
  const t = (x) => (x ? new Date(x).getTime() : null);
  const lastWrong = t(w.last_wrong_at);
  const lastSeen = t(w.last_reviewed_at);
  const saved = t(w.saved_at) || now;
  const answered = (w.correct_count || 0) + (w.wrong_count || 0);
  return {
    wrong: lastWrong != null && now - lastWrong <= 7 * DAY,
    weak: answered >= 2 && (w.mastery < 50 || w.difficult),
    never: !w.review_count,
    due: Boolean(w.due),
    fading: w.status !== 'mastered' && now - (lastSeen ?? saved) >= 14 * DAY,
    mastered: w.status === 'mastered',
    practisedToday: lastSeen != null && new Date(lastSeen).toDateString() === new Date(now).toDateString(),
    // the higher, the more the word needs practice now
    score: (lastWrong != null && now - lastWrong <= 7 * DAY ? 100 - (now - lastWrong) / DAY * 8 : 0)
      + (w.due ? 60 + Math.min(30, (now - (t(w.next_review_at) || now)) / DAY) : 0)
      + (answered ? (100 - (w.mastery || 0)) / 2 : 25)
      + (w.difficulty || 0) * 40
      + Math.min(30, (now - (lastSeen ?? saved)) / DAY),
  };
}

export const PERF = [
  ['wrong', '🔥 أخطأت فيها مؤخرًا'], ['weak', '🧱 ضعيفة'], ['never', '🌱 لم أتدرب عليها'],
  ['due', '⏰ مستحقة'], ['fading', '🌫 مهدّدة بالنسيان'], ['mastered', '✅ متقنة'],
];

/** The words the filters choose, in order (pure — also used by the tests). */
export function selectWords(all, F, now = Date.now()) {
  const sig = new Map(all.map((w) => [w.uv_id, signals(w, now)]));
  // videos, most recent first (by the last word saved from each)
  const vids = videoList(all);
  let list = all.filter((w) => {
    if (F.from === 'lastVideo' && w.source?.id !== vids[0]?.id) return false;
    if (F.from === 'last3' && !vids.slice(0, 3).some((v) => v.id === w.source?.id)) return false;
    if (F.from === 'videos' && F.sources.length && !F.sources.map(Number).includes(w.source?.id)) return false;
    if (F.from === 'groups' && F.groups.length && !F.groups.some((g) => w.group_ids.includes(Number(g)))) return false;
    const t = new Date(w.saved_at).getTime();
    if (F.when === 'today' && new Date(t).toDateString() !== new Date(now).toDateString()) return false;
    if (F.when === 'yesterday' && new Date(t).toDateString() !== new Date(now - DAY).toDateString()) return false;
    if (F.when === 'week' && now - t > 7 * DAY) return false;
    if (F.when === 'month' && now - t > 30 * DAY) return false;
    if (F.when === 'older' && now - t <= 30 * DAY) return false;
    const s = sig.get(w.uv_id);
    if (F.perf.length && !F.perf.some((p) => s[p])) return false;
    if (F.levels.length && !F.levels.includes(w.level)) return false;
    if (F.usage.length && !F.usage.includes(w.usage)) return false;
    const expr = w.item_type === 'expression' || /\s/.test(w.term);
    if (F.kind === 'words' && expr) return false;
    if (F.kind === 'expressions' && !expr) return false;
    if (F.notToday && s.practisedToday) return false;
    return true;
  });
  if (F.when === 'lastN') {
    const n = Math.max(1, Number(F.lastN) || 10);
    list = [...list].sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at)).slice(0, n);
  }
  const order = {
    smart: (a, b) => sig.get(b.uv_id).score - sig.get(a.uv_id).score,
    new: (a, b) => new Date(b.saved_at) - new Date(a.saved_at),
    old: (a, b) => new Date(a.saved_at) - new Date(b.saved_at),
    hard: (a, b) => (b.difficulty || 0) - (a.difficulty || 0) || (a.mastery || 0) - (b.mastery || 0),
    random: null,
  }[F.order];
  if (order) list = [...list].sort(order);
  else list = shuffleStable(list, F.seed || 1);
  const count = Number(F.count) || 0;
  return { list: count ? list.slice(0, count) : list, sig };
}

function shuffleStable(list, seed) {
  let x = seed;
  const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  return list.map((w) => [rnd(), w]).sort((a, b) => a[0] - b[0]).map(([, w]) => w);
}

export function videoList(all) {
  const m = new Map();
  for (const w of all) {
    if (!w.source?.id) continue;
    const t = new Date(w.saved_at).getTime();
    const v = m.get(w.source.id) || { id: w.source.id, title: w.source.title || '', youtube_id: w.source.youtube_id, is_demo: w.source.is_demo, thumbnail_url: w.source.thumbnail_url, last: 0, n: 0 };
    v.last = Math.max(v.last, t);
    v.n += 1;
    m.set(w.source.id, v);
  }
  return [...m.values()].sort((a, b) => b.last - a.last);
}

/** One-line summary of a filter, for its folded header. */
function summary(F, key, ctx) {
  if (key === 'from') return { all: 'كل كلماتي', lastVideo: `آخر مقطع${ctx.vids[0] ? ` — ${ctx.vids[0].title.slice(0, 28)}` : ''}`, last3: 'آخر ٣ مقاطع', videos: F.sources.length ? `${F.sources.length} مقطع` : 'اختر المقاطع', groups: F.groups.length ? `${F.groups.length} مجموعة` : 'اختر المجموعات' }[F.from];
  if (key === 'when') return { all: 'أي وقت', lastN: `آخر ${F.lastN} كلمة`, today: 'اليوم', yesterday: 'أمس', week: 'آخر ٧ أيام', month: 'آخر ٣٠ يومًا', older: 'أقدم من شهر' }[F.when];
  if (key === 'perf') return F.perf.length ? PERF.filter(([k]) => F.perf.includes(k)).map(([, l]) => l.split(' ').slice(1).join(' ')).join('، ') : 'كل الحالات';
  if (key === 'level') return [F.levels.join(' ') || 'كل المستويات', F.usage.length ? F.usage.map((u) => ({ common: 'شائعة', medium: 'متوسطة', rare: 'نادرة' })[u]).join('/') : '', { all: '', words: 'كلمات', expressions: 'عبارات' }[F.kind]].filter(Boolean).join(' · ');
  if (key === 'count') return `${F.count ? `${F.count} كلمة` : 'كل النتائج'} · ${{ smart: 'ذكي', random: 'عشوائي', new: 'الأحدث', old: 'الأقدم', hard: 'الأصعب' }[F.order]}${F.notToday ? ' · بلا تكرار اليوم' : ''}`;
  return '';
}

/**
 * Draw the builder into `stage`. groups: [{id,name}]. onGo(list, mode) starts the practice.
 * Returns nothing; everything lives inside `stage`.
 */
export function renderBuilder(stage, { words: all, groups = [], games = [], onGo }) {
  let F = { ...DEFAULTS };
  try { F = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('practice.builder2') || '{}') }; } catch { /* first time */ }
  F.seed = Math.floor(Math.random() * 100000) + 1;
  let open = '';
  let preset = '';
  const off = new Set();
  const vids = videoList(all);
  const save = () => { try { localStorage.setItem('practice.builder2', JSON.stringify({ ...F, seed: undefined })); } catch { /* storage unavailable */ } };

  const chip = (name, v, label, active, multi = false) => `<button type="button" class="sopt${active ? ' active' : ''}" data-f="${name}" data-v="${esc(String(v))}" data-multi="${multi ? 1 : 0}">${label}</button>`;
  // three icon buttons, each opens one drop-down panel (similar filters merged)
  const GROUPS = [['words', '📚', 'الكلمات', ['from', 'when']], ['level', '📈', 'مستواي', ['perf', 'level']], ['count', '🎯', 'العدد', ['count']]];
  const bodies = {};
  const section = (key, icon, title, body) => { bodies[key] = `<div class="pb-sub"><div class="pb-sublabel">${icon} ${title}</div>${body}</div>`; return ''; };
  const groupsHtml = () => `<div class="pb-icons">${GROUPS.map(([k, ic, t, keys]) => `<button type="button" class="pb-icon${open === k ? ' open' : ''}" data-open="${k}"><span>${ic} ${t} ▾</span><span class="pb-sum">${esc(keys.map((x) => summary(F, x, { vids })).join(' · '))}</span></button>`).join('')}</div>
      ${open ? `<div class="pb-drop">${GROUPS.find(([k]) => k === open)[3].map((x) => bodies[x]).join('')}</div>` : ''}`;

  // when nothing matches: which single filter, if reset, gives words back — and how many
  const loosen = () => {
    const tries = [
      ['from', 'من أين', { from: 'all', sources: [], groups: [] }], ['when', 'متى', { when: 'all' }], ['perf', 'أدائي', { perf: [] }],
      ['level', 'الصعوبة', { levels: [], usage: [], kind: 'all' }], ['notToday', 'بلا تكرار اليوم', { notToday: false }],
    ];
    return tries.map(([k, l, patch]) => [k, l, patch, selectWords(all, { ...F, ...patch }).list.length]).filter(([, , , n]) => n > 0);
  };

  function draw() {
    const { list, sig } = selectWords(all, F);
    const chosen = list.filter((w) => !off.has(w.uv_id));
    const counts = {
      wrong: chosen.filter((w) => sig.get(w.uv_id).wrong).length,
      never: chosen.filter((w) => sig.get(w.uv_id).never).length,
      due: chosen.filter((w) => sig.get(w.uv_id).due).length,
    };
    const lv = LEVELS.map((l) => [l, chosen.filter((w) => w.level === l).length]).filter(([, n]) => n);
    // 🧩 the shared filter bar (same as «كلماتي»): العدد · المستوى · الحالة · المقطع · الوقت
    const n = (patch) => selectWords(all, { ...F, ...patch, count: 0 }).list.length;
    const srcVal = F.from === 'groups' && F.groups.length === 1 ? `g:${F.groups[0]}` : F.from === 'videos' && F.sources.length === 1 ? `v:${F.sources[0]}` : F.from;
    const defs = [
      { k: 'count', t: 'العدد', value: String(Number(F.count) || 0), opts: [['10', '10'], ['20', '20'], ['30', '30'], ['50', '50'], ['0', 'الكل']] },
      { k: 'levels', t: 'المستوى', multi: true, all: 'كل المستويات', value: F.levels.map(String),
        opts: [['', 'كل المستويات', n({ levels: [] })], ...LEVELS.map((l) => [l, l, n({ levels: [l] })])] },
      { k: 'perf', t: 'الحالة', value: F.perf.length === 1 ? F.perf[0] : '',
        opts: [['', 'الكل'], ['never', 'جديدة'], ['due', 'تحتاج مراجعة'], ['weak', 'صعبة'], ['mastered', 'متقنة'], ['wrong', 'أخطائي']].map(([v, l]) => [v, l, n({ perf: v ? [v] : [] })]) },
      { k: 'from', t: 'المقطع', video: true, value: srcVal,
        opts: [['all', 'كل المقاطع', n({ from: 'all', sources: [], groups: [] })],
          ...(vids.length ? [['lastVideo', 'آخر مقطع', null, ytThumb(vids[0])], ['last3', 'آخر ٣ مقاطع', null, '']] : []),
          ...vids.map((v) => [`v:${v.id}`, v.title, v.n, ytThumb(v)]),
          ...groups.map((g) => [`g:${g.id}`, `📁 ${g.name}`])] },
      { k: 'when', t: 'الوقت', value: F.when === 'lastN' ? 'all' : F.when, opts: [['all', 'أي وقت'], ['today', 'اليوم'], ['yesterday', 'أمس'], ['week', 'آخر أسبوع'], ['month', 'آخر شهر']] },
    ];
    stage._defs = defs;
    stage.innerHTML = `<div class="card pb pb4">
      ${filterBarHtml(defs, open)}
      <div class="pb-result">
        <div class="pb-count"><b>${chosen.length}</b> كلمة جاهزة ${list.length ? `<button type="button" class="link-btn tiny" data-showlist>عرض ▾</button>` : ''}</div>
        ${!list.length ? '<div class="sopts"><button type="button" class="sopt" data-reset>↺ كل كلماتي</button></div>' : `<details class="pb-list"${stage._listOpen ? ' open' : ''}><summary class="hidden"></summary>
          <div class="pf-list">${list.map((w) => `<label class="pf-item"><input type="checkbox" class="check" data-pv="${w.uv_id}" ${off.has(w.uv_id) ? '' : 'checked'}> <b class="en">${esc(w.term)}</b> <span class="tiny ink-2">${esc(w.arabic || '')}</span></label>`).join('')}</div></details>`}
        <div class="pb-games-title">${chosen.length ? `اختر لعبة — تبدأ بهذه الـ ${chosen.length} كلمة:` : 'اختر كلمات أولًا.'}</div>
        <div class="pb-games">${games.map((g) => `<button type="button" class="pb-game" data-game="${g.mode}:${g.type || ''}" ${chosen.length ? '' : 'disabled'}><span class="pb-gi">${g.icon}</span><b>${g.name}</b><span class="tiny muted">${g.desc || ''}</span></button>`).join('')}</div>
      </div></div>`;
    save();
    stage._chosen = chosen;
    placeMenus(stage);
  }

  stage.onclick = (e) => {
    const t = e.target;
    const fb = filterBarClick(e, stage._defs || [], open);
    if (fb) {
      if ('open' in fb) { open = fb.open; return draw(); }
      const v = fb.value;
      if (fb.k === 'from') {
        F.groups = []; F.sources = [];
        if (v.startsWith('g:')) { F.from = 'groups'; F.groups = [v.slice(2)]; } else if (v.startsWith('v:')) { F.from = 'videos'; F.sources = [v.slice(2)]; } else F.from = v;
      }
      if (fb.k === 'when') F.when = v;
      if (fb.k === 'perf') F.perf = v ? [v] : [];
      if (fb.k === 'levels') F.levels = v;
      if (fb.k === 'count') F.count = Number(v);
      if (fb.close) open = '';
      off.clear();
      return draw();
    }
    if (t.closest('[data-showlist]')) { stage._listOpen = !stage._listOpen; return draw(); }
    const pr = t.closest('[data-preset]');
    if (pr) {
      const p = PRESETS.find(([k]) => k === pr.dataset.preset);
      F = { ...DEFAULTS, ...p[3], seed: F.seed };
      preset = p[0];
      off.clear();
      return draw();
    }
    const head = t.closest('[data-open]');
    if (head) { open = open === head.dataset.open ? '' : head.dataset.open; return draw(); }
    const b = t.closest('[data-f]');
    if (b) {
      const k = b.dataset.f;
      const v = b.dataset.v;
      if (b.dataset.multi === '1') F[k] = F[k].map(String).includes(v) ? F[k].filter((x) => String(x) !== v) : [...F[k], v];
      else F[k] = k === 'count' ? Number(v) : v;
      if (k === 'from' && v === 'videos' && !F.sources.length && vids[0]) F.sources = [String(vids[0].id)];
      if (k === 'order' && v === 'random') F.seed = Math.floor(Math.random() * 100000) + 1;
      preset = '';
      off.clear();
      return draw();
    }
    const lo = t.closest('[data-loosen]');
    if (lo) {
      const patch = { from: { from: 'all', sources: [], groups: [] }, when: { when: 'all' }, perf: { perf: [] }, level: { levels: [], usage: [], kind: 'all' }, notToday: { notToday: false } }[lo.dataset.loosen];
      F = { ...F, ...patch };
      return draw();
    }
    if (t.closest('[data-reset]')) { F = { ...DEFAULTS, seed: F.seed }; preset = ''; return draw(); }
    if (t.closest('[data-all]')) { off.clear(); return draw(); }
    if (t.closest('[data-none]')) { selectWords(all, F).list.forEach((w) => off.add(w.uv_id)); return draw(); }
    const g = t.closest('[data-game]');
    if (g) { const [m, type] = g.dataset.game.split(':'); return onGo(stage._chosen || [], m, type || undefined); }
    return undefined;
  };
  if (!stage._outside) {
    stage._outside = closeOnOutside(stage, () => open, () => { open = ''; draw(); });
    window.addEventListener('hashchange', () => { stage._outside?.(); stage._outside = null; }, { once: true });
  }
  stage.onchange = (e) => {
    const c = e.target.closest('[data-pv]');
    if (c) { const v = Number(c.dataset.pv); if (c.checked) off.delete(v); else off.add(v); const keep = stage.querySelector('.pb-list')?.open; draw(); if (keep) stage.querySelector('.pb-list').open = true; return; }
    if (e.target.id === 'pbLastN') { F.lastN = Math.max(1, Number(e.target.value) || 10); F.when = 'lastN'; }
    if (e.target.id === 'pbCount') F.count = Math.max(0, Number(e.target.value) || 0);
    if (e.target.id === 'pbNotToday') F.notToday = e.target.checked;
    preset = '';
    draw();
  };
  draw();
}
