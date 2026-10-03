// Demo data (runs automatically on first start):
//  - 3 demo videos with complete bilingual transcripts (so the reader,
//    subtitles and click-to-learn work without YouTube or an AI key)
//  - 56 suggested items; saved, unsaved and "not useful" words
//  - review history simulated through the real SRS (mastered + difficult words)
//  - 3 learner-named groups, with words that belong to more than one group
import { fileURLToPath } from 'node:url';
import { getDb, run, get, all, tx } from './db.js';
import { RICH } from './lexicon-rich.js';
import { applyReview } from './srs.js';
import { ensureUser, saveSource, saveWord, dismissWord, createGroup, addToGroup, DEFAULT_USER_ID } from './repo.js';

const DEMO_VIDEOS = [
  {
    youtube_id: 'demo-overwhelmed',
    title: 'How to Stop Feeling Overwhelmed at Work',
    channel: 'Work Smarter (demo)',
    duration_seconds: 14 * 60 + 12,
    count: 18,
    filler: [
      ['Hi everyone, and welcome back to the channel.', 'مرحبًا بالجميع، وأهلًا بعودتكم إلى القناة.'],
      ['Today we are talking about something almost everyone feels at work.', 'اليوم سنتحدث عن شيء يشعر به الجميع تقريبًا في العمل.'],
      ['Let me start with a short story from my first job.', 'دعوني أبدأ بقصة قصيرة من وظيفتي الأولى.'],
      ['I used to answer every message the second it arrived.', 'كنت أرد على كل رسالة في اللحظة التي تصل فيها.'],
      ['So here is the first simple rule.', 'إذن هذه هي القاعدة البسيطة الأولى.'],
      ['Write your three most important tasks on paper.', 'اكتب أهم ثلاث مهام لديك على ورقة.'],
      ['It sounds easy, but most people never do it.', 'يبدو الأمر سهلًا، لكن معظم الناس لا يفعلونه أبدًا.'],
      ['Thanks for watching, and see you next week.', 'شكرًا على المشاهدة، ونراكم الأسبوع القادم.'],
    ],
  },
  {
    youtube_id: 'demo-learning',
    title: 'The Science of Learning Faster',
    channel: 'Mind Lab (demo)',
    duration_seconds: 11 * 60 + 48,
    count: 17,
    filler: [
      ['Why do we forget most of what we study?', 'لماذا ننسى معظم ما نذاكره؟'],
      ['Scientists have studied this question for more than a hundred years.', 'درس العلماء هذا السؤال لأكثر من مئة عام.'],
      ['The answer might surprise you.', 'قد تفاجئك الإجابة.'],
      ['Let us look at what the research actually says.', 'لننظر إلى ما تقوله الأبحاث فعلًا.'],
      ['Here is a simple experiment you can try at home.', 'إليك تجربة بسيطة يمكنك تجربتها في المنزل.'],
      ['Close your notes and try to remember the main ideas.', 'أغلق ملاحظاتك وحاول تذكّر الأفكار الرئيسية.'],
      ['It feels harder, and that is exactly why it works.', 'يبدو الأمر أصعب، وهذا بالضبط سبب نجاحه.'],
      ['Try it this week and tell me how it goes.', 'جرّبه هذا الأسبوع وأخبرني كيف سار الأمر.'],
    ],
  },
  {
    youtube_id: 'demo-pitch',
    title: 'How to Pitch Your Idea and Get People On Board',
    channel: 'Career Talks (demo)',
    duration_seconds: 16 * 60 + 5,
    count: 21,
    filler: [
      ['You have a great idea, but nobody is listening.', 'لديك فكرة رائعة، لكن لا أحد يستمع.'],
      ['I have seen this happen in many companies.', 'رأيت هذا يحدث في شركات كثيرة.'],
      ['The problem is usually not the idea itself.', 'المشكلة عادةً ليست في الفكرة نفسها.'],
      ['It is the way we talk about it.', 'إنها الطريقة التي نتحدث بها عنها.'],
      ['Start with the problem, not the solution.', 'ابدأ بالمشكلة، لا بالحل.'],
      ['People care about their own problems first.', 'يهتم الناس بمشكلاتهم أولًا.'],
      ['Keep your slides short and your message clear.', 'اجعل شرائحك قصيرة ورسالتك واضحة.'],
      ['Good luck with your next presentation.', 'بالتوفيق في عرضك القادم.'],
    ],
  },
];

const UNSAVED = new Set(['efficient', 'rule of thumb', 'hinder', 'leverage', 'stakeholder', 'thrive']);
const DISMISSED = new Set(['deadline', 'feedback']);
const MASTERED = new Set(['figure something out', 'come across', 'keep up with', 'struggle', 'come up with', 'rely on', 'turn down', 'evidence', 'stand out']);
const DIFFICULT = new Set(['procrastinate', 'counterintuitive', 'misconception', 'feasible', 'ambiguous', 'compelling', 'trade-off']);
const GROUPS = [
  { name: 'Work', color: 'indigo', topics: ['work', 'business'] },
  { name: 'University', color: 'rose', topics: ['academic'] },
  { name: 'Daily English', color: 'amber', topics: ['daily', 'emotions'] },
];
// A word can live in several groups — one vocabulary row, several memberships.
const EXTRA_MEMBERSHIP = { consistent: ['Work', 'University'], 'figure something out': ['Work', 'University'], 'make sense of': ['University'], 'reach out': ['Daily English'] };

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const SOURCES = ['flashcard', 'today', 'quiz', 'game:choose-meaning', 'game:connections', 'game:fill-blank', 'game:listen-choose', 'game:context', 'game:translation'];

export function resetDatabase() {
  getDb().exec(`
    DELETE FROM word_group_items; DELETE FROM word_groups; DELETE FROM daily_plan_items; DELETE FROM daily_plans;
    DELETE FROM review_logs; DELETE FROM user_vocabulary; DELETE FROM occurrences; DELETE FROM transcript_lines;
    DELETE FROM examples; DELETE FROM vocabulary; DELETE FROM sources; DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);
}

/** Interleave the item sentences with filler lines into a full transcript. */
function demoTranscript(video, items, rand) {
  const lines = [];
  let t = 4;
  const push = (text, text_ar) => {
    lines.push({ idx: lines.length, start: t, text, text_ar });
    t += 6 + Math.floor(rand() * 18);
  };
  const filler = [...video.filler];
  push(...filler.shift());
  push(...filler.shift());
  items.forEach((it, i) => {
    it.line = lines.length;
    push(it.example, it.example_arabic);
    if (i % 3 === 2 && filler.length > 1) push(...filler.shift());
  });
  while (filler.length) push(...filler.shift());
  return lines;
}

export function seedDemo() {
  const rand = mulberry32(20261003);
  ensureUser(DEFAULT_USER_ID);
  run('UPDATE users SET name = ?, daily_goal = 10 WHERE id = ?', 'Learner', DEFAULT_USER_ID);

  let offset = 0;
  const sourceIds = [];
  for (const v of DEMO_VIDEOS) {
    const slice = RICH.slice(offset, offset + v.count).map((r) => ({ ...r }));
    offset += v.count;
    const lines = demoTranscript(v, slice, rand);
    const items = slice.map((r) => ({
      ...r,
      contextual_meaning: r.arabic,
      context_arabic: r.example_arabic,
      example: null, // the example IS the video sentence in the demo
      band: r.level === 'C1' ? 'advanced' : 'useful',
      origin: 'demo',
    }));
    sourceIds.push(saveSource({
      kind: 'youtube', youtube_id: v.youtube_id, url: null, title: v.title, channel: v.channel, duration_seconds: v.duration_seconds,
      thumbnail_url: null, transcript_source: 'demo', extractor: 'demo', word_count: lines.reduce((n, l) => n + l.text.split(' ').length, 0), is_demo: true,
    }, lines, items));
  }
  run(`UPDATE sources SET translation_status = 'done'`);
  [70, 24, 3].forEach((days, i) => run('UPDATE sources SET analyzed_at = ?, created_at = ? WHERE id = ?', new Date(Date.now() - days * DAY).toISOString(), new Date(Date.now() - days * DAY).toISOString(), sourceIds[i]));

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const suggested = all(
    `SELECT o.id AS occurrence_id, o.source_id, v.id AS vocabulary_id, v.term, v.topic FROM occurrences o JOIN vocabulary v ON v.id = o.vocabulary_id
     WHERE o.suggested = 1 ORDER BY o.source_id, o.rank`,
  );
  const groups = Object.fromEntries(GROUPS.map((g) => [g.name, createGroup(DEFAULT_USER_ID, g.name, g.color).id]));

  tx(() => {
    let recentIndex = 0;
    for (const row of suggested) {
      if (UNSAVED.has(row.term)) continue;
      if (DISMISSED.has(row.term)) {
        dismissWord(DEFAULT_USER_ID, row.vocabulary_id);
        continue;
      }
      let savedAt;
      if (MASTERED.has(row.term)) savedAt = now - (55 + rand() * 30) * DAY;
      else if (row.source_id === sourceIds[0]) savedAt = now - (32 + rand() * 30) * DAY;
      else if (row.source_id === sourceIds[1]) savedAt = now - (8 + rand() * 18) * DAY;
      else {
        const slot = recentIndex++ % 4;
        if (slot === 0) savedAt = Math.min(now - 60000, startOfToday.getTime() + 10 * 60000 + rand() * Math.max(1, now - startOfToday.getTime() - 15 * 60000));
        else if (slot === 1) savedAt = startOfToday.getTime() - DAY + (8 + rand() * 12) * HOUR;
        else savedAt = now - (2 + rand() * 4) * DAY;
      }
      const { uv_id } = saveWord(DEFAULT_USER_ID, row.vocabulary_id, { occurrenceId: row.occurrence_id });
      run('UPDATE user_vocabulary SET saved_at = ? WHERE id = ?', new Date(savedAt).toISOString(), uv_id);
      for (const g of GROUPS) if (g.topics.includes(row.topic)) addToGroup(DEFAULT_USER_ID, groups[g.name], [uv_id]);
      for (const name of EXTRA_MEMBERSHIP[row.term] || []) addToGroup(DEFAULT_USER_ID, groups[name], [uv_id]);
      simulateHistory(uv_id, row.term, savedAt, rand);
    }
  });
  seedStreak(rand);

  return {
    sources: get('SELECT COUNT(*) AS n FROM sources').n,
    lines: get('SELECT COUNT(*) AS n FROM transcript_lines').n,
    vocabulary: get('SELECT COUNT(*) AS n FROM vocabulary').n,
    saved: get(`SELECT COUNT(*) AS n FROM user_vocabulary WHERE state='saved'`).n,
    reviews: get('SELECT COUNT(*) AS n FROM review_logs').n,
    groups: get('SELECT COUNT(*) AS n FROM word_groups').n,
  };
}

function writeUv(uvId, uv) {
  run(
    `UPDATE user_vocabulary SET review_count=?, correct_count=?, wrong_count=?, streak_correct=?, lapses=?, ease=?, interval_days=?, mastery=?,
       difficulty=?, recent=?, last_wrong_at=?, last_reviewed_at=?, next_review_at=? WHERE id=?`,
    uv.review_count, uv.correct_count, uv.wrong_count, uv.streak_correct, uv.lapses, uv.ease, uv.interval_days, uv.mastery,
    uv.difficulty, uv.recent, uv.last_wrong_at ?? null, uv.last_reviewed_at, uv.next_review_at, uvId,
  );
}

function simulateHistory(uvId, term, savedAt, rand) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (savedAt >= startOfToday.getTime()) return; // saved today → still new
  const profile = MASTERED.has(term) ? 'mastered' : DIFFICULT.has(term) ? 'difficult' : rand() < 0.15 ? 'new' : 'learning';
  if (profile === 'new') return;
  let uv = get('SELECT * FROM user_vocabulary WHERE id = ?', uvId);
  let t = savedAt + (1 + rand() * 5) * HOUR;
  let reviews = 0;
  while (t < startOfToday.getTime() && reviews < 14) {
    const r = rand();
    let grade;
    if (profile === 'mastered') grade = r < 0.55 ? 'easy' : 'good';
    else if (profile === 'difficult') grade = r < 0.55 ? 'hard' : 'good';
    else grade = r < 0.2 ? 'hard' : r < 0.85 ? 'good' : 'easy';
    uv = applyReview(uv, grade, { now: new Date(t) });
    run(`INSERT INTO review_logs (user_id, user_vocabulary_id, source, grade, correct, interval_after, created_at) VALUES (?,?,?,?,?,?,?)`,
      DEFAULT_USER_ID, uvId, SOURCES[Math.floor(rand() * SOURCES.length)], grade, grade === 'hard' ? 0 : 1, uv.interval_days, new Date(t).toISOString());
    reviews += 1;
    t = grade === 'hard' ? t + DAY + rand() * 6 * HOUR : new Date(uv.next_review_at).getTime() + rand() * 10 * HOUR;
  }
  writeUv(uvId, uv);
}

/** A few practice sessions on recent days so the streak is visible. */
function seedStreak(rand) {
  const uvs = all(`SELECT id FROM user_vocabulary WHERE state='saved' AND review_count > 0 ORDER BY id`).map((r) => r.id);
  if (!uvs.length) return;
  for (let d = 1; d <= 6; d += 1) {
    const day = new Date();
    day.setHours(19, 0, 0, 0);
    day.setDate(day.getDate() - d);
    if (get(`SELECT 1 FROM review_logs WHERE date(created_at,'localtime') = date(?, 'localtime')`, day.toISOString())) continue;
    for (let i = 0; i < 3; i += 1) {
      const id = uvs[Math.floor(rand() * uvs.length)];
      const uv = get('SELECT * FROM user_vocabulary WHERE id = ?', id);
      const when = new Date(day.getTime() + i * 60000);
      if (when.toISOString() < (uv.last_reviewed_at || '')) continue;
      const grade = rand() > 0.25 ? 'good' : 'hard';
      const next = applyReview(uv, grade, { now: when, scheduling: false });
      writeUv(id, { ...next, next_review_at: grade === 'hard' ? next.next_review_at : uv.next_review_at, interval_days: grade === 'hard' ? next.interval_days : uv.interval_days });
      run(`INSERT INTO review_logs (user_id, user_vocabulary_id, source, grade, correct, created_at) VALUES (?,?,?,?,?,?)`,
        DEFAULT_USER_ID, id, 'quiz', grade, grade === 'hard' ? 0 : 1, when.toISOString());
    }
  }
}

export function seedIfEmpty() {
  getDb();
  if (get('SELECT COUNT(*) AS n FROM users').n > 0) return null;
  return seedDemo();
}


if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--reset')) resetDatabase();
  console.log('Seeded demo data:', seedDemo());
}
