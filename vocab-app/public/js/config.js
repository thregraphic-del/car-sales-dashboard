// Frontend constants in one place.
export const APP_CONFIG = {
  // AI work is done in short steps (each one request); the page keeps asking until done.
  aiStepPauseMs: 150,
  maxAiSteps: 400,
  // Importing a local database: rows per request.
  importChunkRows: 1000,
  // sql.js 1.10.3 (SQLite compiled to WebAssembly, served from public/vendor) — reads a local lexitube.db in the browser.
  sqlJsBase: 'vendor/sql.js/',
};
