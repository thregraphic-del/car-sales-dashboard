// Extras on the "Add" page: attach a file or photo, ready-made word packs, video ideas.
import { api } from './api.js';
import { state, loadGroups } from './state.js';
import { esc, toast, openModal, closeModal, $ } from './ui.js';
import { PACKS, packSummary } from './packs-data.js';

/* ------------------------------------------------- attach a file or photo */

export const attachButtonHtml = () => `
  <label class="btn ghost" id="attachBtn" title="صورة لصفحة كلمات، PDF، Word أو ملف نصي">📎 إرفاق ملف أو صورة
    <input type="file" id="attachInput" accept="image/*,.pdf,.txt,.csv,.md,.srt,.vtt,.docx" hidden></label>`;

const MAX_PDF = 4 * 1024 * 1024;

async function imageDataUrl(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

const fileDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('تعذّرت قراءة الملف.'));
  r.readAsDataURL(file);
});

/** Text of a .docx (a zip with word/document.xml), read in the browser. */
export async function docxText(buffer) {
  const b = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ملف Word غير صالح.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    if (name === 'word/document.xml') {
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const raw = b.subarray(start, start + size);
      let xml;
      if (method === 0) xml = new TextDecoder().decode(raw);
      else {
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        xml = await new Response(stream).text();
      }
      return xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n').trim();
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('لم نجد نصًا في ملف Word.');
}

/**
 * Turn the attached file into text in the Add box, then run the usual analysis.
 * Photos and PDFs are read by AI; text and Word files are read here.
 */
export function bindAttach(view, { input, go, status }) {
  const fileInput = $('#attachInput', view);
  if (!fileInput) return;
  const busy = (msg) => {
    status.innerHTML = msg ? `<div class="loading-steps"><div class="loading-step active"><span class="dot"></span>${msg}</div></div>` : '';
  };
  const fail = (msg) => { status.innerHTML = `<div class="alert" style="margin-top:14px"><b>${esc(msg)}</b></div>`; };
  const useText = (text) => {
    input.value = text.slice(0, 50000);
    input.dispatchEvent(new Event('input'));
    go.click();
  };
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const name = file.name || 'file';
    const ext = name.toLowerCase().split('.').pop();
    try {
      if (file.type.startsWith('image/')) {
        if (!state.config?.ai?.configured) return fail('قراءة الصور تحتاج الذكاء الاصطناعي، وهو غير مفعّل.');
        busy('نقرأ الكلمات من الصورة…');
        const r = await api.extractWords('image', await imageDataUrl(file), name);
        busy('');
        if (!r.items.length) return fail('لم نجد كلمات إنجليزية في الصورة.');
        return useText(r.items.map((i) => `${i.term} = ${i.arabic}`).join('\n'));
      }
      if (ext === 'pdf' || file.type === 'application/pdf') {
        if (file.size > MAX_PDF) return fail('ملف PDF كبير جدًا (الحد 4 ميغابايت). قسّمه أو أرسل صفحات أقل.');
        if (!state.config?.ai?.configured) return fail('قراءة ملفات PDF تحتاج الذكاء الاصطناعي، وهو غير مفعّل.');
        busy('نقرأ الكلمات من ملف PDF…');
        const r = await api.extractWords('pdf', await fileDataUrl(file), name);
        busy('');
        if (!r.items.length) return fail('لم نجد كلمات إنجليزية في الملف.');
        return useText(r.items.map((i) => `${i.term} = ${i.arabic}`).join('\n'));
      }
      if (ext === 'docx') {
        busy('نقرأ ملف Word…');
        const text = await docxText(await file.arrayBuffer());
        busy('');
        return text ? useText(text) : fail('ملف Word فارغ.');
      }
      if (file.size > 2 * 1024 * 1024) return fail('الملف كبير جدًا.');
      const text = await file.text();
      return text.trim() ? useText(text) : fail('الملف فارغ.');
    } catch (err) {
      busy('');
      fail(err.message || 'تعذّرت قراءة الملف.');
    }
  });
}

/* ------------------------------------------------------- ready-made packs */

export const packsHtml = () => `
  <div class="section-title"><h2>حزم كلمات جاهزة</h2></div>
  <div class="grid cols-2 packs">${PACKS.map((p) => {
    const s = packSummary(p);
    return `<button class="card pack-card" data-pack="${p.key}">
      <div class="pack-icon">${p.icon}</div>
      <div style="min-width:0;text-align:start"><b>${esc(p.name)}</b>
        <div class="tiny muted">${s.total} كلمة · ${s.categories.length} مجموعة مصنفة</div>
        <div class="small ink-2 clamp2" style="margin-top:4px">${esc(p.description)}</div></div></button>`;
  }).join('')}</div>`;

async function savePack(pack, mode, onProgress) {
  const { categories, total } = packSummary(pack);
  const existing = await api.groups();
  const groupFor = async (name) => {
    const found = existing.find((g) => g.name === name);
    if (found) return found.id;
    const g = await api.createGroup(name);
    existing.push(g);
    return g.id;
  };
  const prefix = pack.key === 'common-1000' ? 'أشهر 1000 · ' : '';
  const single = mode === 'single' ? await groupFor(pack.name) : null;
  const jobs = [];
  for (const c of categories) {
    const gid = single ?? await groupFor(`${prefix}${c.name}`);
    for (let i = 0; i < c.list.length; i += 50) {
      jobs.push({
        gid,
        items: c.list.slice(i, i + 50).map((w) => ({
          term: w.term,
          arabic: w.arabic,
          meaning_from: 'dictionary',
          level: c.level,
          item_type: pack.key === 'phrasal-100' ? 'phrasal verb' : 'word',
        })),
      });
    }
  }
  // A few batches at a time: fast, without overloading the server.
  let done = 0;
  let added = 0;
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      const r = await api.importSave(job.items, [job.gid]);
      added += r.results.filter((x) => x.result === 'added').length;
      done += job.items.length;
      onProgress(done, total);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  await loadGroups?.();
  return { total, added };
}

export function bindPacks(view) {
  view.querySelectorAll('[data-pack]').forEach((btn) => btn.addEventListener('click', () => {
    const pack = PACKS.find((p) => p.key === btn.dataset.pack);
    const { categories, total } = packSummary(pack);
    openModal(`
      <h2 style="margin-bottom:6px">${pack.icon} ${esc(pack.name)}</h2>
      <p class="small ink-2">${esc(pack.description)}</p>
      <div class="tiny muted" style="margin:10px 0 6px">تحتوي ${total} كلمة في ${categories.length} مجموعة:</div>
      <div class="pack-cats">${categories.map((c) => `<details class="pack-cat"><summary><b>${esc(c.name)}</b> <span class="tiny muted">${c.list.length} كلمة · ${c.level}</span></summary>
        <div class="pack-words">${c.list.map((w) => `<span><b class="en-inline">${esc(w.term)}</b> <span class="muted">${esc(w.arabic)}</span></span>`).join('')}</div></details>`).join('')}</div>
      <div class="divider"></div>
      <div class="stack" style="gap:8px">
        <label class="row small" style="gap:8px"><input type="radio" name="packMode" value="grouped" checked> تنزيل في مجموعات مصنفة (${categories.length} مجموعة)</label>
        <label class="row small" style="gap:8px"><input type="radio" name="packMode" value="single"> تنزيل كمجموعة واحدة («${esc(pack.name)}»)</label>
      </div>
      <div id="packStatus" class="small" style="margin-top:10px"></div>
      <div class="btn-row" style="margin-top:12px"><button class="btn primary" id="packGo">⬇ تنزيل إلى كلماتي</button><button class="btn ghost" data-close>إلغاء</button></div>`, { wide: true });
    const root = $('#modalRoot');
    const goBtn = root.querySelector('#packGo');
    const st = root.querySelector('#packStatus');
    goBtn.addEventListener('click', async () => {
      const mode = root.querySelector('input[name="packMode"]:checked')?.value || 'grouped';
      goBtn.disabled = true;
      st.innerHTML = '<div class="bar"><span id="packBar" style="width:0%"></span></div><div class="tiny muted" id="packNum" style="margin-top:4px"></div>';
      try {
        const r = await savePack(pack, mode, (d, t) => {
          const bar = root.querySelector('#packBar');
          if (bar) bar.style.width = `${Math.round((100 * d) / t)}%`;
          const num = root.querySelector('#packNum');
          if (num) num.textContent = `${d} / ${t}`;
        });
        closeModal();
        toast(`تم ✓ ${r.added} كلمة جديدة في كلماتي (${r.total - r.added} كانت عندك)`);
        location.hash = '#/words';
      } catch (err) {
        goBtn.disabled = false;
        st.innerHTML = `<div class="alert">${esc(err.message)}</div>`;
      }
    });
  }));
}

/* --------------------------------------------------------- video ideas */

export const suggestionsHtml = () => `
  <div class="section-title row between wrap" style="gap:8px"><h2>فيديوهات مقترحة لك</h2>
    <div class="row" style="gap:6px"><div class="segmented" id="sugLen"><button data-len="short">قصير</button><button data-len="medium">متوسط</button><button data-len="long">طويل</button></div>
    <button class="btn sm ghost" id="sugMore" title="اقتراحات أخرى">↻</button></div></div>
  <div id="sugBox"><p class="tiny muted">اقتراحات بنفس مواضيع فيديوهاتك وبالطول الذي تفضّله.</p></div>`;

export function bindSuggestions(view, { onPick }) {
  const box = $('#sugBox', view);
  if (!box) return;
  if (!state.config?.ai?.configured) {
    box.innerHTML = '<p class="tiny muted">الاقتراحات تحتاج الذكاء الاصطناعي.</p>';
    return;
  }
  let duration = null;
  const show = (len) => view.querySelectorAll('#sugLen [data-len]').forEach((b) => b.classList.toggle('active', b.dataset.len === len));
  const load = async (fresh = false) => {
    box.innerHTML = '<p class="tiny muted"><span class="spinner"></span> نبحث عن فيديوهات تناسبك…</p>';
    try {
      const r = await api.suggestVideos(duration, fresh);
      duration = r.duration;
      show(duration);
      box.innerHTML = `
        ${r.videos.length ? `<div class="grid cols-3">${r.videos.map((v) => `
          <div class="video-mini sug-card">
            <img class="sug-thumb" src="${esc(v.thumbnail)}" alt="" loading="lazy">
            <div style="min-width:0"><div class="en small clamp2" style="font-weight:600">${esc(v.title)}</div>
              <div class="tiny muted">${esc(v.channel || '')}${v.minutes ? ` · ~${Math.round(v.minutes)} د` : ''}</div>
              ${v.why_ar ? `<div class="tiny ink-2 clamp2">${esc(v.why_ar)}</div>` : ''}
              <button class="btn sm primary" data-url="${esc(v.url)}" style="margin-top:6px">أضف وتعلّم</button></div></div>`).join('')}</div>`
          : '<p class="tiny muted">لم نجد فيديوهات مؤكدة هذه المرة — جرّب البحث بالمواضيع أدناه.</p>'}
        ${r.topics.length ? `<div class="tiny muted" style="margin:12px 0 6px">ابحث في يوتيوب عن مواضيع مشابهة (بنفس الطول):</div>
          <div class="row wrap" style="gap:6px">${r.topics.map((t) => `<a class="chip topic-chip" href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.label_ar)} · <span class="en-inline">${esc(t.query)}</span></a>`).join('')}</div>` : ''}`;
      box.querySelectorAll('[data-url]').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.url)));
    } catch (err) {
      box.innerHTML = `<p class="tiny muted">${esc(err.message)}</p>`;
    }
  };
  view.querySelectorAll('#sugLen [data-len]').forEach((b) => b.addEventListener('click', () => {
    duration = b.dataset.len;
    load();
  }));
  $('#sugMore', view)?.addEventListener('click', () => load(true));
  load();
}
