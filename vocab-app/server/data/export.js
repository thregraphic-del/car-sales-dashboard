// Exporting the learner's words (CSV for Excel / JSON).
import { all } from '../db/index.js';
import { localDate, startOfDay } from '../lib/time.js';
import { listWords } from './words.js';

/**
 * filters: range (all|3m|month|week|custom), from, to, group_id, level, difficult
 */
export async function exportRows(userId, f = {}) {
  const filters = { level: f.level || undefined, group_id: f.group_id || undefined };
  if (f.range === '3m') filters.from = localDate(startOfDay(91));
  else if (f.range === 'month') filters.from = localDate(startOfDay(30));
  else if (f.range === 'week') filters.from = localDate(startOfDay(6));
  else if (f.range === 'custom') {
    filters.from = f.from || undefined;
    filters.to = f.to || undefined;
  }
  if (f.difficult === '1' || f.difficult === true) filters.status = 'difficult';
  const words = await listWords(userId, filters);
  const groups = new Map((await all('SELECT id, name FROM word_groups WHERE user_id = ?', userId)).map((g) => [g.id, g.name]));
  return words.map((w) => {
    // An example together with its Arabic: the sentence it was saved from when it is
    // translated, otherwise another example that has a translation.
    const withAr = (e) => e?.sentence && e.arabic;
    const ctx = w.context_sentence ? { sentence: w.context_sentence, arabic: w.context_arabic } : null;
    const ex = (withAr(ctx) && ctx) || ['user', 'example', 'easy'].map((k) => w.examples.find((e) => e.kind === k && withAr(e))).find(Boolean)
      || w.examples.find(withAr) || ctx || w.examples.find((e) => e?.sentence) || null;
    return {
      Word: w.term,
      Arabic: w.arabic || '',
      'CEFR Level': w.level || '',
      'Part of Speech': w.part_of_speech || '',
      'Simple English': w.simple_english || '',
      Example: ex?.sentence || '',
      'Example Arabic': ex?.arabic || '',
      Group: w.group_ids.map((g) => groups.get(g)).filter(Boolean).join('; '),
      Topic: w.topic || '',
      Source: w.source?.title || '',
      'Saved Date': String(w.saved_at || '').slice(0, 10),
      Mastery: w.mastery,
      Correct: w.correct_count,
      Wrong: w.wrong_count,
      Difficult: w.difficult ? 'yes' : 'no',
    };
  });
}

/** Excel columns: English, Arabic, example and its translation side by side, then the details. */
export const XLSX_COLUMNS = [
  { key: 'Word', title: 'English', width: 24 },
  { key: 'Arabic', title: 'العربي', width: 26, rtl: true },
  { key: 'Example', title: 'Example', width: 50 },
  { key: 'Example Arabic', title: 'ترجمة المثال', width: 50, rtl: true },
  { key: 'CEFR Level', title: 'Level', width: 8 },
  { key: 'Part of Speech', title: 'Part of speech', width: 14 },
  { key: 'Simple English', title: 'Simple English', width: 34 },
  { key: 'Group', title: 'المجموعة', width: 22, rtl: true },
  { key: 'Source', title: 'Source', width: 30 },
  { key: 'Saved Date', title: 'Saved', width: 12 },
  { key: 'Mastery', title: 'Mastery %', width: 10 },
  { key: 'Difficult', title: 'Difficult', width: 10 },
];

export function toCsv(rows) {
  if (!rows.length) return '﻿Word,Arabic\r\n';
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // never let a spreadsheet run a cell as a formula
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens Arabic correctly.
  return `﻿${[cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n')}\r\n`;
}
