// Scheduled job: prepares the full word family (English forms, Arabic, an example each,
// how common) of every built-in dictionary word, a few batches per minute, so the word
// panel opens instantly. It rests once the whole list is done.
export default async () => {
  const platform = globalThis.Netlify?.env?.toObject?.() || {};
  for (const [k, v] of Object.entries(platform)) if (process.env[k] === undefined && typeof v === 'string') process.env[k] = v;
  try {
    const { scheduledFormsRun, relevelStep } = await import('../../server/services/dictionary.js');
    // first the CEFR levels of every word (by the learner dictionaries), then the word families
    const lv = await relevelStep();
    console.log('relevel', JSON.stringify(lv));
    if (lv.idle) {
      const r = await scheduledFormsRun();
      console.log('prepare-forms', JSON.stringify(r));
    }
  } catch (err) {
    console.error('prepare-forms failed', err?.message || err);
  }
};

export const config = { schedule: '* * * * *' };
