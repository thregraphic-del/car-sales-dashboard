// Game: اكتبها بالإنجليزية (Translation)
import { esc, termRegex, levelChip } from '../ui.js';
import { reveal } from './shared.js';

export default {
  key: 'translate',
  name: 'اكتبها بالإنجليزية',
  en: 'Translation',
  icon: 'translate',
  description: 'اكتب الكلمة الإنجليزية من معناها العربي.',
  /** Can this word be asked in this format? */
  can: (w) => !!w.arabic,
  /** Ask one word; resolves true (correct) or false. */
  play: (stage, w) => new Promise((resolve) => {
    let hints = 0;
    const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/\b(something|someone|sth|sb)\b/g, '').replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim();
    const mask = () => w.term.split(/\s+/).map((p) => p.slice(0, hints) + '_'.repeat(Math.max(0, Math.min(p.length, 12) - hints))).join(' ');
    stage.innerHTML = `
      <div class="card question"><div class="prompt">اكتبها بالإنجليزية</div><div class="q-ar">${esc(w.arabic)}</div>
        ${w.simple_english ? `<div class="small muted en" style="margin-top:6px;text-align:center">${esc(w.simple_english)}</div>` : ''}
        <div class="row" style="justify-content:center;gap:6px;margin-top:10px">${levelChip(w.level)}<span class="chip en-inline" id="hint">${mask()}</span></div></div>
      <form id="tf" class="url-row" style="margin-top:14px"><input class="input en" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type in English…"><button class="btn primary" type="submit">تحقّق</button></form>
      <div class="btn-row" style="justify-content:center;margin-top:10px"><button class="btn sm ghost" id="hintBtn">💡 تلميح</button><button class="btn sm ghost" id="skip">لا أعرف</button></div>
      <div class="feedback" id="fb"></div><div class="next-wrap"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
    const input = stage.querySelector('#ans');
    input.focus();
    let done = false;
    const finish = (ok, extra = '') => {
      if (done) return;
      done = true;
      input.disabled = true;
      reveal(stage, w, ok, extra);
      const next = stage.querySelector('#nextBtn');
      next.classList.remove('hidden');
      next.focus();
      next.addEventListener('click', () => resolve(ok));
    };
    stage.querySelector('#tf').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      const re = termRegex(w.term);
      const given = norm(input.value);
      const right = given === norm(w.term) || (re && re.test(input.value.trim()) && given.split(' ').length <= norm(w.term).split(' ').length + 2);
      // a right answer counts as right even after hints — only when MORE than half of the letters were shown it goes back for review
      const total = w.term.replace(/[^a-z]/gi, '').length;
      const shown = w.term.split(/\s+/).reduce((n, part) => n + Math.min(hints, part.length), 0);
      const tooMany = shown > Math.floor(total / 2);
      if (right && tooMany) { finish(false, ' — إجابتك صحيحة، بس استعنت بتلميحات كثيرة فبنرجّعها لك'); return; }
      finish(right);
    });
    stage.querySelector('#hintBtn').addEventListener('click', () => {
      hints += 1;
      stage.querySelector('#hint').textContent = mask();
    });
    stage.querySelector('#skip').addEventListener('click', () => finish(false));
  }),
};
