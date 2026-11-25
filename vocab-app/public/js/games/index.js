// Registry of review games. To add a game:
//   1. create games/<name>.js exporting { key, name, en, icon, description, can(w), play(stage, w, pool) }
//      (or round(stage, ctx) for a game that runs a whole round, like speed.js)
//   2. import it below and add it to GAMES — it then appears on the Practice page.
import connections from './connections.js';
import similar from './similar.js';
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
import memory from './memory.js';
import missing from './missing.js';
import guess from './hangman.js';
import listenFill from './listen-fill.js';
import soundTf from './sound-tf.js';

/** Every game (the original formats): used inside the merged games, the mixed quiz, and old links. */
export const ALL_GAMES = [connections, similar, trueFalse, speed, meaning, listen, spelling, unscramble, fillBlank, context, buildSentence, translate, memory, missing, guess, listenFill, soundTf];
const BY = Object.fromEntries(ALL_GAMES.map((g) => [g.key, g]));

/** 🧩 One game that asks each word in a different format (never the same format twice in a row). */
function merge({ key, name, en, icon, description, parts }) {
  const subs = parts.map((k) => BY[k]);
  let last = null;
  let n = 0;
  return {
    key, name, en, icon, description,
    can: (w) => subs.some((g) => g.can(w)),
    play: (stage, w, pool) => {
      const ok = subs.filter((g) => g.can(w));
      const fresh = ok.filter((g) => g.key !== last);
      const pick = (fresh.length ? fresh : ok)[(n += 1) % (fresh.length || ok.length)];
      last = pick.key;
      return pick.play(stage, w, pool);
    },
  };
}
const choose = merge({ key: 'choose', name: 'اختر المعنى', en: 'Choose the meaning', icon: 'check', description: 'اختر المعنى الصحيح: قراءة أو استماع أو صح وخطأ.', parts: ['meaning', 'listen', 'truefalse', 'soundtf'] });
const write = merge({ key: 'write', name: 'اكتب الكلمة', en: 'Write the word', icon: 'translate', description: 'اكتبها من معناها أو من الصوت، أو رتّب حروفها.', parts: ['translate', 'spell', 'scramble', 'missing', 'guess'] });
const blank = merge({ key: 'blank', name: 'املأ الفراغ', en: 'Fill the blank', icon: 'edit', description: 'جملة فيها كلمة ناقصة: اقرأها أو اسمعها.', parts: ['fill', 'listenfill', 'context'] });

/** The games shown on the practice page, in order. */
export const GAMES = [speed, choose, write, blank, buildSentence];
/** Everything that can be opened by key (old links such as type=listen still work). */
export const GAME_BY_KEY = { ...BY, choose, write, blank };

/** Question formats for mixed rounds: recognition while a word is weak, recall once it is stronger. */
const WEAK_ORDER = ['meaning', 'truefalse', 'listen', 'context', 'fill'];
const STRONG_ORDER = ['fill', 'translate', 'spell', 'build', 'scramble', 'context', 'listen', 'meaning'];

export function chooseType(w, i) {
  const weak = (w.mastery ?? 0) < 40 || w.difficult || w.review_count === 0;
  const ok = (weak ? WEAK_ORDER : STRONG_ORDER).filter((k) => GAME_BY_KEY[k].can(w));
  return ok.length ? ok[i % ok.length] : 'listen';
}
