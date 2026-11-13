// Quiz engine. One round = N questions; in a mixed round the format is chosen
// per word (see games/index.js). Every answer is a review: correct → good,
// wrong → hard (the word comes back soon). The games themselves live in games/.
import { api } from './api.js';
import { toast } from './ui.js';
import { bindSpeech } from './components.js';
import { GAMES, GAME_BY_KEY, chooseType } from './games/index.js';
import { examplesFor } from './games/shared.js';
import { state } from './state.js';
import { stop as stopSound } from './audio.js';

/** 📝 Words without a complete, translated example get one simple sentence (made once, saved for everyone). */
export async function ensureExamples(words) {
  if (!state.config?.ai?.configured) return;
  const good = (w) => { const e = examplesFor(w)[0]; return e && e.arabic && /[.?!]["')”]?\s*$/.test(e.sentence); };
  const need = words.filter((w) => !good(w)).slice(0, 40);
  if (!need.length) return;
  try {
    const r = await Promise.race([api.simpleExamples(need.map((w) => ({ term: w.term, arabic: w.user_arabic || w.arabic }))), new Promise((res) => setTimeout(() => res(null), 8000))]);
    for (const w of need) {
      const ex = r?.examples?.[w.term.toLowerCase()];
      if (ex) w.examples = [{ sentence: ex.sentence, arabic: ex.arabic, kind: 'ai1' }, ...(w.examples || [])];
    }
  } catch { /* play with what we have */ }
}

export const TYPES = Object.fromEntries(GAMES.map((g) => [g.key, g]));
export const GAME_ORDER = GAMES.map((g) => g.key);
export { chooseType };

/**
 * Run a round. type: 'mixed' or a game key.
 * onProgress(done, total, score); resolves {correct, wrong, missed: word[], points?}.
 */
export async function runQuiz(stage, { words, distractors: pool, type = 'mixed', onProgress = () => {} }) {
  bindSpeech(stage);
  stage.innerHTML = '<p class="tiny muted"><span class="spinner"></span></p>';
  await ensureExamples(words);
  const score = { correct: 0, wrong: 0, missed: [] };
  const record = async (w, ok) => {
    if (ok) score.correct += 1;
    else {
      score.wrong += 1;
      if (!score.missed.some((m) => m.uv_id === w.uv_id)) score.missed.push(w);
    }
    try {
      await api.review(w.uv_id, ok ? 'good' : 'hard', type === 'mixed' ? 'quiz' : `game:${type}`);
    } catch (err) {
      toast(err.message);
    }
  };
  const all = pool?.length >= 4 ? pool : words;
  const game = GAME_BY_KEY[type];

  if (game?.round) {
    Object.assign(score, await game.round(stage, { words, pool: all, record, score, onProgress: (d, t) => onProgress(d, t, score) }));
    return score;
  }

  const list = type === 'mixed' ? words : words.filter((w) => game?.can(w));
  const kinds = [];
  const answered = new Set(); // ↩ a question seen again is not counted twice
  const backBtn = document.getElementById('qBack');
  for (let i = 0; i < list.length; i += 1) {
    onProgress(i, list.length, score);
    const w = list[i];
    const kind = kinds[i] ||= type === 'mixed' ? chooseType(w, i) : type;
    stopSound(); // the last word's sound never spills into the next question
    const gn = document.getElementById('gameName'); // 🎮 the game being played, by name
    if (gn && type === 'mixed') gn.textContent = `🎮 ${GAME_BY_KEY[kind].name}`;
    // ↩ back to the previous question (to look at it again)
    let goBack = null;
    const back = new Promise((res) => { goBack = res; });
    const onBack = () => goBack('back');
    if (backBtn) { backBtn.disabled = i === 0; backBtn.onclick = onBack; }
    const ok = await Promise.race([GAME_BY_KEY[kind].play(stage, w, all), back]);
    if (backBtn) backBtn.onclick = null;
    if (ok === 'back') { i = Math.max(-1, i - 2); continue; }
    if (!answered.has(i)) { answered.add(i); await record(w, ok); }
  }
  if (backBtn) backBtn.disabled = true;
  onProgress(list.length, list.length, score);
  return score;
}

export const canPlay = (type, w) => (type === 'mixed' ? true : !!GAME_BY_KEY[type]?.can(w));
