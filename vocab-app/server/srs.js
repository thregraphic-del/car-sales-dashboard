// Spaced repetition (SM-2 family, simplified to three buttons: hard / good / easy).
//
// - "hard" (or a wrong game answer) resets the streak, lowers ease and brings the
//   item back within minutes, so repeatedly-missed words keep showing up.
// - "good" / "easy" grow the interval multiplicatively, so words that are
//   consistently answered correctly appear less and less often.

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export const GRADES = ['hard', 'good', 'easy'];

export function isDifficult(uv) {
  const answered = uv.correct_count + uv.wrong_count;
  return (
    uv.lapses >= 2 ||
    uv.ease < 2.1 ||
    (answered >= 3 && uv.wrong_count / answered >= 0.4)
  );
}

export function statusOf(uv) {
  if (uv.review_count === 0) return 'new';
  if (uv.mastery >= 85 && uv.interval_days >= 21) return 'mastered';
  return 'learning';
}

function computeMastery(uv) {
  const answered = uv.correct_count + uv.wrong_count;
  const accuracy = answered ? uv.correct_count / answered : 0;
  // Interval term saturates around 30 days; accuracy weights the rest.
  const intervalScore = Math.min(1, Math.log1p(uv.interval_days) / Math.log1p(30));
  const streakScore = Math.min(1, uv.streak_correct / 5);
  return Math.round(100 * (0.5 * intervalScore + 0.3 * accuracy + 0.2 * streakScore));
}

/**
 * Apply one answer to a user_vocabulary row and return the updated fields.
 * @param {object} uv current row
 * @param {'hard'|'good'|'easy'} grade
 * @param {{now?: Date, scheduling?: boolean}} opts scheduling=false only updates
 *   counters (used for game answers on words that are not yet due).
 */
export function applyReview(uv, grade, { now = new Date(), scheduling = true } = {}) {
  if (!GRADES.includes(grade)) throw new Error(`Unknown grade: ${grade}`);
  const next = { ...uv };
  const correct = grade !== 'hard';

  next.review_count += 1;
  next.last_reviewed_at = now.toISOString();
  if (correct) {
    next.correct_count += 1;
    next.streak_correct += 1;
  } else {
    next.wrong_count += 1;
    next.streak_correct = 0;
  }

  if (!correct) {
    if (uv.review_count > 0 && uv.interval_days >= 1) next.lapses += 1;
    next.ease = Math.max(1.3, uv.ease - 0.2);
    next.interval_days = 0;
    // Missed again soon after a miss → even shorter delay.
    const delay = uv.streak_correct === 0 && uv.review_count > 0 ? 5 * MINUTE : 10 * MINUTE;
    next.next_review_at = new Date(now.getTime() + delay).toISOString();
  } else if (scheduling) {
    if (grade === 'easy') next.ease = Math.min(3.0, uv.ease + 0.15);
    const prev = uv.interval_days;
    let interval;
    if (next.streak_correct <= 1) interval = grade === 'easy' ? 3 : 1;
    else if (next.streak_correct === 2) interval = grade === 'easy' ? 6 : 3;
    else interval = Math.max(prev + 1, prev * next.ease * (grade === 'easy' ? 1.3 : 1));
    // Difficult items grow more slowly so they come back more often.
    if (isDifficult(next)) interval = Math.max(1, interval * 0.6);
    next.interval_days = Math.round(interval * 10) / 10;
    next.next_review_at = new Date(now.getTime() + next.interval_days * DAY).toISOString();
  }

  next.mastery = computeMastery(next);
  return next;
}

export function isDue(uv, now = new Date()) {
  return !uv.next_review_at || uv.next_review_at <= now.toISOString();
}
