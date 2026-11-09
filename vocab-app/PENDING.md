# Changes waiting for the next deploy (deploy at 20, or when the owner says «ارفع»)

Free preview: every change is pushed to the `preview` branch → https://preview--lexitube.netlify.app (no deploy credits).
The live site deploys from `lexitube-live` — only on «ارفع».

| # | Change | Status | Deploy cost | Running cost |
|---|--------|--------|-------------|--------------|
| 1 | 💾 Words panel: a separate «حفظ الكل» button in its own colour (gold), text exactly «حفظ الكل», with a clear save icon (bookmark ✓, not a printer/disk look); next to it a separate chip «المحفوظة» that shows only the saved words (tap again = all) | deployed (8b548d0) | in the batch | 0 |
| 2 | 🎯 «وجدتها في» → the video opens and plays straight from the exact moment the word is said (a little before it), with the sound (one tap if the phone forces a muted start), and no pop-ups on that visit | deployed (8b548d0) | in the batch | 0 |
| 3 | 🔕 Fewer distractions in the video: the «الكلمات القادمة» word-batch card and the «السالفة باختصار» recap are OFF by default (each can be turned on in ⚙), and when on they show as a small corner card, never over the text | deployed (8b548d0) | in the batch | less AI (recap only when turned on) |
| 4 | 🎚 «كلماتي»: the level filter as clear chips A1 · A2 · B1 · B2 · C1 · C2 (with counts, more than one can be picked) instead of the hidden «كل المستويات» drop-down | built — waiting for «ارفع» | in the batch | 0 |
| 5 | ✨ Clear contrast for buttons and filters everywhere: tappable = teal outline with a soft moving glow; chosen = filled teal with white text; everything else grey — same look for filter chips, drop-downs, level chips, settings options and tabs | built — waiting for «ارفع» | in the batch | 0 |
| 6 | 🗂 «كلماتي»: the 5 state chips (الكل · جديدة · تحتاج مراجعة · صعبة · متقنة) merged into ONE drop-down button «الحالة ▾» (shows the chosen state, with counts), next to the level / time / video / sort filters | built — waiting for «ارفع» | in the batch | 0 |
| 7 | 🧩 One filter bar for «تدرّب» and «كلماتي» (same component, same look, teal): العدد · المستوى · الحالة · المقطع · الوقت; «كلماتي» also gets الترتيب (أبجدي · الأقدم · الأحدث). The video filter opens a narrow drop-down right under it with each video's picture + title (not a full-screen window). Replaces #6's separate state button | built — waiting for «ارفع» | in the batch | 0 |
| 8 | 🧹 Settings → one elegant entry «إدارة بياناتي» opening 4 choices: «مسح الكلمات» (words + progress) · «مسح المقاطع» · «استعادة الإعدادات الأصلية» (site settings back to default) · «بداية جديدة» (all of the above); each asks to type «تأكيد» and makes an automatic backup first (restorable). Logout stays as it is | built — waiting for «ارفع» | in the batch | 0 |
| 9 | 🧭 New channels field «مغامرات» (Yes Theory, Peter Santenello, Indigo Traveller, Kurt Caz, Drew Binsky, Eva zu Beck, Simon Wilson, Ruhi Çenet, Fearless & Far, Bald and Bankrupt, Kara and Nate) with a one-line Arabic description each; the fields become a drop-down list (accordion): one field is already OPEN when the page loads (the last one used, else «مغامرات») showing its channels in two rows of cards (logo + name + short description), so people see that tapping a field opens its channels; tapping another field opens it and closes the previous | built — waiting for «ارفع» | in the batch | 0 (each channel checked once) |
| 10 | 📩 Every suggestion sent from «💡 اقتراحاتكم» is also emailed to the owner (GMAIL_USER) with the text, the sender's username and the page it was sent from — still saved in the site as now | built — waiting for «ارفع» | in the batch | one email per suggestion |
| 11 | 🎬 (BUILT) Use the transcript service (Supadata) sparingly — once per video: reuse any existing transcript of the same video, one status check per request for long videos, 1-hour pause after a 429 and say clearly when it hits its limit: a «429» shows «خدمة النصوص وصلت حدها — الصق النص أو جرّب بعد شوي» instead of the YouTube-blocked message; waiting for a long video checks every 10 s (not 4 s) and at most ~2 min; a video's transcript is fetched once and reused by everyone | deployed (8b548d0) | in the batch | fewer service calls |
| 12 | 🔢 Excel export: a «#» column — every row has its number, and the numbers follow Excel's filter (1, 2, 3… among the rows shown) | built — on the free preview | in the batch | 0 |
| 13 | 🔠 Phones start the transcript at font 13 (until the learner changes it with A− / A+) | built — on the free preview | in the batch | 0 |
| 14 | ▶ Opening a word's meaning in the text pauses the video; closing it (✕, tapping outside, or after «حفظ») plays it again by itself — no tap needed | built — on the free preview | in the batch | 0 |

(Batch 5 of 21 deployed on 2026-11-08: one teal/gold palette, autoplay without the sound button (first touch
unmutes), ✕ on the words list, a pause stays a pause, new words teal / saved purple, fast extraction from the
site word index, 2 new games (21 ways), complete example sentences + hint line, 3 tries + «💡 تلميح», daily
calendar, one-screen «اليوم», more accurate Arabic + «ترجمة أدق», «ردّد» mic button, iPad toolbar, one «حفظ»
button with filter + save-all remembered, IPA removed, «الأوضح» removed, simple word states, video picker with
pictures, Arabic guide in «ركّب الجملة», «عد إلى الألعاب». Fixes: one-word sentences in games, double 🔊.)

Urgent fix (deployed at once on the owner's request): adding a YouTube link timed out (504 after 30 s) because the new site-index extraction saved hundreds of words in one request. Now 40 are saved at once and the rest arrive in short steps after the video opens; a request that timed out is never sent again automatically.
