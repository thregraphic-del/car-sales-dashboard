# LexiTube — working rules

## Hosting credits (Netlify) — the owner's standing instruction
The site runs on a credit-based Netlify plan. Running out of credits takes the whole site down.

1. **Before applying any change, tell the owner (in Arabic) what it will cost**: how many deploys
   (each production deploy ≈ 15 credits), and whether it adds any running cost (server time,
   extra requests, AI calls). Wait for the go-ahead when the cost is more than one deploy or
   adds any ongoing cost.
2. **Always choose the simplest solution that costs the least.** Prefer work done once and saved
   in the database over work repeated on every visit.
3. **Never add background work**: no scheduled functions, no polling loops, no timers that call
   the server repeatedly. Work happens only when the learner uses the page, and only once per item.
4. **Batch deploys**: collect changes and deploy once when the owner says «ارفع», not after every edit.
5. AI results (word levels, word forms, translations) are computed once, saved, and reused for
   everyone — never recomputed.
