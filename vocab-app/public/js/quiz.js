// Quiz engine. One round = N questions; in a mixed round the format is chosen
// per word (see games/index.js). Every answer is a review: correct → good,
// wrong → hard (the word comes back soon). The games themselves live in games/.
import { api } from './api.js';
import { toast } from './ui.js';
import { bindSpeech } from './components.js';
import { GAMES, GAME_BY_KEY, chooseType } from './games/index.js';

export const TYPES = Object.fromEntries(GAMES.map((g) => [g.key, g]));
export const GAME_ORDER = GAMES.map((g) => g.key);
export { chooseType };

/**
 * Run a round. type: 'mixed' or a game key.
 * onProgress(done, total, score); resolves {correct, wrong, missed: word[], points?}.
 */
export async function runQuiz(stage, { words, distractors: pool, type = 'mixed', onProgress = () => {} }) {
  bindSpeech(stage);
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
  for (let i = 0; i < list.length; i += 1) {
    onProgress(i, list.length, score);
    const w = list[i];
    const kind = type === 'mixed' ? chooseType(w, i) : type;
    const ok = await GAME_BY_KEY[kind].play(stage, w, all);
    await record(w, ok);
  }
  onProgress(list.length, list.length, score);
  return score;
}

export const canPlay = (type, w) => (type === 'mixed' ? true : !!GAME_BY_KEY[type]?.can(w));
