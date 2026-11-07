# Changes waiting for the next deploy (deploy at 20, or when the owner says «ارفع»)

| # | Change | Status | Deploy cost | Running cost |
|---|--------|--------|-------------|--------------|
| 1 | 🎨 One unified palette: a single yellow (the brand gold) everywhere yellow is used (words button, current line, gold chips…) and the brand teal («تيفاني») for every «on/active» state instead of green (toggles, chips, filters, settings options); usage colours of words stay as they are | to build | in the batch | 0 |
| 2 | ▶ Video starts by itself as soon as the page loads, with NO «شغّل الصوت» button: if the phone forces a muted start, the sound turns on automatically at the first touch anywhere on the page | to build | in the batch | 0 |
| 3 | ✕ The words list (opened from «الكلمات» in the video bar) gets a clear ✕ close button at its top — two ways to close: the «الكلمات» button again, or the ✕ | to build | in the batch | 0 |
| 4 | ⏸ A pause is a pause: when I stop the video (from the YouTube player itself, not only the top button), it stays stopped — «ردّد معي»/repeat/auto-continue never restart it until I press play | to build | in the batch | 0 |
| 5 | 🎨 Words in the transcript: NEW extracted words (not in my words) = teal fill highlight; words already in «كلماتي» = purple outline | to build | in the batch | 0 |
| 6 | ⚡ Fast word extraction from a site index: (a) match the transcript against the site's own word table (thousands of words already saved with Arabic + level, grows with every word anyone adds) — instant, no AI; AI only for words not in the index; (b) a video already added by anyone reuses its words + translation instantly; (c) AI for the remaining words in bigger parallel chunks | to build | in the batch | less AI than now (index first) |

(Batch 4 of 20 deployed on 2026-11-07: autoplay (+ unmute), no goal chip on the video page, on=green/off=grey
with ✕, simpler words panel (glowing icon row), hide line times, «راجع كلمات أمس» on top + «أمس» filter,
exact resume saved on pause/leave/lock, cleaner word details (tap 🔊 twice = slow), logo → home, silent
resume, floating «!» help with tours on every screen, stable new-words count + up to 400 words + save-all
while loading, ＋ more channels per field, games fit the screen (sticky next), recap every N min before/after,
🔊 + auto-read for pasted words and «A / B» split, Arabic-letter pronunciation next to every 🔊, yellow
«الكلمات» button, 3Goal rebrand (logo + palette, light by default), line icons instead of emojis.)
