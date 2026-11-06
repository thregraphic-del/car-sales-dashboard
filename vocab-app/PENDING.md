# Changes waiting for the next deploy (deploy at 10, or when the owner says «ارفع»)

| # | Change | Status | Deploy cost | Running cost |
|---|--------|--------|-------------|--------------|
| 1 | 🟩 Reader follow: the highlighted (current) sentence stays fixed at the 2nd–3rd line from the top of the text (not at the bottom); the lines above it are faded to 80% transparency (20% visible) | to build | in the batch | 0 (browser only) |
| 2 | 🎬 Reader: (a) default video position = top (float/bottom only if the learner picks it); (b) the top bar fits on ONE row (title, settings, play, repeat, zoom, counter) to save space; (c) «🔁 أعد الجملة» becomes an on/off switch: when on, every sentence of the whole video plays twice automatically | to build | in the batch | 0 (browser only) |
| 3 | 🔤 Exact line-by-line translation: each English line has exactly its own Arabic (nothing from the next/previous line). Old videos with shifted translations are re-translated strictly once (line by line) when opened, then saved; tighten the check that finds shifted lines | to build | in the batch | small: AI once per old video, then saved |

(Batch of 10 deployed on 2026-11-06: credits bell, channels by field, auto-retry for links,
large floating video, strict easier synonyms, reader top bar, family-friendly stories + cards
as games, audio everywhere, friends/challenges/share/leaderboard + 3 new games + quiz after
video + repeat sentence + simpler Today + fewer stats calls; translation step retries.)
