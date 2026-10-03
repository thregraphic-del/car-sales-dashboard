// Global knowledge: vocabulary items and their examples, shared by every
// source. New information only fills gaps — existing meanings never change.
import { all, get, run, insert } from '../db/index.js';
import { matchKey, singularCandidates, sentenceKey } from '../../public/js/shared/text.js';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const BAND_FOR = { A1: 'basic', A2: 'basic', B1: 'useful', B2: 'useful', C1: 'advanced', C2: 'advanced' };
const FILLABLE = ['item_type', 'part_of_speech', 'level', 'band', 'usefulness', 'pronunciation', 'arabic', 'simple_english', 'topic'];

export async function getVocabulary(id) {
  return (await get('SELECT * FROM vocabulary WHERE id = ?', id)) || null;
}

/**
 * Find the vocabulary row for a term, deterministically:
 * exact match key first, then simple singular forms ("reports" → "report").
 */
export async function findVocabulary(term) {
  const key = matchKey(term);
  if (!key) return null;
  const exact = await get('SELECT * FROM vocabulary WHERE match_key = ?', key);
  if (exact) return exact;
  if (!key.includes(' ')) {
    for (const s of singularCandidates(key)) {
      const row = await get('SELECT * FROM vocabulary WHERE match_key = ?', s);
      if (row) return row;
    }
  }
  return null;
}

/**
 * Insert a vocabulary item, or enrich the existing one. Existing values are
 * NEVER overwritten — new information only fills gaps — so analysing another
 * video can't change the meaning of a word you already learned.
 * @returns {Promise<{id:number, created:boolean, filled:string[]}>}
 */
export async function upsertVocabulary(item) {
  const term = String(item.term || '').trim();
  const existing = await findVocabulary(term);
  const values = {
    item_type: item.item_type || (term.includes(' ') ? 'expression' : 'word'),
    part_of_speech: item.part_of_speech || item.pos || null,
    level: LEVELS.includes(item.level) ? item.level : null,
    band: item.band || BAND_FOR[item.level] || null,
    usefulness: Number.isFinite(item.usefulness) ? Math.round(item.usefulness) : null,
    pronunciation: item.pronunciation || null,
    arabic: item.arabic || null,
    simple_english: item.simple_english || null,
    topic: item.topic || null,
  };
  let id;
  let created = false;
  const filled = [];
  if (existing) {
    id = existing.id;
    for (const k of FILLABLE) {
      if ((existing[k] === null || existing[k] === undefined || existing[k] === '') && values[k] !== null && values[k] !== undefined) {
        await run(`UPDATE vocabulary SET ${k} = ? WHERE id = ?`, values[k], id);
        filled.push(k);
      }
    }
    if (existing.similar_json === '[]' && item.similar?.length) await run('UPDATE vocabulary SET similar_json = ? WHERE id = ?', JSON.stringify(item.similar), id);
  } else {
    const key = matchKey(term);
    await run(
      `INSERT INTO vocabulary (term, match_key, item_type, part_of_speech, level, band, usefulness, pronunciation, arabic, simple_english, similar_json, topic, origin)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (match_key) DO NOTHING`,
      term, key, values.item_type, values.part_of_speech, values.level, values.band, values.usefulness,
      values.pronunciation, values.arabic, values.simple_english, JSON.stringify(item.similar || []), values.topic, item.origin || null,
    );
    id = (await get('SELECT id FROM vocabulary WHERE match_key = ?', key)).id;
    created = true;
  }
  if (item.example) await addExample(id, item.example, item.example_arabic, 'example');
  if (item.easy_example) await addExample(id, item.easy_example, item.easy_example_arabic, 'easy');
  return { id, created, filled };
}

/** Add an example unless the same sentence is already stored. Returns true if added. */
export async function addExample(vocabularyId, sentence, arabic, kind = 'example') {
  const s = String(sentence || '').trim();
  if (!s) return false;
  const key = sentenceKey(s);
  const dup = await get('SELECT id, arabic FROM examples WHERE vocabulary_id = ? AND sentence_key = ?', vocabularyId, key);
  if (dup) {
    if (!dup.arabic && arabic) await run('UPDATE examples SET arabic = ? WHERE id = ?', arabic, dup.id);
    return false;
  }
  await insert('INSERT INTO examples (vocabulary_id, kind, sentence, sentence_key, arabic) VALUES (?,?,?,?,?)', vocabularyId, kind, s, key, arabic || null);
  return true;
}

/** Examples of many vocabulary items at once → Map(vocabulary_id → [{kind, sentence, arabic}]). */
export async function examplesFor(ids) {
  const map = new Map();
  if (!ids.length) return map;
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    const rows = await all(`SELECT vocabulary_id, kind, sentence, arabic FROM examples WHERE vocabulary_id IN (${part.map(() => '?').join(',')}) ORDER BY id`, ...part);
    for (const r of rows) {
      if (!map.has(r.vocabulary_id)) map.set(r.vocabulary_id, []);
      map.get(r.vocabulary_id).push({ kind: r.kind, sentence: r.sentence, arabic: r.arabic });
    }
  }
  return map;
}

export function vocabularyPublic(v) {
  return {
    vocabulary_id: v.id,
    term: v.term,
    item_type: v.item_type,
    part_of_speech: v.part_of_speech,
    level: v.level,
    band: v.band,
    pronunciation: v.pronunciation,
    arabic_general: v.arabic,
    simple_english: v.simple_english,
    similar: JSON.parse(v.similar_json || '[]'),
    topic: v.topic,
  };
}
