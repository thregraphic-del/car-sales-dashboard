# Changes waiting for the next deploy (deploy at 20, or when the owner says «ارفع»)

Free preview: every change is pushed to the `preview` branch → https://preview--lexitube.netlify.app (no deploy credits).
The live site deploys from `lexitube-live` — only on «ارفع».

| # | Change | Status | Deploy cost | Running cost |
|---|--------|--------|-------------|--------------|
| 1 | ⚙ Reader settings sheet: ONE row of small icons (السرعة · التوقف · التدريب · قائمة الكلمات · الملخص · الترجمة · النص · الفيديو · بحث · شرح · أدوات); each group stays closed until its icon is tapped (tap again = close) — the open sheet took most of the screen | built — on the free preview | in the batch | 0 |
| 2 | ⛶ Full-screen reading stays full-screen: scrolling up to read earlier lines no longer drops back to the normal page (iPad leaves browser full screen by itself) — only the ✕ / shrink button exits; the transcript no longer drags the page when it reaches its first line | built — on the free preview | in the batch | 0 |

(Batch 6 deployed on 2026-11-09 — commit adc23df on `lexitube-live`: one teal filter bar for «تدرّب» + «كلماتي» (العدد · المستوى · الحالة · المقطع · الوقت · الترتيب),
clear button contrast, «إدارة بياناتي» (wipe words / videos / settings with «تأكيد» + automatic backup + restore), «مغامرات» channels field
+ fields accordion, suggestions emailed to the owner, numbered Excel rows that follow the filter, phone font 13, the video plays again
after a word's meaning closes, a clear «خدمة النصوص وصلت حدها» message for 402/403, and the 504 fix when adding a video (multi-row INSERTs).)
