// Moving learning data between installations, entirely in the browser:
//  - read a LexiTube backup (.json) or a local database file (lexitube.db,
//    read with sql.js — the file never leaves this device except as rows sent
//    to your own server, and it is never modified)
//  - send it to the server in chunks (the server backs up first, then replaces)
//  - verify every table's row count afterwards
import { api } from './api.js';
import { APP_CONFIG } from './config.js';

// Same order as the server (parents before children).
export const TABLES = ['sources', 'transcript_lines', 'vocabulary', 'examples', 'occurrences', 'user_vocabulary', 'review_logs',
  'daily_plans', 'daily_plan_items', 'word_groups', 'word_group_items', 'ai_cache'];

let sqlJs = null;
function loadSqlJs() {
  if (sqlJs) return sqlJs;
  sqlJs = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${APP_CONFIG.sqlJsBase}sql-wasm.js`;
    s.onload = () => window.initSqlJs({ locateFile: (f) => `${APP_CONFIG.sqlJsBase}${f}` }).then(resolve, reject);
    s.onerror = () => reject(new Error('تعذّر تحميل قارئ قواعد البيانات. تحقق من الاتصال وحاول مرة أخرى.'));
    document.head.append(s);
  });
  return sqlJs;
}

/**
 * Apply the committed frames of a SQLite write-ahead log (lexitube.db-wal) to
 * the database bytes — recent changes of a running local app live there.
 * Format: 32-byte header, then frames of 24-byte header + one page.
 */
export function applyWal(dbBytes, walBytes) {
  if (!walBytes || walBytes.length < 32) return dbBytes;
  const wal = new DataView(walBytes.buffer, walBytes.byteOffset, walBytes.byteLength);
  const magic = wal.getUint32(0);
  if (magic !== 0x377f0682 && magic !== 0x377f0683) return dbBytes;
  const pageSize = wal.getUint32(8) || 65536;
  const salt1 = wal.getUint32(16);
  const salt2 = wal.getUint32(20);
  const frameSize = 24 + pageSize;
  const pending = [];
  let committed = [];
  let dbPages = Math.ceil(dbBytes.length / pageSize);
  for (let off = 32; off + frameSize <= walBytes.length; off += frameSize) {
    if (wal.getUint32(off + 8) !== salt1 || wal.getUint32(off + 12) !== salt2) break; // older generation
    pending.push({ pgno: wal.getUint32(off), data: walBytes.subarray(off + 24, off + frameSize) });
    const commitSize = wal.getUint32(off + 4);
    if (commitSize) {
      committed = committed.concat(pending.splice(0));
      dbPages = commitSize;
    }
  }
  if (!committed.length) return dbBytes;
  const out = new Uint8Array(dbPages * pageSize);
  out.set(dbBytes.subarray(0, Math.min(dbBytes.length, out.length)));
  for (const f of committed) if (f.pgno <= dbPages) out.set(f.data, (f.pgno - 1) * pageSize);
  return out;
}

/** Read a local lexitube.db (schema v2+, plus its -wal file if given) into a snapshot. */
async function readSqlite(file, walFile) {
  const SQL = await loadSqlJs();
  let bytes = new Uint8Array(await file.arrayBuffer());
  if (walFile) bytes = applyWal(bytes, new Uint8Array(await walFile.arrayBuffer()));
  // Open as a plain (rollback-journal) database: the browser copy needs no WAL.
  if (bytes.length > 19 && bytes[18] === 2) {
    bytes[18] = 1;
    bytes[19] = 1;
  }
  const db = new SQL.Database(bytes);
  try {
    const names = new Set(db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values.map((v) => v[0]) || []);
    if (names.has('video_vocabulary')) {
      throw new Error('هذه قاعدة بيانات من الإصدار الأول. شغّل النسخة المحلية الحالية مرة واحدة (لتحديثها تلقائيًا) ثم استوردها.');
    }
    if (!names.has('user_vocabulary')) throw new Error('هذا الملف ليس قاعدة بيانات LexiTube.');
    const rowsOf = (table) => {
      if (!names.has(table)) return [];
      const res = db.exec(`SELECT * FROM ${table}`)[0];
      if (!res) return [];
      return res.values.map((v) => Object.fromEntries(res.columns.map((c, i) => [c, v[i]])));
    };
    const tables = { users: rowsOf('users') };
    for (const t of TABLES) tables[t] = rowsOf(t);
    return { format: 'lexitube-backup', source: 'sqlite', tables };
  } finally {
    db.close();
  }
}

/** Read the chosen file(s): .json backup, or .db (+ optional .db-wal) → snapshot {tables}. */
export async function readDataFiles(files) {
  const list = [...files];
  const wal = list.find((f) => /-wal$/i.test(f.name));
  const main = list.find((f) => f !== wal && !/-shm$/i.test(f.name));
  if (!main) throw new Error('اختر ملف lexitube.db (ومعه lexitube.db-wal إن وُجد) أو نسخة احتياطية .json');
  return readDataFile(main, wal);
}

async function readDataFile(file, walFile) {
  if (/\.json$/i.test(file.name)) {
    let snap;
    try {
      snap = JSON.parse(await file.text());
    } catch {
      throw new Error('ملف JSON غير صالح.');
    }
    if (snap?.format !== 'lexitube-backup' || !snap.tables) throw new Error('هذا الملف ليس نسخة احتياطية من LexiTube.');
    return snap;
  }
  return readSqlite(file, walFile);
}

export const countsOf = (snap) => Object.fromEntries(TABLES.map((t) => [t, snap.tables[t]?.length || 0]));

/**
 * Replace the server data with the snapshot. onProgress(sent, total).
 * Returns {backup_id, expected, actual, ok}.
 */
export async function importSnapshot(snap, onProgress = () => {}) {
  const owner = (snap.tables.users || []).find((u) => u.id === 1) || snap.tables.users?.[0] || {};
  const profile = { name: owner.name, daily_goal: owner.daily_goal, speak_arabic: owner.speak_arabic, speech_rate: owner.speech_rate };
  const expected = countsOf(snap);
  const total = Object.values(expected).reduce((a, b) => a + b, 0);
  const begin = await api.importBegin(profile);
  let sent = 0;
  for (const t of TABLES) {
    const rows = snap.tables[t] || [];
    for (let i = 0; i < rows.length; i += APP_CONFIG.importChunkRows) {
      const part = rows.slice(i, i + APP_CONFIG.importChunkRows);
      await api.importRows(t, part);
      sent += part.length;
      onProgress(sent, total);
    }
  }
  const { counts: actual } = await api.importFinish();
  const ok = TABLES.every((t) => actual[t] === expected[t]);
  return { backup_id: begin.backup_id, expected, actual, ok };
}
