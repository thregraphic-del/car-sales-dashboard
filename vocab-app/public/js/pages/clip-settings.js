// A page of its own for the clip's settings (not a sheet over the clip): speed, font size, where the video sits,
// two switches for practising, the word list, the time strip and the sentence times. Choices are kept on this
// device and the clip picks them up when it opens again. Nothing here runs in the background.
import { icon, esc } from '../ui.js';

const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

const BULB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>';
const COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
const sw = (id, on) => `<label class="tg-switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span class="tg-track" aria-hidden="true"><span class="tg-knob"></span></span></label>`;

export async function render(view, { segments, params }) {
  const id = Number(segments[1]) || 0;
  const isVideo = params.v === '1';
  const hasTimes = params.t === '1';
  const clip = id ? `#/source/${id}` : '#/add';
  const small = window.innerWidth < 700;
  const defFont = window.matchMedia?.('(max-width: 760px)').matches ? '13' : '16';
  let font = Number(pref('reader.font', defFont)) || Number(defFont);
  let rate = Number(pref('reader.rate', '1')) || 1;
  let vp = pref('reader.vp', 'top') === 'bottom' ? 'bottom' : 'top';

  const row = (tip, label, sub, control) => `<div class="cs-row" data-tip="${esc(tip)}"><div class="cs-lab">${label}${sub ? `<span class="cs-sub">${sub}</span>` : ''}</div>${control}</div>`;
  const rates = [0.5, 0.75, 0.9, 1, 1.25, 1.5];

  // a page of its own: the app's bars are out of the way until you close it (✕)
  document.body.classList.add('clipset-on');
  window.addEventListener('hashchange', () => document.body.classList.remove('clipset-on'), { once: true });
  view.className = 'view page-clipset';
  view.innerHTML = `<div class="cs-page">
    <header class="cs-head">
      <a class="btn icon ghost cs-x" href="${clip}" aria-label="إغلاق" title="إغلاق ورجوع للمقطع">✕</a>
      <h1>إعدادات المقطع</h1>
      ${id ? `<span class="cs-tools"><a class="btn icon ghost" href="${clip}?copy=1" aria-label="نسخ النص" title="نسخ كل النص: للصقه في ChatGPT أو أي مكان">${COPY}</a><a class="btn icon ghost cs-ideas" href="${clip}?ideas=1" aria-label="أفكار" title="أفكار: اكتب ملاحظة، الصق ملخص ChatGPT، اسأل ChatGPT">${BULB}</a></span>` : ''}
    </header>
    <div class="cs-grid">
      <section class="cs-card">
        <h2>التشغيل</h2>
        ${isVideo && hasTimes ? `<div class="cs-row cs-col" data-tip="سرعة الفيديو: أبطأ تفهم أوضح، وأسرع توفّر وقتك."><div class="cs-lab">السرعة</div><div class="cs-chips" id="csRate">${rates.map((r) => `<button type="button" class="sopt en-inline${r === rate ? ' active' : ''}" data-rate="${r}">${r}×</button>`).join('')}</div></div>` : ''}
        ${isVideo && hasTimes ? row('يقف بعد كل جملة بقدر ما تحتاج لتعيدها بصوتك، وبعدها يكمّل.', 'قف بعد كل جملة للترديد', 'يقف بعد كل جملة لتعيدها', sw('csShadow', pref('reader.mode', 'normal') === 'shadow')) : ''}
        ${isVideo && hasTimes ? row('كل جملة تنعاد مرتين تلقائيًا قبل ما يكمّل المقطع.', 'تكرار الجملة', 'كل جملة تنعاد مرتين', sw('csRepeat', pref('reader.repeatPara', '0') === '1')) : ''}
        ${row('يعرض لك الكلمات الجديدة وأنت تشاهد، عشان تتجهّز لها وما تفوتك.', 'قائمة الكلمات', 'تطلع الكلمات الجديدة بعد كل ١٠ كلمات', sw('csWords', pref('reader.wbOn3', '1') === '1'))}
      </section>
      <section class="cs-card">
        <h2>الشكل</h2>
        ${row('يكبّر خط النص أو يصغّره. بعد ما تضغط ينقلك للمقطع تشوف التغيير وتعتمده بعلامة ✓.', 'حجم الخط', '', `<span class="cs-font"><button type="button" class="sopt" data-font="-1" aria-label="تصغير الخط">−</button><b class="en-inline" id="csFont">${font}</b><button type="button" class="sopt" data-font="1" aria-label="تكبير الخط">+</button></span>`)}
        ${isVideo ? row('مكان الفيديو: فوق النص أو تحته.', 'مكان الفيديو', '', `<div class="cs-chips" id="csVp"><button type="button" class="sopt${vp === 'top' ? ' active' : ''}" data-vp="top">فوق</button><button type="button" class="sopt${vp === 'bottom' ? ' active' : ''}" data-vp="bottom">تحت</button></div>`) : ''}
        ${isVideo && hasTimes ? row('شريط صغير تحت الفيديو يوريك وين وصلت وكم باقي.', 'شريط الوقت', 'يوريك وين وصلت في المقطع', sw('csStrip', pref('reader.strip', small ? '0' : '1') === '1')) : ''}
        ${hasTimes ? row('يكتب وقت كل جملة بجنبها، وتضغطه تروح لنفس اللحظة.', 'وقت كل جملة', 'يظهر وقت الجملة بجنبها', sw('csTimes', pref('reader.times', small ? '0' : '1') === '1')) : ''}
        ${hasTimes ? '<p class="cs-note">الشريط والأوقات مخفيّين تلقائيًا في الجوال الصغير، وتشغّلهم متى تبي.</p>' : ''}
      </section>
      <section class="cs-card cs-legend" data-tip="ألوان الكلمات داخل النص: الأخضر المزرق لكلمة جديدة عليك، والبنفسجي لكلمة كانت في كلماتك."><span class="cs-lg-t">الألوان:</span><span class="mk-l new">جديد</span><span>جديدة عليك</span><span class="mk-l mine">كلماتي</span><span>عندك</span></section>
    </div>
    <a class="btn primary lg cs-done" href="${clip}">تم</a>
  </div>`;

  const $ = (s) => view.querySelector(s);
  const on = (sel, ev, fn) => $(sel)?.addEventListener(ev, fn);
  view.querySelector('#csRate')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rate]');
    if (!b) return;
    rate = Number(b.dataset.rate);
    setPref('reader.rate', String(rate));
    view.querySelectorAll('#csRate .sopt').forEach((x) => x.classList.toggle('active', x === b));
  });
  view.querySelector('#csVp')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vp]');
    if (!b) return;
    vp = b.dataset.vp;
    setPref('reader.vp', vp);
    view.querySelectorAll('#csVp .sopt').forEach((x) => x.classList.toggle('active', x === b));
  });
  on('#csShadow', 'change', (e) => setPref('reader.mode', e.target.checked ? 'shadow' : 'normal'));
  on('#csRepeat', 'change', (e) => setPref('reader.repeatPara', e.target.checked ? '1' : '0'));
  on('#csWords', 'change', (e) => setPref('reader.wbOn3', e.target.checked ? '1' : '0'));
  on('#csStrip', 'change', (e) => setPref('reader.strip', e.target.checked ? '1' : '0'));
  on('#csTimes', 'change', (e) => setPref('reader.times', e.target.checked ? '1' : '0'));
  // − / +: keep the size, then show it on the clip itself with a small bar (− + ✓)
  view.querySelectorAll('[data-font]').forEach((b) => b.addEventListener('click', () => {
    font = Math.max(12, Math.min(30, font + Number(b.dataset.font)));
    setPref('reader.font', String(font));
    location.hash = `${clip}?fontbar=1`;
  }));
}
