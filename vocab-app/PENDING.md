# Changes waiting for the next deploy (deploy at 20, or when the owner says «ارفع»)

| # | Change | Status | Deploy cost | Running cost |
|---|--------|--------|-------------|--------------|

(Batch 5 of 21 deployed on 2026-11-08: one teal/gold palette, autoplay without the sound button (first touch
unmutes), ✕ on the words list, a pause stays a pause, new words teal / saved purple, fast extraction from the
site word index, 2 new games (21 ways), complete example sentences + hint line, 3 tries + «💡 تلميح», daily
calendar, one-screen «اليوم», more accurate Arabic + «ترجمة أدق», «ردّد» mic button, iPad toolbar, one «حفظ»
button with filter + save-all remembered, IPA removed, «الأوضح» removed, simple word states, video picker with
pictures, Arabic guide in «ركّب الجملة», «عد إلى الألعاب». Fixes: one-word sentences in games, double 🔊.)

Urgent fix (deployed at once on the owner's request): adding a YouTube link timed out (504 after 30 s) because the new site-index extraction saved hundreds of words in one request. Now 40 are saved at once and the rest arrive in short steps after the video opens; a request that timed out is never sent again automatically.
