# Changes waiting for the next deploy (deploy at 10, or when the owner says «ارفع»)

| # | Change | Status | Deploy cost | Running cost |
|---|--------|--------|-------------|--------------|
| 1 | 🟩 Reader follow: the highlighted (current) sentence stays fixed at the 2nd–3rd line from the top of the text (not at the bottom); the lines above it are faded to 80% transparency (20% visible) | to build | in the batch | 0 (browser only) |
| 2 | 🎬 Reader: (a) default video position = top (float/bottom only if the learner picks it); (b) the top bar fits on ONE row (title, settings, play, repeat, zoom, counter) to save space; (c) «🔁 أعد الجملة» becomes an on/off switch: when on, every sentence of the whole video plays twice automatically | to build | in the batch | 0 (browser only) |
| 3 | 🔤 Exact line-by-line translation: each English line has exactly its own Arabic (nothing from the next/previous line). Old videos with shifted translations are re-translated strictly once (line by line) when opened, then saved; tighten the check that finds shifted lines | to build | in the batch | small: AI once per old video, then saved |
| 4 | 🎮 Practice page redesign: one page — compact smart filter on top (fewer filters: merge similar ones into a few icon buttons that open drop-down menus), and right under it ALL games in one grid (quiz, listening, stories, flashcards and every game) using the chosen words; remove the top tabs and the separate mode row | to build | in the batch | 0 (browser only) |
| 5 | 🧩 «الكلمة الأوضح للحفظ» (word clusters) made strict: a group only holds TRUE synonyms with the same meaning (checked against dictionary meanings), headed by the simplest/most common word; harder/rarer ones go under it; a word with no true synonym stays alone. Rebuild the saved groups once with the strict rule | to build | in the batch | small: AI once per word list, then saved |
| 6 | 🔤 Word details (كلماتي): at the end, after forms and examples, one short line «مرادفات أسهل» with true same-meaning easier words; nothing shown if there are none | to build | in the batch | small: reuses the saved synonyms (AI once per word) |
| 7 | 📺 Channels by field — verified: every channel opens its real YouTube channel page directly (no search page), with its real logo. The server checks each channel ONCE (YouTube page → real link + logo), saves it for everyone; a channel that can't be verified is not shown. Remove unsuitable channels (e.g. the horror «Bedtime Stories»); only family-friendly | to build | in the batch | tiny: one check per channel, once, then saved |
| 8 | ⭐ Merge «قنوات مقترحة» into the fields row as a «⭐ المفضلة» chip: my channels (from my videos + similar to my taste), with add / edit / similar inside it | to build | in the batch | 0 |
| 9 | ➕ 10 more fields (neuroscience, psychology, cartoons, comedy, vlogs, tech, cooking, sport, history, health), each with easy / medium / hard channels so no level is empty; all family-friendly | to build | in the batch | 0 (same once-only check as #7) |

(Batch of 10 deployed on 2026-11-06: credits bell, channels by field, auto-retry for links,
large floating video, strict easier synonyms, reader top bar, family-friendly stories + cards
as games, audio everywhere, friends/challenges/share/leaderboard + 3 new games + quiz after
video + repeat sentence + simpler Today + fewer stats calls; translation step retries.)
