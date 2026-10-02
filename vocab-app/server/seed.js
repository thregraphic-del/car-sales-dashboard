// Demo data: 3 videos, 56 vocabulary items, saved/unsaved/dismissed words,
// simulated review history (run through the real SRS algorithm), difficult and
// mastered words, and campaigns. Runs automatically on first start.
import { fileURLToPath } from 'node:url';
import { getDb, run, get, all, tx } from './db.js';
import { RICH } from './lexicon-rich.js';
import { applyReview } from './srs.js';
import { ensureUser, saveAnalysis, DEFAULT_USER_ID } from './repo.js';

const DEMO_VIDEOS = [
  {
    youtube_id: 'demo-overwhelmed',
    title: 'How to Stop Feeling Overwhelmed at Work',
    channel: 'Work Smarter (demo)',
    duration_seconds: 14 * 60 + 12,
    count: 18,
  },
  {
    youtube_id: 'demo-learning',
    title: 'The Science of Learning Faster',
    channel: 'Mind Lab (demo)',
    duration_seconds: 11 * 60 + 48,
    count: 17,
  },
  {
    youtube_id: 'demo-pitch',
    title: 'How to Pitch Your Idea and Get People On Board',
    channel: 'Career Talks (demo)',
    duration_seconds: 16 * 60 + 5,
    count: 21,
  },
];

// Words left unsaved / marked "not useful" so the analyzer shows both states.
const UNSAVED = new Set(['efficient', 'rule of thumb', 'hinder', 'leverage', 'stakeholder', 'thrive']);
const DISMISSED = new Set(['deadline', 'feedback']);
const MASTERED = new Set(['figure something out', 'come across', 'deadline', 'keep up with', 'struggle', 'come up with', 'rely on', 'turn down', 'evidence', 'stand out']);
const DIFFICULT = new Set(['procrastinate', 'counterintuitive', 'misconception', 'feasible', 'ambiguous', 'compelling', 'trade-off']);

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
const GAME_SOURCES = ['flashcard', 'today', 'flashcard', 'game:choose-meaning', 'game:connections', 'game:fill-blank', 'game:listen-choose', 'game:context', 'game:translation', 'game:build-sentence'];

export function resetDatabase() {
  const db = getDb();
  db.exec(`
    DELETE FROM campaign_items; DELETE FROM campaigns; DELETE FROM daily_plan_items; DELETE FROM daily_plans;
    DELETE FROM review_logs; DELETE FROM user_vocabulary; DELETE FROM video_vocabulary; DELETE FROM examples;
    DELETE FROM vocabulary; DELETE FROM videos; DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);
}

export function seedDemo() {
  const rand = mulberry32(20261002);
  ensureUser(DEFAULT_USER_ID);
  run(`UPDATE users SET name = ?, daily_goal = 10 WHERE id = ?`, 'Learner', DEFAULT_USER_ID);

  // 1) Videos + items (through the same code path as a real analysis).
  let offset = 0;
  const videoIds = [];
  for (const v of DEMO_VIDEOS) {
    const slice = RICH.slice(offset, offset + v.count);
    offset += v.count;
    let t = 38;
    const items = slice.map((r) => {
      t += 25 + Math.floor(rand() * 30);
      return {
        ...r,
        // Demo videos use the curated example as the "original" sentence.
        context: r.example,
        context_arabic: r.example_arabic,
        contextual_meaning: r.arabic,
        example: null,
        timestamp_seconds: Math.min(t, v.duration_seconds - 5),
      };
    });
    const id = saveAnalysis(
      {
        youtube_id: v.youtube_id,
        url: `https://www.youtube.com/watch?v=${v.youtube_id}`,
        title: v.title,
        channel: v.channel,
        duration_seconds: v.duration_seconds,
        thumbnail_url: null,
        transcript_source: 'demo',
        extractor: 'demo',
        word_count: 1400 + Math.floor(rand() * 900),
        is_demo: true,
      },
      items,
    );
    videoIds.push(id);
  }
  // Stagger the analysis dates: oldest video ~70 days ago.
  run(`UPDATE videos SET analyzed_at = ? WHERE id = ?`, new Date(Date.now() - 70 * DAY).toISOString(), videoIds[0]);
  run(`UPDATE videos SET analyzed_at = ? WHERE id = ?`, new Date(Date.now() - 24 * DAY).toISOString(), videoIds[1]);
  run(`UPDATE videos SET analyzed_at = ? WHERE id = ?`, new Date(Date.now() - 3 * DAY).toISOString(), videoIds[2]);

  // 2) Saved / dismissed words with saved_at spread across sections.
  const now = Date.now();
  const vvRows = all(
    `SELECT vv.id, vv.video_id, v.term, v.id AS vocabulary_id FROM video_vocabulary vv JOIN vocabulary v ON v.id = vv.vocabulary_id ORDER BY vv.video_id, vv.rank`,
  );
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  tx(() => {
    let recentIndex = 0;
    for (const row of vvRows) {
      if (UNSAVED.has(row.term)) continue;
      const state = DISMISSED.has(row.term) ? 'dismissed' : 'saved';
      let savedAt;
      if (MASTERED.has(row.term)) savedAt = now - (55 + rand() * 30) * DAY;
      else if (row.video_id === videoIds[0]) savedAt = now - (32 + rand() * 30) * DAY;
      else if (row.video_id === videoIds[1]) savedAt = now - (8 + rand() * 18) * DAY;
      else {
        // Video 3 words: spread over today, yesterday and this week.
        const slot = recentIndex++ % 4;
        if (slot === 0) savedAt = startOfToday.getTime() + 15 * 60 * 1000 + rand() * Math.max(1, now - startOfToday.getTime() - 20 * 60 * 1000);
        else if (slot === 1) savedAt = startOfToday.getTime() - DAY + (8 + rand() * 12) * HOUR;
        else savedAt = now - (2 + rand() * 4) * DAY;
      }
      if (savedAt > now) savedAt = now - 60 * 1000;
      const uvId = Number(
        run(
          `INSERT INTO user_vocabulary (user_id, vocabulary_id, video_vocabulary_id, source_video_id, state, saved_at) VALUES (?,?,?,?,?,?)`,
          DEFAULT_USER_ID, row.vocabulary_id, row.id, row.video_id, state, new Date(savedAt).toISOString(),
        ).lastInsertRowid,
      );
      if (state === 'saved') simulateHistory(uvId, row.term, savedAt, rand);
    }
  });

  // 3) Campaigns.
  const uvByTopic = (topic) =>
    all(
      `SELECT uv.id FROM user_vocabulary uv JOIN vocabulary v ON v.id = uv.vocabulary_id WHERE uv.state='saved' AND v.topic = ?`,
      topic,
    ).map((r) => r.id);
  const uvByVideos = (ids) =>
    all(`SELECT id FROM user_vocabulary WHERE state='saved' AND source_video_id IN (${ids.map(() => '?').join(',')})`, ...ids).map((r) => r.id);
  const campaigns = [
    { name: 'Business English', description: 'Meetings, pitching and negotiation vocabulary.', source_type: 'topic', source_ref: 'business', color: 'indigo', ids: uvByTopic('business') },
    { name: 'English from YouTube', description: 'Everything saved from the three demo videos.', source_type: 'videos', source_ref: videoIds.join(','), color: 'teal', ids: uvByVideos(videoIds) },
    { name: 'Daily Conversation', description: 'Phrasal verbs and expressions you will hear every day.', source_type: 'topic', source_ref: 'daily', color: 'amber', ids: uvByTopic('daily') },
    { name: 'Study Skills', description: 'Academic words from “The Science of Learning Faster”.', source_type: 'video', source_ref: String(videoIds[1]), color: 'rose', ids: uvByVideos([videoIds[1]]) },
  ];
  tx(() => {
    campaigns.forEach((c, i) => {
      const id = Number(
        run(
          `INSERT INTO campaigns (user_id, name, description, source_type, source_ref, color, created_at) VALUES (?,?,?,?,?,?,?)`,
          DEFAULT_USER_ID, c.name, c.description, c.source_type, c.source_ref, c.color, new Date(now - (20 - i * 5) * DAY).toISOString(),
        ).lastInsertRowid,
      );
      for (const uv of c.ids) run(`INSERT OR IGNORE INTO campaign_items (campaign_id, user_vocabulary_id) VALUES (?,?)`, id, uv);
    });
  });

  return {
    videos: get('SELECT COUNT(*) AS n FROM videos').n,
    vocabulary: get('SELECT COUNT(*) AS n FROM vocabulary').n,
    saved: get(`SELECT COUNT(*) AS n FROM user_vocabulary WHERE state='saved'`).n,
    reviews: get('SELECT COUNT(*) AS n FROM review_logs').n,
  };
}

function simulateHistory(uvId, term, savedAt, rand) {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  // Words saved today stay "new".
  if (savedAt >= startOfToday.getTime()) return;
  const profile = MASTERED.has(term) ? 'mastered' : DIFFICULT.has(term) ? 'difficult' : rand() < 0.15 ? 'new' : 'learning';
  if (profile === 'new') return;

  let uv = get('SELECT * FROM user_vocabulary WHERE id = ?', uvId);
  let t = savedAt + (1 + rand() * 5) * HOUR;
  let reviews = 0;
  while (t < startOfToday.getTime() && reviews < 14) {
    let grade;
    const r = rand();
    if (profile === 'mastered') grade = r < 0.55 ? 'easy' : 'good';
    else if (profile === 'difficult') grade = r < 0.55 ? 'hard' : 'good';
    else grade = r < 0.2 ? 'hard' : r < 0.85 ? 'good' : 'easy';
    const source = GAME_SOURCES[Math.floor(rand() * GAME_SOURCES.length)];
    uv = applyReview(uv, grade, { now: new Date(t) });
    run(
      `INSERT INTO review_logs (user_id, user_vocabulary_id, source, grade, correct, interval_after, created_at) VALUES (?,?,?,?,?,?,?)`,
      DEFAULT_USER_ID, uvId, source, grade, grade === 'hard' ? 0 : 1, uv.interval_days, new Date(t).toISOString(),
    );
    reviews += 1;
    const nextAt = new Date(uv.next_review_at).getTime();
    // After a miss the learner sees it again the next day (not 10 minutes later).
    t = grade === 'hard' ? t + DAY + rand() * 6 * HOUR : nextAt + rand() * 10 * HOUR;
  }
  run(
    `UPDATE user_vocabulary SET review_count=?, correct_count=?, wrong_count=?, streak_correct=?, lapses=?, ease=?,
       interval_days=?, mastery=?, last_reviewed_at=?, next_review_at=? WHERE id=?`,
    uv.review_count, uv.correct_count, uv.wrong_count, uv.streak_correct, uv.lapses, uv.ease,
    uv.interval_days, uv.mastery, uv.last_reviewed_at, uv.next_review_at, uvId,
  );
}

/** Make sure the last few days have activity so the streak is visible. */
export function seedStreak() {
  const uvs = all(`SELECT id FROM user_vocabulary WHERE state='saved' ORDER BY id`).map((r) => r.id);
  if (!uvs.length) return;
  const rand = mulberry32(7);
  tx(() => {
    for (let d = 1; d <= 6; d += 1) {
      const day = new Date();
      day.setHours(19, 0, 0, 0);
      day.setDate(day.getDate() - d);
      const has = get(`SELECT 1 FROM review_logs WHERE date(created_at,'localtime') = date(?, 'localtime')`, day.toISOString());
      if (has) continue;
      for (let i = 0; i < 4; i += 1) {
        const uv = uvs[Math.floor(rand() * uvs.length)];
        const ok = rand() > 0.25;
        run(
          `INSERT INTO review_logs (user_id, user_vocabulary_id, source, grade, correct, interval_after, created_at) VALUES (?,?,?,?,?,?,?)`,
          DEFAULT_USER_ID, uv, 'game:choose-meaning', ok ? 'good' : 'hard', ok ? 1 : 0, null, new Date(day.getTime() + i * 60000).toISOString(),
        );
      }
    }
  });
}

export function seedIfEmpty() {
  getDb();
  const users = get('SELECT COUNT(*) AS n FROM users').n;
  if (users > 0) return null;
  const out = seedDemo();
  seedStreak();
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--reset')) resetDatabase();
  const out = seedDemo();
  seedStreak();
  console.log('Seeded demo data:', out);
}
