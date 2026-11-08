# Changes waiting for the next deploy (deploy at 20, or when the owner says «ارفع»)

| # | Change | Status | Deploy cost | Running cost |
|---|--------|--------|-------------|--------------|
| 1 | 🎨 One unified palette: a single yellow (the brand gold) everywhere yellow is used (words button, current line, gold chips…) and the brand teal («تيفاني») for every «on/active» state instead of green (toggles, chips, filters, settings options); usage colours of words stay as they are | to build | in the batch | 0 |
| 2 | ▶ Video starts by itself as soon as the page loads, with NO «شغّل الصوت» button: if the phone forces a muted start, the sound turns on automatically at the first touch anywhere on the page | to build | in the batch | 0 |
| 3 | ✕ The words list (opened from «الكلمات» in the video bar) gets a clear ✕ close button at its top — two ways to close: the «الكلمات» button again, or the ✕ | to build | in the batch | 0 |
| 4 | ⏸ A pause is a pause: when I stop the video (from the YouTube player itself, not only the top button), it stays stopped — «ردّد معي»/repeat/auto-continue never restart it until I press play | to build | in the batch | 0 |
| 5 | 🎨 Words in the transcript: NEW extracted words (not in my words) = teal fill highlight; words already in «كلماتي» = purple outline | to build | in the batch | 0 |
| 6 | ⚡ Fast word extraction from a site index: (a) match the transcript against the site's own word table (thousands of words already saved with Arabic + level, grows with every word anyone adds) — instant, no AI; AI only for words not in the index; (b) a video already added by anyone reuses its words + translation instantly; (c) AI for the remaining words in bigger parallel chunks | to build | in the batch | less AI than now (index first) |
| 7 | 🎮 Two more games so practice has more than 20 ways (the ad says «أكثر من ٢٠»): e.g. «اسمع وأكمل الجملة» and «صح أم خطأ بالصوت» — from saved words/sentences, no AI | to build | in the batch | 0 |
| 8 | 📝 Clear, useful example sentences in games: complete sentences only (the full sentence from the video, joined across its lines until it really ends, or the word's dictionary example); a word with none gets ONE simple clear example written by AI once and saved for everyone; plus a small hint line under the question (word type + first letter, e.g. «اسم · يبدأ بـ t») | to build | in the batch | small: AI once per word without an example |
| 9 | 💡 In every game: 3 tries per question instead of one wrong answer (a wrong pick just turns grey, try again; after 3 misses it shows the answer), and a «💡 تلميح» button that shows a simple, clear example sentence with the word (same saved sentences as #8) — using a hint or a 2nd/3rd try counts as «needs practice» | to build | in the batch | 0 (reuses #8 sentences) |
| 10 | 📅 Tapping the daily progress (🔥 streak / today's goal on «اليوم») opens a full calendar since the first day: each day coloured by how much was done (none / a little / goal reached), with that day's numbers on tap (words seen, saved, answers right/wrong, minutes of video); month by month | to build | in the batch | one small read when opened (from saved logs) |
| 11 | 🏠 «اليوم» on one screen, 3 things only: (1) greeting + 🔥 streak (tap → calendar #10); (2) one big card «▶ ابدأ تدريب اليوم (N)» with a small line «3 تحتاج تدريب · 4 مراجعة · 3 جديدة»; (3) two small buttons side by side: ☀️ كلمات أمس · ▶ أكمل المشاهدة. Remove the ring + word chips, watch-goal bar (→ calendar), «تحتاج انتباهك» (→ «كلماتي» filter «الصعبة»), recent videos (already in «أضف»), friends tile (in ☰) | to build | in the batch | 0 |
| 12 | 🌐 More accurate Arabic: the AI translates the whole sentence first (across its line breaks) then gives each line its exact part, natural Arabic, meaning in context, names/numbers kept; a «ترجمة أدق» button per video re-translates an old video once (saved) | to build | in the batch | AI once per video when asked; new videos same cost |
| 13 | 🗣 «ردّد معي» button clearly about repeating: microphone icon + the word «ردّد» on it (not an unclear icon) | to build | in the batch | 0 |
| 14 | 🖥 iPad / big screens: all video controls as a row of labelled icons on the page (speed, pause after line, ردّد معي, ×2, translation, layout, font, times, video place, summary, listening) — no need to open ⚙; phones keep the main ones outside and the rest inside ⚙ | to build | in the batch | 0 |
| 15 | 💾 Words panel: one «حفظ» button that opens a small menu like «المستوى»: «احفظ الكل (N)» + show filter «الكل / غير المحفوظة / المحفوظة»; the separate 🔖 filter and the «✓ محفوظة» state chip are removed; when every word is saved the «حفظ» button disappears | to build | in the batch | 0 |

(Batch 4 of 20 deployed on 2026-11-07: autoplay (+ unmute), no goal chip on the video page, on=green/off=grey
with ✕, simpler words panel (glowing icon row), hide line times, «راجع كلمات أمس» on top + «أمس» filter,
exact resume saved on pause/leave/lock, cleaner word details (tap 🔊 twice = slow), logo → home, silent
resume, floating «!» help with tours on every screen, stable new-words count + up to 400 words + save-all
while loading, ＋ more channels per field, games fit the screen (sticky next), recap every N min before/after,
🔊 + auto-read for pasted words and «A / B» split, Arabic-letter pronunciation next to every 🔊, yellow
«الكلمات» button, 3Goal rebrand (logo + palette, light by default), line icons instead of emojis.)

Bug fixed (rides with the batch, not counted): «أكمل الجملة» / «تحدّي السياق» showed an empty sentence when the saved example was a single word — now only real sentences (5+ words) are used, and the sentence has a 🔊.
Bug fixed (rides with the batch, not counted): «ما معنى هذه الكلمة؟» showed two 🔊 buttons and the pronunciation twice — now one.
