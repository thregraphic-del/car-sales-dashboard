# LexiTube — a personal English vocabulary system

LexiTube is for intermediate Arabic-speaking learners. You watch or paste something, click the words you don't know, save the useful ones, and the app brings them back until you know them.

**The principle: simple outside, intelligent inside.** There are four everyday pages:

| Page | What it answers |
|---|---|
| **اليوم** (Today) | What should I learn today? One "Start" button. Difficult words surface automatically. |
| **أضف** (Add) | One box for anything: a YouTube link, a word list, `word = معنى`, messy notes, or a paragraph. |
| **كلماتي** (My Words) | Everything I saved. Search, groups I named myself, and export. |
| **تدرّب** (Practice) | Quiz, cards or listening. The words are chosen for you, and missed words can be replayed right away. |

Opening a video or a text leads to the **reader**:
- the full transcript, with Arabic lines under the English, synchronized with the video;
- every meaningful word is clickable and opens an in-place panel: meaning in *this* sentence, level, audio, Save, and Add to group.

The UI is Arabic (right-to-left). English content is shown left-to-right.

## Using it

- **Website (production):** open the site, create your account once with the setup code
  (Netlify → project → *Project configuration → Environment variables →* `SETUP_CODE`), then sign in.
  To bring your words from the local app: **الإعدادات ← بياناتك** → choose `data/lexitube.db`
  (and `lexitube.db-wal` if it exists). The file is read in the browser and is never modified;
  the site saves a backup of its current data before replacing it, and verifies every table afterwards.
- **Local (Windows):** install [Node.js](https://nodejs.org) 22.13+ and double-click `start-windows.bat`
  (macOS/Linux: `./start.sh`, or `npm install && npm start`) → `http://localhost:3000`.

**AI (OpenRouter)** is optional and server-side only. Without `OPENROUTER_API_KEY` everything works with the
offline dictionary and shows «شرح الذكاء الاصطناعي غير متاح — نستخدم القاموس المحلي.»

## How it thinks (each problem uses the simplest reliable tool)

| Problem | Approach |
|---|---|
| Is this word already saved? | **Deterministic.** A normalized match key ignores case, punctuation, `something`/`someone` slots and "to", so "Figure out" and "figure something out" are the same word. Simple plurals are also merged ("reports" becomes "report"); exceptions like *news* and *analysis* are protected. |
| Timestamps | **Taken from the transcript**, never guessed. AI only says *which line* a word is in. |
| Word tiers | **Deterministic lists** for grammar words and A1–A2 words. Analysis is instant with the dictionary; AI then refines the choice of B1–C2 words and phrases in chunks of 25 lines, each saved as it finishes. |
| Clicked word | Checked in this order: your words → curated dictionary → OpenRouter (only if needed, with the sentence). The result is **cached** in the database, so each word is looked up once. |
| Arabic subtitles | Translated in short steps (15 lines per request) while the reader is open, and stored, so each line is translated once. |
| Difficulty | Learned from your answers. Recent mistakes weigh more than old ones, two misses in a row mark a word as difficult, and a word recovers after correct answers. |
| What to practise | Score order: mistakes from the last 24h (freshest first) → due → difficult → new → weakest. |

## Developer guide

### Structure

```
public/                    Frontend (static, no build step) — served by Netlify's CDN
  index.html, css/app.css  Shell and all styles (colors/spacing are CSS variables at the top of app.css)
  js/app.js                Router + navigation          js/config.js   frontend constants (timings, limits)
  js/api.js                Every API call in one place  js/state.js    shared state
  js/components.js, ui.js  Reusable UI (word panel, cards, group picker, icons, toasts)
  js/pages/*.js            One file per page: today, add, reader, words, practice, settings, login
  js/games/*.js            One file per review game + games/index.js (registry) and shared.js
  js/quiz.js               Round engine: runs any registered game, records every answer as a review
  js/data-transfer.js      Backup import / reading a local lexitube.db in the browser (sql.js in vendor/)
  js/shared/text.js        Text rules shared with the server (match keys, tokens, tiers)
server/                    Backend (Node 22, Express)
  config.js                ALL settings and environment variables (model, limits, timeouts, learning mix)
  app.js                   Express app: security checks, login gate, routes, error handler
  index.js                 Local server (API + static files)
  routes/*.js              API by feature: auth, settings, learning (today/practice/review), sources,
                           words (lookup/my words/export), import, groups, data (backup/import/demo), tts
  services/                Logic: ai.js (ALL OpenRouter calls + cache), extractor.js (word choice, lookup,
                           translation prompts), lookup.js (dictionary → cache → AI), sources.js (analysis,
                           chunked AI refine/translation), import-words.js, auth.js, tts.js
  data/*.js                Database access only: vocabulary, sources, words, groups, learning (SRS,
                           plans, practice, stats), export, backup, demo, users, settings
  db/                      One async API (all/get/run/tx) over Postgres (production), SQLite (local), PGlite (tests)
  lib/                     Pure helpers: srs.js, matcher.js, lexicons (offline dictionary), youtube.js, time.js
netlify/functions/api.mjs  Production API = server/app.js as a Netlify Function
netlify/database/migrations/  Postgres schema (applied automatically on every deploy)
db/schema.sql              Same schema for local SQLite (older local databases upgrade automatically)
test/                      node:test suites — run on SQLite and on real Postgres (PGlite)
```

### Run, test, deploy

| | |
|---|---|
| Local | `npm install`, `npm start` (or `npm run dev` to reload on save) → http://localhost:3000. No login locally. |
| Tests | `npm test` — all suites on SQLite, then the API suites again on Postgres. |
| Build check | `npm run build` — loads the API and scans `public/` for anything that looks like a secret. |
| Deploy | Netlify: `publish = public`, function `netlify/functions/api.mjs`, `/api/*` routed to it (see `netlify.toml`). The Postgres database (Netlify Database) is provisioned and migrated automatically. |

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Netlify env (secret) / local `.env` | Enables AI. Read only in `server/config.js`; never logged or returned. |
| `OPENROUTER_MODEL` | same | Model id (default `openrouter/auto`; production uses `openai/gpt-4o-mini`). |
| `SETUP_CODE` | Netlify env | One-time code to create the owner account on the website. |
| `SESSION_SECRET` | optional | Cookie signing key. If absent in production, the server generates one and keeps it in the database. Setting it locally turns login on. |
| `APP_TIMEZONE` | optional | Calendar for "today"/streaks (e.g. `Asia/Riyadh`). |
| `NETLIFY_DB_URL` / `DATABASE_URL` | automatic / optional | Postgres connection. Without it the app uses local SQLite (`DATABASE_PATH`, default `data/lexitube.db`). |
| `TTS_*`, `TRANSCRIPT_API_*` | optional | Better voices; transcript service fallback. |

### How to change things

- **Add a game:** create `public/js/games/<name>.js` exporting `{ key, name, en, icon, description, can(w), play(stage, w, pool) }`
  (resolve `true`/`false`; or `round(stage, ctx)` for a whole-round game like `speed.js`), then add it to `GAMES` in
  `games/index.js`. It appears on the Practice page and every answer is scheduled by the review system automatically.
- **Add an API feature:** data access in `server/data/<feature>.js`, logic in `server/services/`, endpoint in
  `server/routes/<feature>.js` (mounted in `server/app.js`), client call in `public/js/api.js`, UI in `public/js/pages/`.
- **Add a filter to My Words:** server `listWords()` in `server/data/words.js` + route params in `server/routes/words.js`; UI in `pages/words.js`.
- **Change the AI model / prompts / timeouts:** `server/config.js` (`ai`) and `server/services/extractor.js`; transport and caching are in `services/ai.js`.
- **Change colors:** CSS variables at the top of `public/css/app.css` (light and dark).
- **Change the database schema:** add `netlify/database/migrations/00N_<slug>/migration.sql` (Postgres) and the same change to `db/schema.sql` + a step in `server/db/sqlite.js` `migrate()`.

## Data model (`db/schema.sql`, schema v4)

```
Global knowledge   vocabulary (one row per word/phrase, unique match_key) · examples (no duplicate sentences)
Sources            sources (YouTube or text) · transcript_lines (original English + Arabic + time — source of truth)
Context            occurrences (word × line, with the meaning in that sentence; a word can have many)
User knowledge     user_vocabulary (saved, own meaning, SRS, difficulty, recent answers) · review_logs · daily plans
Organisation       word_groups · word_group_items (many-to-many — a word in Finance and Work is still one row)
```

- **Automatic upgrade:** a database from the first version upgrades itself in place. Words, reviews and campaigns are kept, and campaigns become groups. `test/migration.test.js` proves this.
- **Re-analysis never overwrites existing meanings.** New information only fills gaps.
- **Postgres in production:** `netlify/database/migrations/` holds the same model. Timestamps are ISO text in both databases, so the code is identical.

## Tests

`npm test` runs every suite on SQLite and the API suites again on Postgres (PGlite). OpenRouter is simulated. They cover duplicate detection, all import formats, transcript and timestamps, click lookup (dictionary first, AI with the sentence, cache, offline fallback), chunked AI word choice and Arabic subtitles, saving, groups, bulk move/delete, difficulty and replay, export, the v1 → v4 migration, login/setup/password change, security checks (no secrets in responses, cross-site writes rejected, dev endpoints off), and backup → import → verify.

## Honest limits

- **One learner per site.** The website has one owner account (login with a password); every table is keyed by `user_id`.
- **Some paths could not be run in the development sandbox:**
  - YouTube caption download and the YouTube IFrame player (the network was blocked);
  - the real OpenRouter service (it is simulated in the tests);
  - the paid TTS providers.

  Pasting the transcript always works as a fallback.
- **Demo videos are not real YouTube videos.** A simulated clock drives their synchronized subtitles.
