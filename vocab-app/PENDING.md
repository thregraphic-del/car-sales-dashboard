# Changes waiting for the next deploy (deploy at 20, or when the owner says «ارفع»)

Free preview: every change is pushed to the `preview` branch → https://preview--lexitube.netlify.app (no deploy credits).
The live site deploys from `lexitube-live` — only on «ارفع».

| # | Change | Status | Deploy cost | Running cost |
|---|--------|--------|-------------|--------------|
| 1 | ⚙ Reader settings sheet: ONE row of small icons (السرعة · التوقف · التدريب · قائمة الكلمات · الملخص · الترجمة · النص · الفيديو · بحث · شرح · أدوات); each group stays closed until its icon is tapped (tap again = close) — on the normal page AND in full screen; on the normal page the icons are bigger and share the full width | built — on the free preview | in the batch | 0 |
| 2 | ⛶ Full-screen reading stays full-screen: scrolling up to read earlier lines no longer drops back to the normal page (iPad leaves browser full screen by itself) — only the ✕ / shrink button exits; the transcript no longer drags the page when it reaches its first line | built — on the free preview | in the batch | 0 |
| 3 | 🧩 Filter bar on «كلماتي» and «تدرّب»: one horizontal row of rounded pills (icon + name + choice: 🔢 العدد · 🎚 المستوى · 🏷 الحالة · 🎬 المقطع · 🕒 الوقت · ↕ الترتيب) instead of a column of boxes on iPad; «كل …» shows as a short «الكل»; 3 per row on phones | built — on the free preview | in the batch | 0 |
| 4 | 📝 «السالفة باختصار» every 3 / 5 / 10 minutes counts minutes OF THE VIDEO (fixed parts 0–5, 5–10…), not clock time — right with any speed, pauses or seeking back; the same part gives the same text so the AI answer is cached; it hides by itself after the time needed to read it (5–12 s) | built — on the free preview | in the batch | fewer AI calls |
| 5 | 📁 «كلماتي» groups: one closed «📁 المجموعات» button (shows the chosen group's name); the groups, «+ مجموعة جديدة» and «⚙ إدارة المجموعات» appear only when it is opened | built — on the free preview | in the batch | 0 |
| 6 | 🔑 Sign in with the username OR the email OR the phone number (05…, +966…, Arabic digits all work); a phone field on «حساب جديد» and in the settings (stored like the email, no new table); «نسيت كلمة المرور» accepts any of the three | built — on the free preview | in the batch | 0 |
| 7 | 👤 Guests: a visitor uses the site right away without signing up (a guest account behind a cookie, a few per address per hour). Free trial: 2 videos/texts and 10 saved words, then one kind card «احفظ تقدّمك في حسابك» (free, a minute, everything moves with you). Signing up turns the same guest into the account — nothing is lost. A small reminder in the menu and one gentle note per visit. Guests only when sign-ups are open | built — on the free preview | in the batch | protects Supadata / AI (2 videos per guest) |

(Batch 6 deployed on 2026-11-09 — commit adc23df on `lexitube-live`: one teal filter bar for «تدرّب» + «كلماتي» (العدد · المستوى · الحالة · المقطع · الوقت · الترتيب),
clear button contrast, «إدارة بياناتي» (wipe words / videos / settings with «تأكيد» + automatic backup + restore), «مغامرات» channels field
+ fields accordion, suggestions emailed to the owner, numbered Excel rows that follow the filter, phone font 13, the video plays again
after a word's meaning closes, a clear «خدمة النصوص وصلت حدها» message for 402/403, and the 504 fix when adding a video (multi-row INSERTs).)
