// Spaced repetition + learning signals.
//
// Scheduling (SM-2 family, three buttons):
//   hard → back within minutes, ease drops; good/easy → interval grows.
// Learning signals (new in v2):
//   recent      last 8 answers ("1" correct / "0" wrong), newest last
//   difficulty  0..1 — recent mistakes weigh more than old ones, so a word you
//               missed twice today becomes "difficult" immediately, and a word
//               you have since answered correctly several times recovers.

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const RECENT_LEN = 8;

export const GRADES = ['hard', 'good', 'easy'];

/** Difficulty score from counts + recent answers. Deterministic, no AI. */
export function computeDifficulty({ correct_count = 0, wrong_count = 0, lapses = 0, recent = '' }) {
  const answered = correct_count + wrong_count;
  if (!answered) return 0;
  // Recent answers, newest weighted most (weights 1..n).
  let wSum = 0;
  let wErr = 0;
  [...recent].forEach((c, i) => {
    const w = i + 1;
    wSum += w;
    if (c === '0') wErr += w;
  });
  const recentErr = wSum ? wErr / wSum : 0;
  const overallErr = wrong_count / (answered + 2); // smoothed: few answers → less certain
  const lapseFactor = Math.min(1, lapses / 3);
  return Math.round((0.5 * recentErr + 0.3 * overallErr + 0.2 * lapseFactor) * 100) / 100;
}

export function isDifficult(uv) {
  const answered = uv.correct_count + uv.wrong_count;
  if (answered < 2) return false;
  const recent = uv.recent || '';
  return (uv.difficulty ?? computeDifficulty(uv)) >= 0.4 || recent.endsWith('00');
}

export function statusOf(uv) {
  if (uv.review_count === 0) return 'new';
  if (uv.mastery >= 85 && uv.interval_days >= 21) return 'mastered';
  return 'learning';
}

function computeMastery(uv) {
  const answered = uv.correct_count + uv.wrong_count;
  const accuracy = answered ? uv.correct_count / answered : 0;
  const intervalScore = Math.min(1, Math.log1p(uv.interval_days) / Math.log1p(30));
  const streakScore = Math.min(1, uv.streak_correct / 5);
  return Math.round(100 * (0.5 * intervalScore + 0.3 * accuracy + 0.2 * streakScore));
}

/**
 * Apply one answer and return the updated row.
 * scheduling=false only updates counters/signals (game answers on words that
 * are not due yet) — except wrong answers, which always pull the word back.
 */
export function applyReview(uv, grade, { now = new Date(), scheduling = true } = {}) {
  if (!GRADES.includes(grade)) throw new Error(`Unknown grade: ${grade}`);
  const next = { ...uv };
  const correct = grade !== 'hard';
  const iso = now.toISOString();

  next.review_count += 1;
  next.last_reviewed_at = iso;
  next.recent = `${uv.recent || ''}${correct ? '1' : '0'}`.slice(-RECENT_LEN);
  if (correct) {
    next.correct_count += 1;
    next.streak_correct += 1;
  } else {
    next.wrong_count += 1;
    next.streak_correct = 0;
    next.last_wrong_at = iso;
  }

  if (!correct) {
    if (uv.review_count > 0 && uv.interval_days >= 1) next.lapses += 1;
    next.ease = Math.max(1.3, uv.ease - 0.2);
    next.interval_days = 0;
    const missedBefore = (uv.recent || '').endsWith('0');
    next.next_review_at = new Date(now.getTime() + (missedBefore ? 5 : 10) * MINUTE).toISOString();
  } else if (scheduling) {
    if (grade === 'easy') next.ease = Math.min(3.0, uv.ease + 0.15);
    const prev = uv.interval_days;
    let interval;
    if (next.streak_correct <= 1) interval = grade === 'easy' ? 3 : 1;
    else if (next.streak_correct === 2) interval = grade === 'easy' ? 6 : 3;
    else interval = Math.max(prev + 1, prev * next.ease * (grade === 'easy' ? 1.3 : 1));
    next.difficulty = computeDifficulty(next);
    // Difficult words grow more slowly, so they come back more often.
    if (isDifficult(next)) interval = Math.max(1, interval * 0.6);
    next.interval_days = Math.round(interval * 10) / 10;
    next.next_review_at = new Date(now.getTime() + next.interval_days * DAY).toISOString();
  }

  next.difficulty = computeDifficulty(next);
  next.mastery = computeMastery(next);
  return next;
}

export function isDue(uv, now = new Date()) {
  return !uv.next_review_at || uv.next_review_at <= now.toISOString();
}

/** Rebuild recent/difficulty/last_wrong_at from an answer log (used by migrations). */
export function learningSignals(uv, logs) {
  const recent = logs.slice(-RECENT_LEN).map((l) => (l.correct ? '1' : '0')).join('');
  const lastWrong = [...logs].reverse().find((l) => !l.correct);
  return {
    recent,
    last_wrong_at: lastWrong ? lastWrong.created_at : null,
    difficulty: computeDifficulty({ ...uv, recent }),
  };
}
