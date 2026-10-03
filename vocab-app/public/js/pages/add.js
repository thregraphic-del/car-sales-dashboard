// أضف — one box for everything: a YouTube link, a word list, notes or a text.
import { api } from '../api.js';
import { state, loadGroups } from '../state.js';
import { esc, icon, levelChip, thumbHtml, relDate, toast, $ } from '../ui.js';
import { groupPickerHtml, bindGroupPicker } from '../components.js';

const isYoutube = (s) => /^\s*(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/\S+\s*$/i.test(s);
const ERRORS = {
  no_captions: 'هذا الفيديو لا يحتوي على ترجمة إنجليزية (Captions)، لذلك لا يمكن قراءته تلقائيًا.',
  transcript_fetch_failed: 'تعذّر تنزيل نص الفيديو من يوتيوب.',
};

export async function render(view, { params }) {
  const sources = await api.sources();
  view.innerHTML = `
    <div class="page-head compact"><div><h1>أضف</h1><p>الصق رابط فيديو يوتيوب، أو كلمات، أو ملاحظاتك، أو أي نص إنجليزي.</p></div></div>
    <div class="card add-box">
      <textarea class="input add-input" id="input" dir="auto" rows="4" placeholder="https://www.youtube.com/watch?v=…&#10;&#10;أو مثلًا:&#10;accurate = دقيق&#10;The report is accurate."></textarea>
      <div class="row between wrap" style="gap:10px;margin-top:12px">
        <span class="tiny muted" id="hint">لا تحتاج تنسيقًا معيّنًا — سنفهم الكلمات والمعاني والأمثلة تلقائيًا.</span>
        <button class="btn primary lg" id="go" disabled>${icon.sparkle} <span id="goLabel">تحليل</span></button>
      </div>
      <div id="manual" class="hidden stack" style="margin-top:14px">
        <label class="field">الصق نص الفيديو (Transcript) من يوتيوب: ⋯ ← Show transcript
          <textarea class="input en" id="transcript" rows="6" placeholder="0:05 So today I want to talk about…"></textarea></label>
      </div>
      <div id="status"></div>
    </div>
    <div id="result"></div>
    ${sources.length ? `<div class="section-title"><h2>مصادرك</h2></div>
    <div class="grid cols-3" id="sources">${sources.map((s) => `
      <a class="video-mini" href="#/source/${s.id}">${thumbHtml(s, { duration: s.duration_seconds })}
        <div style="min-width:0"><div class="en small clamp2" style="font-weight:600">${esc(s.title)}</div>
        <div class="tiny muted">${s.saved_count} محفوظة من ${s.item_count} · ${esc(relDate(s.analyzed_at))}</div></div></a>`).join('')}</div>` : ''}`;

  const input = $('#input', view);
  const go = $('#go', view);
  const status = $('#status', view);
  const result = $('#result', view);
  const manual = $('#manual', view);

  const update = () => {
    const v = input.value.trim();
    go.disabled = !v;
    $('#goLabel', view).textContent = isYoutube(v) ? 'افتح الفيديو' : 'تحليل';
    $('#hint', view).textContent = isYoutube(v)
      ? 'سنقرأ نص الفيديو كاملًا ونجهّز الترجمة والكلمات المفيدة.'
      : 'لا تحتاج تنسيقًا معيّنًا — سنفهم الكلمات والمعاني والأمثلة تلقائيًا.';
    if (!isYoutube(v)) manual.classList.add('hidden');
  };
  input.addEventListener('input', update);
  if (params.text) input.value = params.text;
  update();

  const steps = (labels) => {
    status.innerHTML = `<div class="loading-steps">${labels.map((s, i) => `<div class="loading-step ${i === 0 ? 'active' : ''}" data-step="${i}"><span class="dot"></span>${s}</div>`).join('')}</div>`;
    const timers = labels.slice(1).map((_, i) => setTimeout(() => {
      status.querySelectorAll('.loading-step').forEach((el) => {
        const k = Number(el.dataset.step);
        el.classList.toggle('done', k <= i);
        el.classList.toggle('active', k === i + 1);
      });
    }, [1500, 4000, 9000][i] || 12000));
    return () => timers.forEach(clearTimeout);
  };

  async function openVideo() {
    const stop = steps(['جلب الفيديو', 'قراءة النص كاملًا', 'اختيار الكلمات المفيدة', 'تجهيز الترجمة']);
    try {
      const r = await api.analyzeYoutube({ url: input.value.trim(), transcript: manual.classList.contains('hidden') ? '' : $('#transcript', view).value });
      stop();
      location.hash = `#/source/${r.source_id}`;
    } catch (err) {
      stop();
      const d = err.data || {};
      status.innerHTML = `<div class="alert" style="margin-top:14px"><b>${esc(ERRORS[d.code] || err.message)}</b>
        ${d.code ? `<span class="small">يمكنك نسخ النص من يوتيوب (⋯ ← Show transcript) ولصقه هنا، وسنكمل كالمعتاد.</span>
          <div><button class="btn sm" id="openManual">${icon.pen} لصق النص يدويًا</button></div>` : ''}</div>`;
      $('#openManual', status)?.addEventListener('click', () => {
        manual.classList.remove('hidden');
        status.innerHTML = '';
        $('#transcript', view).focus();
      });
    }
  }

  async function analyzeInput() {
    const stop = steps(['قراءة ما كتبته', 'التعرّف على الكلمات والمعاني', 'مقارنتها بكلماتك']);
    try {
      const preview = await api.importPreview(input.value);
      stop();
      status.innerHTML = '';
      renderPreview(preview);
    } catch (err) {
      stop();
      status.innerHTML = `<div class="alert" style="margin-top:14px"><b>${esc(err.message)}</b></div>`;
    }
  }

  go.addEventListener('click', () => (isYoutube(input.value.trim()) ? openVideo() : analyzeInput()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !go.disabled) go.click();
  });

  /* ------------------------------------------------------- import preview */

  function renderPreview(p) {
    // Uncertain items start unticked: the learner decides, we don't guess.
    const items = p.items.map((it) => ({ ...it, keep: (it.status !== 'saved' && !it.unsure) || it.new_info.length > 0 }));
    let groupIds = [];
    // Missing details are completed by AI in small batches (one short request each).
    const needsDetails = (it) => !it.arabic || !it.level || !it.simple_english;
    const pending = p.needs_ai ? items.filter(needsDetails) : [];
    let enriching = pending.length > 0;
    let enriched = 0;
    const draw = () => {
      const keepCount = items.filter((i) => i.keep).length;
      result.innerHTML = `
        ${p.source ? `<a class="card source-ready" href="#/source/${p.source.id}">
            <div class="row" style="gap:12px">${icon.doc}<div><b>نصك جاهز للقراءة</b>
            <div class="small ink-2">اقرأه واضغط على أي كلمة لفهمها${p.source.items ? ` · ${p.source.items} كلمة مقترحة` : ''}</div></div></div>
            <span class="btn sm primary">افتح ←</span></a>` : ''}
        ${items.length ? `
        <div class="card" style="margin-top:14px">
          <div class="row between wrap" style="gap:8px;margin-bottom:12px">
            <b>${items.length} ${items.length === 1 ? 'كلمة' : 'كلمات'} من قائمتك</b>
            ${!p.ai ? '<span class="tiny muted">بدون الذكاء الاصطناعي: المعاني من قاموس مختار فقط.</span>' : ''}
          </div>
          <div class="import-list">${items.map((it, i) => rowHtml(it, i)).join('')}</div>
          <div class="divider"></div>
          <div class="tiny muted" style="margin-bottom:8px">أضفها إلى مجموعة (اختياري)</div>
          <div id="gp">${groupPickerHtml(groupIds)}</div>
          <div class="row between wrap" style="margin-top:14px;gap:10px">
            <span class="small ink-2">${keepCount} محددة</span>
            <button class="btn primary" id="save" ${keepCount ? '' : 'disabled'}>${icon.bookmark} حفظ المحدد</button>
          </div>
        </div>` : ''}
        ${p.unclear.length ? `<div class="card soft" style="margin-top:14px"><b class="small">لم نفهم هذه الأسطر — لم نضف منها شيئًا:</b>
          <ul class="small ink-2" style="margin:6px 0 0">${p.unclear.map((l) => `<li dir="auto">${esc(l)}</li>`).join('')}</ul></div>` : ''}
        ${enriching ? `<p class="tiny muted" style="margin-top:8px"><span class="spinner"></span> ✨ نكمل المعاني والمستويات بالذكاء الاصطناعي… ${enriched}/${pending.length}</p>` : ''}
        ${p.ai_error ? `<p class="tiny muted" style="margin-top:8px">تعذّر إكمال بعض التفاصيل بالذكاء الاصطناعي: ${esc(p.ai_error)}</p>` : ''}
        ${!items.length && !p.source ? '<div class="card empty"><h3>لم نجد كلمات أو نصًا إنجليزيًا</h3><p>جرّب كلمات إنجليزية، أو "word = معنى"، أو فقرة إنجليزية.</p></div>' : ''}`;
    };
    const rowHtml = (it, i) => {
      const badge = it.status === 'saved'
        ? `<span class="chip ar-chip st-mastered">موجودة عندك ✓</span>${it.new_info.length ? `<span class="chip ar-chip st-new">+ ${it.new_info.map((n) => (n === 'example' ? 'مثال جديد' : 'معنى جديد')).join(' و')}</span>` : ''}`
        : it.status === 'known' ? '<span class="chip ar-chip">جديدة عليك</span>' : '<span class="chip ar-chip st-new">جديدة</span>';
      return `
        <div class="import-row ${it.keep ? '' : 'off'} ${it.saved_result ? 'done' : ''}" data-i="${i}">
          <input type="checkbox" class="check" ${it.keep ? 'checked' : ''} ${it.saved_result ? 'disabled' : ''} aria-label="تحديد">
          <div style="min-width:0">
            <div class="row wrap" style="gap:6px"><b class="en term-sm">${esc(it.term)}</b>${levelChip(it.level)}${badge}
              ${it.unsure ? '<span class="chip ar-chip st-difficult" title="لم نتعرّف عليها بثقة">غير متأكدين منها</span>' : ''}
              ${it.saved_result ? `<span class="chip ar-chip st-mastered">${it.saved_result === 'added' ? 'تم الحفظ ✓' : it.saved_result === 'updated' ? 'تم التحديث ✓' : 'موجودة عندك ✓'}</span>` : ''}</div>
            ${it.term.toLowerCase() !== it.input.toLowerCase() ? `<div class="tiny muted en">كتبتَ: ${esc(it.input)}</div>` : ''}
            <input class="input meaning-input" data-i="${i}" dir="rtl" value="${esc(it.arabic || '')}" placeholder="المعنى بالعربية (اختياري)" ${it.saved_result ? 'disabled' : ''}>
            ${it.meaning_from && it.meaning_from !== 'you' ? `<div class="tiny muted">المعنى من ${it.meaning_from === 'ai' ? 'الذكاء الاصطناعي' : it.meaning_from === 'saved' ? 'كلماتك' : 'القاموس'}</div>` : ''}
            ${it.examples.map((e) => `<div class="small en ink-2" style="margin-top:4px">“${esc(e.sentence)}”</div>`).join('')}
          </div>
        </div>`;
    };
    draw();

    (async () => {
      const size = p.enrich_batch || 10;
      for (let k = 0; enriching && k < pending.length; k += size) {
        const batch = pending.slice(k, k + size);
        try {
          const r = await api.importEnrich(batch.map(({ keep, touched, ...row }) => row));
          r.items.forEach((fresh, n) => {
            const it = batch[n];
            if (it.saved_result) return;
            const typed = it.meaning_from === 'you' ? it.arabic : null;
            Object.assign(it, fresh, typed ? { arabic: typed, meaning_from: 'you' } : {});
            if (!it.touched) it.keep = (it.status !== 'saved' && !it.unsure) || it.new_info.length > 0;
          });
          if (r.ai_error) {
            p.ai_error = r.ai_error;
            break;
          }
        } catch (err) {
          p.ai_error = err.message;
          break;
        }
        enriched = Math.min(pending.length, k + size);
        if (!result.contains(document.activeElement) || !document.activeElement.matches('.meaning-input')) draw();
      }
      enriching = false;
      if (!result.contains(document.activeElement) || !document.activeElement.matches('.meaning-input')) draw();
    })();

    result.addEventListener('change', (e) => {
      const row = e.target.closest('.import-row');
      if (!row || !e.target.matches('.check')) return;
      items[Number(row.dataset.i)].keep = e.target.checked;
      items[Number(row.dataset.i)].touched = true;
      draw();
    });
    result.addEventListener('input', (e) => {
      if (!e.target.matches('.meaning-input')) return;
      const it = items[Number(e.target.dataset.i)];
      it.arabic = e.target.value.trim() || null;
      it.meaning_from = it.arabic ? 'you' : null;
      it.touched = true;
    });
    bindGroupPicker(result, () => groupIds, async (gid, on) => {
      groupIds = on ? [...groupIds, gid] : groupIds.filter((g) => g !== gid);
    });
    result.addEventListener('click', async (e) => {
      if (!e.target.closest('#save')) return;
      const chosen = items.filter((i) => i.keep && !i.saved_result);
      e.target.closest('#save').disabled = true;
      try {
        const r = await api.importSave(chosen.map(({ keep, touched, saved_result: _s, ...row }) => row), groupIds);
        r.results.forEach((res, k) => {
          chosen[k].saved_result = res.result;
          chosen[k].keep = false;
        });
        const added = r.results.filter((x) => x.result === 'added').length;
        const updated = r.results.filter((x) => x.result === 'updated').length;
        toast([added ? `حُفظت ${added} كلمات` : '', updated ? `حُدّثت ${updated}` : ''].filter(Boolean).join(' · ') || 'كلها موجودة عندك ✓');
        await loadGroups();
        draw();
      } catch (err) {
        toast(err.message);
        draw();
      }
    });
  }
  return () => {};
}
