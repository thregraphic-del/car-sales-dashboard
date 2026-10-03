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

## التشغيل السريع (ويندوز)

1. فك ضغط `lexitube.zip` في مجلد — لا تفتح `index.html` من داخل الملف المضغوط.
2. ثبّت [Node.js](https://nodejs.org) الإصدار 22.13 أو أحدث (LTS).
3. انقر مرتين على `start-windows.bat` — سيثبّت المتطلبات أول مرة ثم يفتح `http://localhost:3000`.

On macOS or Linux, run `./start.sh`. You can also run `npm install` and then `npm start`.

## Configuration (`.env`, server-side only — keys never reach the browser)

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on context-aware extraction, click-to-explain for *any* word, completion of imported words, and Arabic subtitles. |
| `CLAUDE_MODEL` | Optional. Overrides the default model. |
| `TTS_PROVIDER`, `TTS_API_KEY`, `TTS_VOICE` | Optional higher-quality voices (`openai`, `elevenlabs`, `google`). Without them, browser voices are used. |
| `TRANSCRIPT_API_URL`, `TRANSCRIPT_API_KEY` | Optional transcript service, used only when YouTube blocks direct caption download. |

**Without an AI key** the app still works, using its curated dictionary of about 190 B1–C1 entries and the A1–A2 word lists. Some things are missing in that mode, and the UI says so instead of inventing them:
- meanings are general, not tied to the sentence;
- Arabic subtitles are not available;
- words outside the lists show "no offline meaning" with a "save with your own meaning" option.

## How it thinks (each problem uses the simplest reliable tool)

| Problem | Approach |
|---|---|
| Is this word already saved? | **Deterministic.** A normalized match key ignores case, punctuation, `something`/`someone` slots and "to", so "Figure out" and "figure something out" are the same word. Simple plurals are also merged ("reports" becomes "report"); exceptions like *news* and *analysis* are protected. |
| Timestamps | **Taken from the transcript**, never guessed. AI only says *which line* a word is in. |
| Word tiers | **Deterministic lists** for grammar words and A1–A2 words. AI chooses B1–C2, specialized words and phrases, in **one** call per source. |
| Clicked word | Checked in this order: your words → curated dictionary → AI (one small call). The result is **cached** in the database, so each word is looked up once. |
| Arabic subtitles | Translated in batches of 60 lines in the background and stored, so each line is translated once. |
| Difficulty | Learned from your answers. Recent mistakes weigh more than old ones, two misses in a row mark a word as difficult, and a word recovers after correct answers. |
| What to practise | Score order: mistakes from the last 24h (freshest first) → due → difficult → new → weakest. |

## Data model (`db/schema.sql`, schema v2)

```
Global knowledge   vocabulary (one row per word/phrase, unique match_key) · examples (no duplicate sentences)
Sources            sources (YouTube or text) · transcript_lines (original English + Arabic + time — source of truth)
Context            occurrences (word × line, with the meaning in that sentence; a word can have many)
User knowledge     user_vocabulary (saved, own meaning, SRS, difficulty, recent answers) · review_logs · daily plans
Organisation       word_groups · word_group_items (many-to-many — a word in Finance and Work is still one row)
```

- **Automatic upgrade:** a database from the first version upgrades itself in place. Words, reviews and campaigns are kept, and campaigns become groups. `test/migration.test.js` proves this.
- **Re-analysis never overwrites existing meanings.** New information only fills gaps.
- **Postgres:** `db/postgres-schema.sql` is the same model for Supabase. The server itself runs on SQLite, which is built into Node 22.

## Tests

`npm test` runs 38 tests. They cover:
- duplicate detection and plural handling;
- all six import formats plus messy notes;
- transcript preservation and timestamps;
- subtitle sync;
- click lookup;
- explicit, idempotent saving;
- contexts from several sources;
- new examples added once, without overwriting meanings;
- group membership;
- difficulty learning, mistake replay and smart-practice order;
- export filters;
- error messages that never show stack traces;
- the v1 → v2 migration.

## Honest limits

- **One learner, no login.** Every table is keyed by `user_id`, ready for auth.
- **Some paths could not be run in the development sandbox:**
  - YouTube caption download and the YouTube IFrame player (the network was blocked);
  - every Claude-powered path;
  - the paid TTS providers.

  Pasting the transcript always works as a fallback.
- **Demo videos are not real YouTube videos.** A simulated clock drives their synchronized subtitles.
