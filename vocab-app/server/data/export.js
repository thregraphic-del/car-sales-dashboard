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
    const ex = w.examples.find((e) => e.kind === 'user') || w.examples.find((e) => e.kind === 'example') || w.examples[0];
    return {
      Word: w.term,
      Arabic: w.arabic || '',
      'CEFR Level': w.level || '',
      'Part of Speech': w.part_of_speech || '',
      'Simple English': w.simple_english || '',
      Example: w.context_sentence || ex?.sentence || '',
      'Example Arabic': w.context_sentence ? w.context_arabic || '' : ex?.arabic || '',
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
