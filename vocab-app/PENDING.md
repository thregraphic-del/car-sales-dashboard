# Changes waiting for the next deploy (deploy at 20, or when the owner says «ارفع»)

Free preview: every change is pushed to the `preview` branch → https://preview--lexitube.netlify.app (no deploy credits).
The live site deploys from `lexitube-live` — only on «ارفع».

| # | Change | Status | Deploy cost | Running cost |
|---|--------|--------|-------------|--------------|
| 1 | ⚙ Reader settings sheet: ONE row of small icons (السرعة · التوقف · التدريب · قائمة الكلمات · الملخص · الترجمة · النص · الفيديو · بحث · شرح · أدوات); each group stays closed until its icon is tapped (tap again = close) — on the normal page AND in full screen; on the normal page the icons are bigger and share the full width | deployed 2026-11-10 | in the batch | 0 |
| 2 | ⛶ Full-screen reading stays full-screen: scrolling up to read earlier lines no longer drops back to the normal page (iPad leaves browser full screen by itself) — only the ✕ / shrink button exits; the transcript no longer drags the page when it reaches its first line | deployed 2026-11-10 | in the batch | 0 |
| 3 | 🧩 Filter bar on «كلماتي» and «تدرّب»: one horizontal row of rounded pills (icon + name + choice: 🔢 العدد · 🎚 المستوى · 🏷 الحالة · 🎬 المقطع · 🕒 الوقت · ↕ الترتيب) instead of a column of boxes on iPad; «كل …» shows as a short «الكل»; 3 per row on phones | deployed 2026-11-10 | in the batch | 0 |
| 4 | 📝 «السالفة باختصار» every 3 / 5 / 10 minutes counts minutes OF THE VIDEO (fixed parts 0–5, 5–10…), not clock time — right with any speed, pauses or seeking back; the same part gives the same text so the AI answer is cached; it hides by itself after the time needed to read it (5–12 s) | deployed 2026-11-10 | in the batch | fewer AI calls |
| 5 | 📁 «كلماتي» groups: one closed «📁 المجموعات» button (shows the chosen group's name); the groups, «+ مجموعة جديدة» and «⚙ إدارة المجموعات» appear only when it is opened | deployed 2026-11-10 | in the batch | 0 |
| 6 | 🔑 Sign in with the username OR the email OR the phone number (05…, +966…, Arabic digits all work); a phone field on «حساب جديد» and in the settings (stored like the email, no new table); «نسيت كلمة المرور» accepts any of the three | deployed 2026-11-10 | in the batch | 0 |
| 7 | 👤 Guests: a visitor uses the site right away without signing up (a guest account behind a cookie, a few per address per hour). Free trial: 2 videos/texts and 10 saved words, then one kind card «احفظ تقدّمك في حسابك» (free, a minute, everything moves with you). Signing up turns the same guest into the account — nothing is lost. A small reminder in the menu and one gentle note per visit. Guests only when sign-ups are open | deployed 2026-11-10 | in the batch | protects Supadata / AI (2 videos per guest) |
| 8 | ✨ Review batch (from the owner's 4 review files): darker grey text (contrast), toast time by text length, greeting by hour, 16px fields on touch (no iPhone zoom), 100dvh, focus ring, bigger touch targets, keyboard hint hidden on phones, overscroll contained, show-password button, email warning, og: preview tags, manifest.json (add to home screen), theme «تلقائي», «الصفحة غير موجودة», retry button + offline notice, one auth/status call, guest can open /login | deployed | in the batch | 0 |
| 9 | 🗣 Interface wording in simple white Saudi dialect, still clear and professional («ما لقينا», «ما قدرنا», «حاول مرة ثانية», «الحين», «المقطع» instead of «المصدر») | deployed | in the batch | 0 |
| 10 | 🏠 Review batch 2: «اليوم» shows the last 7 days (tap = calendar), a 2-minute session (5 words), «وش بعد؟» next steps after the session; phones get a 5th tab «المزيد» (friends, settings) and the streak instead of the duplicate ＋; the reader's back button returns where you came from; thumb bar on phones (previous · play · again · next); «مفتاح الألوان» + «رجّع إعدادات المقطع الأصلية»; plain words beside A1…C2; new accounts start with a goal of 5; modulepreload | deployed 2026-11-10 | in the batch | 0 |
| 11 | 🎨 Filter icons are themed line icons (no emoji); practice drops the «غيّر الاختيار» row; a video opens wide by itself (remembered); this source's new words stay teal after saving — videos, pasted texts and files (purple = saved before it) | deployed 2026-11-11 | in the batch | 0 |

(New batch — collect 10, on the free preview)

| # | Change | Status | Deploy cost | Running cost |
|---|--------|--------|-------------|--------------|
| 1 | 📱 Phone bottom bar: three icons only (أضف · كلماتي · تدرّب); «اليوم», «الإعدادات» and «أصدقائي» stay in the ☰ menu | built — on the free preview | in the batch | 0 |
| 2 | 📺 New channels (ONE item — every channel the owner sends later is added here, not counted again): Deep Primate (@DeepPrimate) and Croc Universe (@CrocUniverse) in «علم النفس»; Deep Primate also in «تطوير الذات» | built — on the free preview | in the batch | 0 (each channel checked once) |
| 3 | 🔲 Expanded mode shows only the video + text; the top row keeps just ⏯ and ⚙ — «الكلمات» and «تصغير الشاشة» moved into ⚙ (with ×2 / ردّد already there); the phone thumb bar hides | built — on the free preview | in the batch | 0 |
| 4 | 📋 A video's new words stay listed and counted inside it after you save them (✓), on any device — the server marks words saved from this video | built — on the free preview | in the batch | 0 (one extra column in the same query) |
| 5 | 🔊 Practice sound in sync: the last word's sound is stopped when the next question opens (a slow/late sound no longer plays over the new word), and «صح أو خطأ» says the shown word with the question | built — on the free preview | in the batch | 0 |
| – | ✉️ (fix, rides along) reset-code email: no code in the subject | built | – | 0 |

(Batch 6 deployed on 2026-11-09 — commit adc23df on `lexitube-live`: one teal filter bar for «تدرّب» + «كلماتي» (العدد · المستوى · الحالة · المقطع · الوقت · الترتيب),
clear button contrast, «إدارة بياناتي» (wipe words / videos / settings with «تأكيد» + automatic backup + restore), «مغامرات» channels field
+ fields accordion, suggestions emailed to the owner, numbered Excel rows that follow the filter, phone font 13, the video plays again
after a word's meaning closes, a clear «خدمة النصوص وصلت حدها» message for 402/403, and the 504 fix when adding a video (multi-row INSERTs).)
