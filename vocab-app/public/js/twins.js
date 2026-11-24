// 👯 Word Twins — look-alike / sound-alike words. Pick the source (the 100-group file or your own words),
// see each group side by side, answer a question per word, then keep the groups in «كلماتي» if you want.
import { api } from './api.js';
import { speak } from './audio.js';
import { TWINS } from './data/twins-data.js';
import { buildGroups } from './games/similar.js';
import { esc, shuffle, toast, openModal, closeModal, icon } from './ui.js';

const lower = (s) => String(s || '').toLowerCase();
const groupsWord = (n) => (n === 1 ? 'مجموعة واحدة' : n === 2 ? 'مجموعتين' : `<b class="en-inline">${n}</b> ${n <= 10 ? 'مجموعات' : 'مجموعة'}`);
const PART = 25; // groups per section (the file of 100 = 4 sections)
const PKEY = 'twins.parts.v1';
const readParts = () => { try { return JSON.parse(localStorage.getItem(PKEY) || '{}'); } catch { return {}; } };
const saveBest = (src, part, pct) => { try { const d = readParts(); d[src] = d[src] || {}; d[src][part] = Math.max(d[src][part] || 0, pct); localStorage.setItem(PKEY, JSON.stringify(d)); } catch { /* storage unavailable */ } };
const AUTO_MS = { ok: 900, no: 2100 };

/** The groups of the learner's own words: curated groups that contain at least one saved word, plus look-alikes found among them. */
export function groupsFromMyWords(mine) {
  const have = new Set(mine.map((w) => lower(w.term)));
  const curated = TWINS.filter((g) => g.words.some((w) => have.has(lower(w.term))));
  const known = new Set(curated.flatMap((g) => g.words.map((w) => lower(w.term))));
  const rest = buildGroups(mine.filter((w) => !known.has(lower(w.term))), 40)
    .map((g, i) => ({ id: `m${i}`, level: null, words: g.words.map((w) => ({ term: w.term, ipa: w.pronunciation || '', ar: w.arabic, def: w.simple_english || '', pr: /[\u0600-\u06FF]/.test(w.pronunciation || '') ? w.pronunciation : '' })) }))
    .filter((g) => g.words.length >= 2);
  return [...curated, ...rest];
}

export async function runTwins(stage, { onExit } = {}) {
  let stopped = false;
  let ended = false; // «أنهِ التدريب»: show the result of what was done
  let timer = null;
  const stop = () => { stopped = true; clearTimeout(timer); };

  let mine = [];
  try { mine = await api.words(); } catch { /* the file still works */ }
  const myGroups = groupsFromMyWords(mine);

  const choose = () => {
    stage.innerHTML = `<div class="card tw-card"><div class="tw-big">${icon.search}</div><h2>المتشابهة</h2>
      <p class="small ink-2">كلمات تتشابه في النطق أو الكتابة — تعرّف عليها ثم اختبر نفسك.</p>
      <button class="btn primary lg" id="twAsk">اختر مصدر التدريب</button></div>`;
    stage.querySelector('#twAsk').addEventListener('click', ask);
    ask();
  };

  function ask() {
    const box = openModal(`<h2 style="margin:0 0 4px">من أين ترغب في التدريب؟</h2>
      <div class="tw-src">
        <button type="button" class="tw-opt" data-src="file"><b>ملف المتشابهات</b><span class="small muted">${TWINS.length} مجموعة جاهزة من أهم الكلمات المتشابهة</span></button>
        <button type="button" class="tw-opt" data-src="mine" ${myGroups.length ? '' : 'disabled'}><b>كلماتي</b><span class="small muted">${myGroups.length ? `${myGroups.length} مجموعة متشابهات من كلماتك المحفوظة` : 'ما فيه متشابهات في كلماتك للحين'}</span></button>
      </div>`);
    box.querySelectorAll('[data-src]').forEach((b) => b.addEventListener('click', () => {
      closeModal();
      const src = b.dataset.src;
      const all = src === 'mine' ? myGroups : TWINS;
      if (all.length > PART) pickPart(all, src); else start(all, src, 0, 1);
    }));
  }

  // the file is split into sections (4 × 25 groups): one sitting = one section
  function pickPart(all, src) {
    const parts = Math.ceil(all.length / PART);
    const best = readParts()[src] || {};
    const lv = (list) => { const l = [...new Set(list.map((g) => g.level).filter(Boolean))]; return l.length ? ` · ${l[0]}${l.length > 1 ? `–${l[l.length - 1]}` : ''}` : ''; };
    const box = openModal(`<h2 style="margin:0 0 4px">اختر القسم</h2>
      <p class="small muted" style="margin:0">${all.length} مجموعة مقسّمة على ${parts} أقسام — كل قسم جلسة وحدة.</p>
      <div class="tw-src">${Array.from({ length: parts }, (_, i) => {
    const list = all.slice(i * PART, (i + 1) * PART);
    return `<button type="button" class="tw-opt" data-part="${i}"><b>القسم ${i + 1}${best[i] !== undefined ? ` <span class="tw-best">✓ ${best[i]}%</span>` : ''}</b><span class="small muted">${list.length} مجموعة${lv(list)}</span></button>`;
  }).join('')}</div>`);
    box.querySelectorAll('[data-part]').forEach((b) => b.addEventListener('click', () => {
      closeModal();
      const i = Number(b.dataset.part);
      start(all.slice(i * PART, (i + 1) * PART), src, i, parts, all);
    }));
  }

  async function start(groups, src, part = 0, parts = 1, all = groups) {
    const done = []; // { group, right, total }
    const pool = [...TWINS.flatMap((g) => g.words), ...groups.flatMap((g) => g.words)];
    ended = false;
    for (let gi = 0; gi < groups.length && !stopped && !ended; gi += 1) {
      const g = groups[gi];
      const go = await study(g, gi, groups.length);
      if (go === 'end') { ended = true; break; }
      if (stopped) break;
      const qs = shuffle(g.words).map((w, i) => ({ w, kind: kinds(w)[(i + gi) % kinds(w).length] }));
      let right = 0;
      let answered = 0;
      for (let qi = 0; qi < qs.length && !stopped && !ended; qi += 1) {
        const ok = await question(g, qs[qi], pool, gi, groups.length, qi, qs.length);
        if (ok === null) break;
        if (ok) right += 1;
        answered += 1;
      }
      if (stopped) return;
      if (!ended || answered === g.words.length) done.push({ group: g, right, total: g.words.length });
    }
    if (!stopped) finish(done, groups.length, src, { part, parts, all });
  }

  const kinds = (w) => (w.def ? ['def', 'word', 'listen'] : ['word', 'listen']);

  function head(gi, n) {
    return `<div class="tw-top"><span class="small muted">مجموعة <b class="en-inline">${gi + 1}</b> من <b class="en-inline">${n}</b></span>
      <button type="button" class="link-btn small" id="twEnd">أنهِ التدريب</button></div>
      <div class="bar" style="margin-bottom:14px"><span style="width:${Math.round((100 * gi) / n)}%"></span></div>`;
  }

  // 1) the twins side by side
  function study(g, gi, n) {
    return new Promise((resolve) => {
      stage.innerHTML = `${head(gi, n)}
        <div class="card tw-study" data-no-sayar><div class="tw-lead">انتبه للفرق بين هذه الكلمات ${g.level ? `<span class="chip tw-lv">${g.level}</span>` : ''}</div>
          <div class="tw-row">${g.words.map((w) => `<div class="tw-w">
            <button type="button" class="btn icon sm ghost" data-say="${esc(w.term)}" aria-label="استمع">🔊</button>
            <b class="tw-term en" dir="ltr">${esc(w.term)}</b>
            ${w.pr ? `<span class="tw-pr">تُنطق: <b>${esc(w.pr)}</b></span>` : ''}
            <span class="tw-ar">${esc(w.ar || '')}</span>
            ${w.def ? `<span class="tw-def en-inline" dir="ltr">${esc(w.def)}</span>` : ''}</div>`).join('')}</div></div>
        <div class="btn-row" style="justify-content:center;margin-top:14px"><button class="btn primary lg" id="twGo">ابدأ الأسئلة ←</button></div>`;
      stage.querySelectorAll('[data-say]').forEach((b) => b.addEventListener('click', () => speak(b.dataset.say).catch(() => {})));
      stage.querySelector('#twGo').addEventListener('click', () => resolve('go'));
      stage.querySelector('#twEnd').addEventListener('click', () => resolve('end'));
    });
  }

  // 2) one question per word: pick the Arabic meaning (the question is shown in different ways)
  function question(g, { w, kind }, pool, gi, n, qi, qn) {
    return new Promise((resolve) => {
      const sib = g.words.filter((x) => x !== w).map((x) => x.ar);
      const extra = shuffle(pool.filter((x) => x.ar && x.ar !== w.ar && !sib.includes(x.ar)).map((x) => x.ar));
      const finalOpts = shuffle([w.ar, ...sib, ...extra].filter((a, i, arr) => a && arr.indexOf(a) === i).slice(0, 4));
      const prompt = kind === 'def'
        ? `<div class="prompt">أي معنى يناسب هذا التعريف؟</div><div class="q-big en tw-q-def" dir="ltr">${esc(w.def)}</div>`
        : kind === 'listen'
          ? `<div class="prompt">استمع، ثم اختر المعنى</div><button type="button" class="btn lg" id="twSay">🔊 استمع</button>`
          : `<div class="prompt">ما معنى</div><div class="q-big en" dir="ltr">${esc(w.term)}</div>`;
      stage.innerHTML = `${head(gi, n)}<div class="tiny muted" style="margin-bottom:6px">سؤال ${qi + 1} من ${qn}</div>
        <div class="card question">${prompt}${kind !== 'def' && w.def ? '<button type="button" class="link-btn small tw-hint-btn" id="twHint">💡 تلميح</button><div class="tw-hint hidden en-inline" id="twHintBox" dir="ltr"></div>' : ''}</div>
        <div class="options">${finalOpts.map((o, k) => `<button class="option" data-k="${k}">${esc(o)}</button>`).join('')}</div>
        <div class="feedback" id="fb"></div>`;
      stage.querySelector('#twEnd').addEventListener('click', () => { ended = true; clearTimeout(timer); resolve(null); });
      if (kind === 'listen') {
        setTimeout(() => speak(w.term, { auto: true }).catch(() => {}), 250);
        stage.querySelector('#twSay').addEventListener('click', () => speak(w.term).catch(() => {}));
      }
      stage.querySelector('#twHint')?.addEventListener('click', (e) => { const box = stage.querySelector('#twHintBox'); box.textContent = w.def; box.classList.remove('hidden'); e.currentTarget.remove(); });
      let answered = false;
      stage.querySelectorAll('.option').forEach((btn) => btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const ok = finalOpts[Number(btn.dataset.k)] === w.ar;
        stage.querySelectorAll('.option').forEach((b) => { b.disabled = true; if (finalOpts[Number(b.dataset.k)] === w.ar) b.classList.add('correct'); });
        if (!ok) btn.classList.add('wrong');
        const fb = stage.querySelector('#fb');
        fb.className = `feedback show ${ok ? 'ok' : 'no'}`;
        fb.innerHTML = `<b>${ok ? 'صحيح ✓' : 'الصحيح:'}</b> <span class="en-inline" dir="ltr">${esc(w.term)}</span> = ${esc(w.ar)}${w.pr ? ` <span class="tiny muted">(${esc(w.pr)})</span>` : ''}`;
        speak(w.term).catch(() => {});
        timer = setTimeout(() => resolve(ok), ok ? AUTO_MS.ok : AUTO_MS.no); // straight to the next word
      }));
    });
  }


  // 3) the result and the offer to keep the groups
  function finish(done, total, src, meta = { part: 0, parts: 1, all: [] }) {
    if (!done.length) { stage.innerHTML = `<div class="card tw-card"><p>ما أكملت أي مجموعة.</p><a class="btn" href="#/practice">رجوع</a></div>`; return; }
    const mastered = done.filter((d) => d.right === d.total).length;
    const pct = Math.round((100 * mastered) / done.length);
    const words = done.reduce((a, d) => a + d.total, 0);
    const right = done.reduce((a, d) => a + d.right, 0);
    const weak = done.filter((d) => d.right < d.total);
    if (meta.parts > 1 && done.length === total) saveBest(src, meta.part, pct);
    const hasNext = meta.parts > 1 && meta.part + 1 < meta.parts && done.length === total;
    stage.innerHTML = `<div class="card done-panel tw-done">
      <div class="big">${pct >= 80 ? '🏆' : pct >= 50 ? '👏' : '💪'}</div>
      <h2 style="margin:10px 0 4px">أتممت التدريب على ${groupsWord(done.length)}، وأتقنت <b class="en-inline">${pct}%</b> منها</h2>
      <p class="ink-2 small">${right} من ${words} كلمة صحيحة${done.length < total ? ` · أنهيت قبل نهاية القسم (${total} مجموعة)` : ''}</p>
      ${weak.length ? `<div class="replay-box"><b>تحتاج مراجعة:</b><div class="missed-list">${weak.slice(0, 12).map((d) => `<span>${d.group.words.map((w) => `<b class="en-inline">${esc(w.term)}</b>`).join(' / ')}</span>`).join('')}</div></div>` : ''}
      <div id="twOffer"><div class="divider"></div>
      <h3 style="margin:6px 0">هل ترغب في إضافة مجموعات المتشابهات إلى كلماتي؟</h3>
      <p class="tiny muted">تنضاف الكلمات ومعانيها في مجموعة اسمها «المتشابهات»، وما نكرر كلمة عندك.</p>
      <div class="btn-row" style="justify-content:center"><button class="btn primary" id="twYes">نعم، أضفها</button><button class="btn" id="twNo">لا، شكرًا</button></div></div>
      <div class="btn-row" style="justify-content:center;margin-top:10px">${hasNext ? '<button class="btn primary" id="twNext">القسم التالي ←</button>' : ''}<button class="btn ghost" id="twAgain">${icon.repeat} تدرّب مرة ثانية</button><a class="btn ghost" href="#/practice">انتهيت</a></div></div>`;
    stage.querySelector('#twAgain').addEventListener('click', choose);
    stage.querySelector('#twNext')?.addEventListener('click', () => start(meta.all.slice((meta.part + 1) * PART, (meta.part + 2) * PART), src, meta.part + 1, meta.parts, meta.all));
    stage.querySelector('#twNo').addEventListener('click', () => stage.querySelector('#twOffer').remove());
    stage.querySelector('#twYes').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const r = await api.saveTwins(done.map((d) => d.group.words.map((w) => ({ term: w.term, arabic: w.ar, ipa: w.pr || w.ipa, def: w.def, level: d.group.level }))));
        toast(`أضفنا ${r.added} ${r.added === 1 ? 'كلمة' : 'كلمات'} إلى «المتشابهات»${r.existed ? ` (${r.existed} كانت عندك)` : ''} ✓`);
        e.target.closest('.btn-row').innerHTML = `<a class="btn primary" href="#/words?group=${r.group_id}">شوفها في كلماتي ←</a>`;
      } catch (err) {
        toast(err.message);
        e.target.disabled = false;
      }
    });
  }

  choose();
  return stop;
}
