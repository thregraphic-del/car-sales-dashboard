# Changes waiting for the next deploy (deploy at 20, or when the owner says «ارفع»)

| # | Change | Status | Deploy cost | Running cost |
|---|--------|--------|-------------|--------------|
| 1 | 💾 Words panel: a separate «حفظ الكل» button in its own colour (gold), text exactly «حفظ الكل», with a clear save icon (bookmark ✓, not a printer/disk look); next to it a separate chip «المحفوظة» that shows only the saved words (tap again = all) | to build | in the batch | 0 |
| 2 | 🎯 «وجدتها في» → the video opens and plays straight from the exact moment the word is said (a little before it), with the sound (one tap if the phone forces a muted start), and no pop-ups on that visit | to build | in the batch | 0 |
| 3 | 🔕 Fewer distractions in the video: the «الكلمات القادمة» word-batch card and the «السالفة باختصار» recap are OFF by default (each can be turned on in ⚙), and when on they show as a small corner card, never over the text | to build | in the batch | less AI (recap only when turned on) |
| 4 | 🎚 «كلماتي»: the level filter as clear chips A1 · A2 · B1 · B2 · C1 · C2 (with counts, more than one can be picked) instead of the hidden «كل المستويات» drop-down | to build | in the batch | 0 |
| 5 | ✨ Clear contrast for buttons and filters everywhere: tappable = teal outline with a soft moving glow; chosen = filled teal with white text; everything else grey — same look for filter chips, drop-downs, level chips, settings options and tabs | to build | in the batch | 0 |

(Batch 5 of 21 deployed on 2026-11-08: one teal/gold palette, autoplay without the sound button (first touch
unmutes), ✕ on the words list, a pause stays a pause, new words teal / saved purple, fast extraction from the
site word index, 2 new games (21 ways), complete example sentences + hint line, 3 tries + «💡 تلميح», daily
calendar, one-screen «اليوم», more accurate Arabic + «ترجمة أدق», «ردّد» mic button, iPad toolbar, one «حفظ»
button with filter + save-all remembered, IPA removed, «الأوضح» removed, simple word states, video picker with
pictures, Arabic guide in «ركّب الجملة», «عد إلى الألعاب». Fixes: one-word sentences in games, double 🔊.)

Urgent fix (deployed at once on the owner's request): adding a YouTube link timed out (504 after 30 s) because the new site-index extraction saved hundreds of words in one request. Now 40 are saved at once and the rest arrive in short steps after the video opens; a request that timed out is never sent again automatically.
