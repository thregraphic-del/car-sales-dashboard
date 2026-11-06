// 👥 أصدقائي — share progress, add friends, weekly leaderboard, word challenges (each plays when they like).
import { api } from '../api.js';
import { state } from '../state.js';
import { esc, toast, shuffle } from '../ui.js';
import { speak } from '../audio.js';

const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;

export async function render(view, { params }) {
  if (params.play) return play(view, params.play);
  view.innerHTML = '<div class="page-head compact"><div><h1>👥 أصدقائي</h1><p class="muted small">نافس أصدقاءك وشارك تقدمك.</p></div></div><div id="fr"><p class="tiny muted"><span class="spinner"></span></p></div>';
  const box = view.querySelector('#fr');
  const me = state.user?.username;
  const draw = async () => {
    const [{ friends }, { challenges }, card] = await Promise.all([api.friends(), api.challenges(), api.myCard()]);
    const others = friends.filter((f) => !f.me);
    box.innerHTML = `
      <div class="card fr-card me-card bg-${esc(card.bg)}">
        <div class="me-row"><span class="me-ava">${esc((card.name || '?').slice(0, 1))}</span>
          <div style="min-width:0"><b class="me-name">${esc(card.name)}</b>${card.username ? `<div class="en-inline me-user">@${esc(card.username)}</div>` : '<div class="tiny">سجّل باسم مستخدم ليضيفك أصدقاؤك</div>'}</div></div>
        <div class="btn-row">${card.username ? '<button class="btn sm" id="shareUser">📤 شارك اسمي</button>' : ''}<button class="btn sm ghost" id="editCard">✎ اسم مستعار وخلفية</button></div>
        <div id="cardEdit" class="hidden" style="margin-top:8px">
          <input class="input" id="nick" maxlength="40" placeholder="اسمك المستعار" value="${esc(card.name)}">
          <div class="bg-pick">${card.backgrounds.map((b) => `<button type="button" class="bg-dot bg-${b}${b === card.bg ? ' on' : ''}" data-bg="${b}" aria-label="${b}"></button>`).join('')}</div>
          <button class="btn primary sm" id="saveCard">حفظ</button></div>
      </div>` + `
      <div class="card fr-card">
        <b>🔗 شارك تقدمك</b>
        <p class="small ink-2">رابط فيه أيامك المتتالية وعدد كلماتك وآخر ما تعلمته — يفتحه أي أحد بدون حساب.</p>
        <div class="btn-row"><button class="btn primary" id="shareBtn">شارك تقدمي</button></div>
      </div>
      <div class="card fr-card">
        <b>➕ أضف صديق</b>
        ${me ? `<p class="small ink-2">اسم المستخدم حقك: <b class="en-inline">@${esc(me)}</b> — أرسله لصديقك ليضيفك.</p>` : '<p class="small ink-2">لتضيف أصدقاء لازم يكون لكل واحد حساب باسم مستخدم.</p>'}
        <form class="url-row" id="addF"><input class="input en" id="fu" placeholder="username" autocapitalize="off" autocomplete="off"><button class="btn" type="submit">أضف</button></form>
      </div>
      <div class="card fr-card">
        <b>🏆 ترتيب هذا الأسبوع</b>
        <p class="tiny muted">النقاط = الإجابات الصحيحة + ٢ لكل كلمة حفظتها (آخر ٧ أيام).</p>
        <div class="lb">${friends.map((f, i) => `<div class="lb-row ${f.me ? 'me' : ''}"><span class="lb-rank">${medal(i)}</span><span class="me-ava sm bg-${esc(f.bg || 'teal')}">${esc((f.name || '?').slice(0, 1))}</span><span class="lb-name">${esc(f.me ? 'أنت' : f.name)}</span><b class="en-inline">${f.points}</b>
          ${f.me ? '' : `<button class="btn sm" data-ch="${f.id}">⚔️ تحدَّ</button>`}</div>`).join('')}</div>
        ${others.length ? '' : '<p class="tiny muted">أضف صديقًا ليظهر هنا وتتحدّوا.</p>'}
      </div>
      <div class="card fr-card">
        <b>⚔️ التحدّيات</b>
        <p class="tiny muted">نفس العشر كلمات لكما، وكل واحد يلعب وقت ما يناسبه.</p>
        ${challenges.length ? challenges.map((c) => {
          const [a, b] = c.players;
          const done = c.players.every((p) => p.score != null);
          const win = done ? (a.score === b.score ? 'تعادل 🤝' : `${esc((a.score > b.score ? a : b).me ? 'فزت 🎉' : `فاز ${(a.score > b.score ? a : b).name}`)}`) : '';
          return `<div class="ch-row"><span>${c.players.map((p) => `${esc(p.me ? 'أنت' : p.name)} <b class="en-inline">${p.score ?? '…'}</b>`).join(' ⚔️ ')} <span class="tiny muted">/ ${c.count}</span></span>
            ${c.played ? `<span class="small">${win || 'بانتظار صديقك'}</span>` : `<a class="btn sm primary" href="#/friends?play=${c.id}">العب</a>`}</div>`;
        }).join('') : '<p class="tiny muted">لا توجد تحدّيات بعد.</p>'}
      </div>`;
  };
  let pickBg = null;
  box.addEventListener('click', async (e) => {
    if (e.target.closest('#editCard')) { box.querySelector('#cardEdit').classList.toggle('hidden'); return; }
    const dot = e.target.closest('[data-bg]');
    if (dot) { pickBg = dot.dataset.bg; box.querySelectorAll('[data-bg]').forEach((d) => d.classList.toggle('on', d === dot)); return; }
    if (e.target.closest('#saveCard')) {
      try { await api.saveMyCard({ name: box.querySelector('#nick').value, bg: pickBg }); toast('تم الحفظ ✓'); await draw(); } catch (err) { toast(err.message); }
      return;
    }
    if (e.target.closest('#shareUser')) {
      const text = `أضفني في LexiTube ونتحدّى في الإنجليزي 💪\nاسم المستخدم: @${me}\n${location.origin}`;
      if (navigator.share) await navigator.share({ title: 'LexiTube', text }).catch(() => {});
      else { await navigator.clipboard?.writeText(text).catch(() => {}); window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); toast('نسخنا اسمك ✓'); }
      return;
    }
    if (e.target.closest('#shareBtn')) {
      try {
        const { token } = await api.shareLink();
        const url = `${location.origin}/#/p/${token}`;
        const text = 'شوف تقدمي في تعلّم الإنجليزي على LexiTube 📚';
        if (navigator.share) await navigator.share({ title: 'LexiTube', text, url }).catch(() => {});
        else { await navigator.clipboard?.writeText(url).catch(() => {}); window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener'); toast('نسخنا الرابط ✓'); }
      } catch (err) { toast(err.message); }
      return;
    }
    const ch = e.target.closest('[data-ch]');
    if (ch) {
      ch.disabled = true;
      try { const r = await api.newChallenge(Number(ch.dataset.ch)); location.hash = `#/friends?play=${r.id}`; } catch (err) { toast(err.message); ch.disabled = false; }
    }
  });
  box.addEventListener('submit', async (e) => {
    if (e.target.id !== 'addF') return;
    e.preventDefault();
    try { const r = await api.addFriend(box.querySelector('#fu').value); toast(`أضفنا ${r.friend.name} ✓`); await draw(); } catch (err) { toast(err.message); }
  });
  try { await draw(); } catch (err) { box.innerHTML = `<p class="small">${esc(err.message)}</p>`; }
  return undefined;
}

/** Play a challenge: choose the Arabic meaning of each of its words. */
async function play(view, id) {
  const ch = await api.challenge(id);
  if (ch.played) { location.hash = '#/friends'; return; }
  const words = shuffle(ch.words);
  let k = 0;
  let score = 0;
  view.innerHTML = `<div class="page-head compact"><div><h1>⚔️ تحدّي ${esc(ch.players.filter((p) => !p.me).map((p) => p.name).join(''))}</h1></div></div>
    <div class="game-stage"><div class="game-top"><span class="small muted" id="cn"></span><span class="score-pill" id="cs">⭐ 0</span></div><div id="cq"></div></div>`;
  const q = view.querySelector('#cq');
  const next = async () => {
    if (k >= words.length) {
      const r = await api.challengeScore(id, score);
      const other = r.players.find((p) => !p.me);
      q.innerHTML = `<div class="card done-panel"><div class="big">🏁</div><h2>${score} من ${words.length}</h2>
        <p class="ink-2">${other?.score == null ? 'سجّلنا نتيجتك — بانتظار صديقك يلعب.' : score > other.score ? '🎉 فزت!' : score === other.score ? 'تعادل 🤝' : `فاز ${esc(other.name)} (${other.score})`}</p>
        <div class="btn-row" style="justify-content:center"><a class="btn primary" href="#/friends">رجوع</a></div></div>`;
      return;
    }
    const w = words[k];
    view.querySelector('#cn').textContent = `${k + 1} / ${words.length}`;
    const opts = shuffle([w, ...shuffle(ch.words.filter((x) => x.arabic !== w.arabic)).slice(0, 3)]);
    q.innerHTML = `<div class="card question"><div class="prompt">ما معنى الكلمة؟</div><div class="q-big en">${esc(w.term)}</div>
      <span class="q-say"><button class="btn icon sm ghost" data-say="${esc(w.term)}">🔊</button></span></div>
      <div class="options">${opts.map((o, i) => `<button class="option" data-i="${i}">${esc(o.arabic)}</button>`).join('')}</div>`;
    speak(w.term).catch(() => {});
    q.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => {
      const ok = opts[Number(b.dataset.i)] === w;
      q.querySelectorAll('.option').forEach((x) => { x.disabled = true; if (opts[Number(x.dataset.i)] === w) x.classList.add('correct'); });
      if (!ok) b.classList.add('wrong');
      if (ok) score += 1;
      view.querySelector('#cs').textContent = `⭐ ${score}`;
      k += 1;
      setTimeout(next, ok ? 600 : 1300);
    }));
  };
  next();
  return undefined;
}

/** Public progress page (no login): #/p/<token> */
export async function renderPublic(view, token) {
  view.innerHTML = '<p class="tiny muted"><span class="spinner"></span></p>';
  try {
    const p = await api.shared(token);
    view.innerHTML = `<div class="card fr-card share-card"><div class="big" style="font-size:40px">📚</div>
      <h1>تقدّم ${esc(p.name)} في الإنجليزي</h1>
      <div class="share-stats"><div><b class="en-inline">${p.streak}</b><span>🔥 أيام متتالية</span></div><div><b class="en-inline">${p.total}</b><span>كلمة محفوظة</span></div><div><b class="en-inline">${p.mastered}</b><span>كلمة أتقنها</span></div><div><b class="en-inline">${p.week.points}</b><span>نقاط الأسبوع</span></div></div>
      ${p.words.length ? `<p class="small ink-2" style="margin-top:12px">آخر كلمات تعلّمها:</p><div class="word-peek">${p.words.map((w) => `<span><b class="en-inline">${esc(w.term)}</b> <span class="tiny muted">${esc(w.arabic)}</span></span>`).join('')}</div>` : ''}
      <div class="btn-row" style="justify-content:center;margin-top:16px"><a class="btn primary" href="/">ابدأ تتعلّم معنا ←</a></div></div>`;
  } catch (err) {
    view.innerHTML = `<div class="card empty"><h3>${esc(err.message)}</h3><a class="btn" href="/">LexiTube</a></div>`;
  }
}
