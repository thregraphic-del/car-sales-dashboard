// Central configuration. Every environment variable and tunable value lives
// here — change behaviour in one place instead of hunting through the code.

const env = (k, d = '') => (process.env[k] ?? '').toString().trim() || d;
const int = (k, d) => (Number.isFinite(Number(process.env[k])) && process.env[k] !== '' && process.env[k] !== undefined ? Number(process.env[k]) : d);

export const config = {
  app: {
    name: 'LexiTube',
    version: '3.0.0',
    // production = running on Netlify (or NODE_ENV=production)
    production: Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) || env('NODE_ENV') === 'production',
    port: int('PORT', 3000),
    // Calendar used for "today", streaks and daily plans.
    timezone: env('APP_TIMEZONE', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
  },

  db: {
    // Postgres when a connection string exists (Netlify Database / DATABASE_URL), else local SQLite.
    url: env('NETLIFY_DB_URL') || env('DATABASE_URL'),
    netlify: Boolean(env('NETLIFY_DB_URL')),
    sqlitePath: env('DATABASE_PATH'),
  },

  auth: {
    // Owner-only site: the first account is created with SETUP_CODE, then sign-up closes.
    setupCode: env('SETUP_CODE'),
    sessionSecret: env('SESSION_SECRET'),
    sessionDays: int('SESSION_DAYS', 60),
    cookieName: 'lt_session',
    // Login is always on for the public site. Locally it is off unless
    // SESSION_SECRET is set. Without SESSION_SECRET the server generates a
    // random signing key once and keeps it in the database (never sent out).
    required: Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) || env('NODE_ENV') === 'production' || Boolean(env('SESSION_SECRET')),
  },

  ai: {
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: () => env('OPENROUTER_API_KEY'), // read lazily, never logged or returned
    model: () => env('OPENROUTER_MODEL', 'openrouter/auto'),
    // Serverless functions on Netlify stop after ~10 s, so AI calls must finish first.
    timeoutMs: int('AI_TIMEOUT_MS', process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME ? 8500 : 45000),
    translateBatch: int('AI_TRANSLATE_BATCH', 15),
    enhanceBatch: int('AI_ENHANCE_BATCH', 40),
    pauseAfterNetworkErrorMs: 2 * 60 * 1000,
    pauseAfterAuthErrorMs: 10 * 60 * 1000,
    pauseAfterRateLimitMs: 30 * 1000,
    pauseAfterServerErrorMs: 60 * 1000,
    maxCallsPerMinute: int('AI_MAX_CALLS_PER_MINUTE', 30),
  },

  tts: {
    provider: env('TTS_PROVIDER'),
    apiKey: () => env('TTS_API_KEY'),
    voice: env('TTS_VOICE'),
    model: env('TTS_MODEL'),
  },

  youtube: {
    transcriptApiUrl: env('TRANSCRIPT_API_URL'),
    transcriptApiKey: () => env('TRANSCRIPT_API_KEY'),
    timeoutMs: 15000,
  },

  limits: {
    jsonBody: '6mb',
    importTextChars: 200000,
    groupNameChars: 40,
    dailyGoalMin: 4,
    dailyGoalMax: 40,
    practiceMax: 30,
    importChunkRows: 2000,
    importItems: 500,
  },

  learning: {
    defaultDailyGoal: 10,
    planMix: { difficult: 0.2, mistakes: 0.1, review: 0.4 }, // rest = new words
    replayMinRound: 5,
    recentAnswers: 8,
  },

  features: {
    demoReset: !(Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) || env('NODE_ENV') === 'production'),
  },
};

export const aiConfigured = () => Boolean(config.ai.apiKey());
