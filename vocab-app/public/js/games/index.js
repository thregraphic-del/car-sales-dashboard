// Registry of review games. To add a game:
//   1. create games/<name>.js exporting { key, name, en, icon, description, can(w), play(stage, w, pool) }
//      (or round(stage, ctx) for a game that runs a whole round, like speed.js)
//   2. import it below and add it to GAMES — it then appears on the Practice page.
import connections from './connections.js';
import trueFalse from './true-false.js';
import speed from './speed.js';
import meaning from './meaning.js';
import listen from './listen.js';
import spelling from './spelling.js';
import unscramble from './unscramble.js';
import fillBlank from './fill-blank.js';
import context from './context.js';
import buildSentence from './build-sentence.js';
import translate from './translate.js';

/** In display order. */
export const GAMES = [connections, trueFalse, speed, meaning, listen, spelling, unscramble, fillBlank, context, buildSentence, translate];
export const GAME_BY_KEY = Object.fromEntries(GAMES.map((g) => [g.key, g]));

/** Question formats for mixed rounds: recognition while a word is weak, recall once it is stronger. */
const WEAK_ORDER = ['meaning', 'truefalse', 'listen', 'context', 'fill'];
const STRONG_ORDER = ['fill', 'translate', 'spell', 'build', 'scramble', 'context', 'listen', 'meaning'];

export function chooseType(w, i) {
  const weak = (w.mastery ?? 0) < 40 || w.difficult || w.review_count === 0;
  const ok = (weak ? WEAK_ORDER : STRONG_ORDER).filter((k) => GAME_BY_KEY[k].can(w));
  return ok.length ? ok[i % ok.length] : 'listen';
}
