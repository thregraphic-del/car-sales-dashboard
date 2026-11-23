import { api } from '../api.js';
import { GOAL_TYPES, goalTypes, setGoalTypes, setGoalN, goalFor, ADVANCED_GOALS } from '../goal.js';
import { state } from '../state.js';
import { speak } from '../audio.js';
import { esc, icon, toast, num, openModal, closeModal, applyTheme } from '../ui.js';
import { refreshStats } from '../app.js';
import { readDataFiles, importSnapshot, countsOf, TABLES } from '../data-transfer.js';
import { feedbackCardHtml, bindFeedbackCard } from '../feedback.js';
import { costReportHtml, bindCostReport } from '../cost-report.js';
import { teamCardHtml, bindTeamCard } from '../team.js';

const TABLE_LABELS = {
  sources: 'مصادر', transcript_lines: 'أسطر نص', vocabulary: 'مفردات', examples: 'أمثلة', occurrences: 'سياقات', user_vocabulary: 'كلماتك',
  review_logs: 'مراجعات', daily_plans: 'خطط يومية', daily_plan_items: 'عناصر الخطط', word_groups: 'مجموعات', word_group_items: 'عضويات', ai_cache: 'ذاكرة الذكاء',
};
const MAIN = ['user_vocabulary', 'sources', 'word_groups', 'review_logs'];
const countsHtml = (c, keys = TABLES) => `<div class="data-counts">${keys.map((t) => `<span>${TABLE_LABELS[t]}: <b class="en-inline">${c[t] ?? 0}</b></span>`).join('')}</div>`;

export async function render(view) {
  const cfg = await api.config();
  state.config = cfg;
  state.user = cfg.user;
  const u = cfg.user;
  let theme = 'system';
  try {
    theme = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
    // «تلقائي» is gone: an old «auto» becomes what the phone shows now
    if (localStorage.getItem('theme') === 'auto') { theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; localStorage.setItem('theme', theme); }
  } catch {
    /* storage unavailable */
  }

  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Settings</div><h1>الإعدادات</h1></div></div>
    <div class="set-secs">
      <details class="set-sec"><summary><span class="ss-i">👤</span><b>حسابي</b></summary><div class="ss-body">
        <section class="set-card">
        <div class="set-line"><label class="set-lbl" for="name">الاسم</label><input class="input" id="name" value="${esc(u.name)}"><button class="btn primary sm" id="saveProfile">حفظ</button></div>
        ${swItem('darkSw', '🌙 الوضع الداكن', '', '', theme === 'dark')}
        </section>
      ${cfg.auth?.required && u.guest ? `<section class="set-card guest-settings"><b>👤 أنت ضيف</b><a class="btn primary" href="/register" style="justify-self:start">سجّل حسابك المجاني</a><a class="link-btn small" href="/login" style="justify-self:start">عندي حساب</a></section>` : ''}
      ${cfg.auth?.required && !u.guest ? '<button class="btn ghost" id="logout" style="justify-self:start">تسجيل الخروج</button>' : ''}
      ${cfg.auth?.required && !u.guest ? `<div class="card stack">
        <b>الحساب</b>
        <div class="row between small"><span>اسم المستخدم</span><span class="chip en-inline">${esc(u.username || '')}</span></div>
        <div class="row between small"><span>نوع الحساب</span><span class="chip ar-chip">${u.role === 'admin' ? 'المسؤول' : 'متعلّم'}</span></div>
        <p class="tiny muted">كلماتك ومجموعاتك وتقدّمك وفيديوهاتك خاصة بحسابك — لا يراها أي حساب آخر.</p>
        <form id="emForm" class="row wrap" style="gap:8px;align-items:flex-end"><label class="field" style="flex:1;min-width:200px">✉️ الإيميل <span class="tiny muted">(يوصلك عليه كود إذا نسيت كلمة المرور)</span><input class="input en" type="email" id="emIn" autocomplete="email" placeholder="you@gmail.com"></label><button class="btn" type="submit">حفظ الإيميل</button></form>
        <form id="phForm" class="row wrap" style="gap:8px;align-items:flex-end"><label class="field" style="flex:1;min-width:200px">📱 رقم الجوال <span class="tiny muted">(تقدر تدخل فيه بدل اسم المستخدم)</span><input class="input en" type="tel" inputmode="tel" id="phIn" autocomplete="tel" placeholder="05xxxxxxxx"></label><button class="btn" type="submit">حفظ الرقم</button></form>
        <p class="tiny muted">تقدر تسجّل دخولك باسم المستخدم أو الإيميل أو رقم الجوال.</p>
        <form id="pwForm" class="stack" autocomplete="on">
          <input class="hidden" autocomplete="username" value="${esc(u.username || '')}" readonly>
          <label class="field">كلمة المرور الحالية<input class="input en" type="password" id="pwOld" autocomplete="current-password" required></label>
          <label class="field">كلمة مرور جديدة<input class="input en" type="password" id="pwNew" autocomplete="new-password" required></label>
          <button class="btn" type="submit" style="justify-self:start">تغيير كلمة المرور</button>
        </form>
      </div>` : ''}
      </div></details>
      <details class="set-sec"><summary><span class="ss-i">🔊</span><b>التشغيل (الصوت والفيديو)</b></summary><div class="ss-body">
        <section class="set-card">
          <h3 class="set-h">🔊 التشغيل</h3>
          <div class="set-line"><span class="set-lbl">سرعة النطق</span><input type="range" id="rate" min="0.6" max="1.3" step="0.05" value="${u.speech_rate}" style="accent-color:var(--accent);flex:1"><b id="rateVal" class="en-inline">${u.speech_rate}×</b></div>
          ${swItem('ar', 'انطق العربي أيضًا', '', '', u.speak_arabic)}
          ${swItem('wideSw', 'المقطع يفتح بشاشة موسّعة', '', '', ls('app.openWide2', '0') === '1')}
          ${swItem('autoSw', 'احفظ كلمات المقطع تلقائيًا', '', '', ls('app.autoSave', '0') === '1')}
          <button class="btn sm ghost" id="test" style="justify-self:start">${icon.speaker} جرّب الصوت</button>
        </section>
      </div></details>
      <details class="set-sec"><summary><span class="ss-i">🎯</span><b>أهداف إضافية</b></summary><div class="ss-body">
        <section class="set-card">
          <h3 class="set-h">🎯 أهداف إضافية</h3>
          ${ADVANCED_GOALS.map((k) => swItem(`adv_${k}`, `${k === 'watch' ? '⏱ كم قعدت في الموقع' : '📖 القواعد والأمثلة'}`, '', `<span class="goal-num"><input class="input en-inline" data-advn="${k}" type="number" inputmode="numeric" min="${GOAL_TYPES[k].min}" max="${GOAL_TYPES[k].max}" value="${goalFor(k)}"> <span class="small">${GOAL_TYPES[k].unit} كل يوم</span></span>`, goalTypes().includes(k))).join('')}
        </section>
      </div></details>
      <details class="set-sec"><summary><span class="ss-i">🤝</span><b>الفريق والتواصل</b></summary><div class="ss-body">
      ${feedbackCardHtml()}
      ${teamCardHtml(cfg)}
      </div></details>
      <details class="set-sec"><summary><span class="ss-i">💾</span><b>بياناتي</b></summary><div class="ss-body">
      <div class="card stack" style="grid-column:1/-1">
        <b>بياناتك</b>
        <div id="counts" class="small muted">…</div>
        <div class="btn-row">
          <a class="btn" href="${api.backupUrl()}" download>${icon.download || '⬇'} تنزيل نسخة احتياطية كاملة (JSON)</a>
          <a class="btn ghost" href="#/words">تصدير الكلمات إلى Excel ←</a>
        </div>
        <button type="button" class="mydata-entry" id="myData"><span class="ic">🧹</span><span><b>إدارة بياناتي</b><span class="tiny muted">مسح الكلمات أو المقاطع أو الإعدادات — مع نسخة احتياطية تلقائية</span></span><span aria-hidden="true">‹</span></button>
        <details class="adv"><summary class="small">⚙ خيارات متقدمة (نقل البيانات، المحرّكات)</summary><div class="stack" style="margin-top:10px">
        <b class="small">نقل بياناتك من النسخة المحلية</b>
        <p class="small ink-2">أغلق نافذة النسخة المحلية أولًا، ثم اختر من مجلدها <span class="en-inline">data</span> الملف <span class="en-inline">lexitube.db</span>
          — ومعه <span class="en-inline">lexitube.db-wal</span> إن وُجد (حدّد الملفين معًا) — أو نسخة احتياطية <span class="en-inline">.json</span>.
          تُقرأ الملفات داخل متصفحك ولا تتغيّر. قبل الاستبدال نحفظ نسخة احتياطية من بياناتك الحالية على الخادم.</p>
        <input type="file" id="dataFile" multiple accept=".db,.sqlite,.json,.db-wal,application/json" class="input">
        <div id="importBox"></div>
        <div id="demoBox"></div>
        <div id="backupsBox"></div>
        <div class="divider" style="margin:6px 0"></div>
        <b class="small">المحرّكات</b>
        <div class="row between small"><span>تحليل المفردات</span><span class="chip ar-chip ${cfg.ai.available ? 'st-mastered' : 'st-learning'}">${cfg.ai.configured ? (cfg.ai.available ? 'OpenRouter ✓' : 'OpenRouter متوقف مؤقتًا') : 'قاموس محلي'}</span></div>
        <p class="tiny muted">${cfg.ai.configured
          ? `القاموس المحلي أولًا، والذكاء الاصطناعي فقط عند الحاجة (والنتائج تُحفظ ولا تُطلب مرتين). النموذج: <span class="en-inline">${esc(cfg.ai.model || '')}</span>`
          : 'شرح الذكاء الاصطناعي غير متاح — نستخدم القاموس المحلي.'}</p>
        <div class="row between small"><span>تحويل النص إلى كلام</span><span class="chip ar-chip ${cfg.tts.server ? 'st-mastered' : 'st-learning'}">${cfg.tts.server ? esc(cfg.tts.provider) : 'أصوات المتصفح'}</span></div>
        <div class="row between small"><span>نسخة التطبيق</span><span class="chip en-inline">v${esc(cfg.app?.version || '?')}</span></div>
        <div class="row between small"><span>قاعدة البيانات</span><span class="chip en-inline">${cfg.database.engine === 'postgres' ? 'Postgres' : 'SQLite (محلي)'}</span></div>
        </div></details>
      </div>
      </div></details>
      ${cfg.can_set_paid || !cfg.auth?.required || u.role === 'admin' || cfg.features?.demo_reset ? `<details class="set-sec"><summary><span class="ss-i">🔒</span><b>للمالك</b></summary><div class="ss-body">
      ${cfg.can_set_paid ? `<div class="card stack" style="grid-column:1/-1" id="paidCard">
        <b>🔒 ميزات مدفوعة — لك أنتِ فقط</b>
        <p class="tiny muted" style="margin:0">تستهلك رصيد الذكاء الاصطناعي، فهي <b>مطفية</b> عندك وغير موجودة أصلًا عند غيرك. شغّليها للضرورة وأطفيها بعدها. (البديل المجاني: زر ChatGPT.)</p>
        <div class="row between small"><span>📝 ملخص المقطع كامل</span><label class="tg-switch"><input type="checkbox" data-paid="summary" ${cfg.paid?.summary ? 'checked' : ''}><span class="tg-track" aria-hidden="true"><span class="tg-knob"></span></span></label></div>
        <div class="row between small"><span>السوالف باختصار (كل فترة داخل الفيديو)</span><label class="tg-switch"><input type="checkbox" data-paid="recap" ${cfg.paid?.recap ? 'checked' : ''}><span class="tg-track" aria-hidden="true"><span class="tg-knob"></span></span></label></div>
      </div>` : ''}
      ${!cfg.auth?.required || u.role === 'admin' ? costReportHtml() : ''}
      ${cfg.features?.demo_reset ? `<div class="card stack">
        <b>البيانات التجريبية (محلي فقط)</b>
        <p class="small ink-2">إعادة تعيين البيانات التجريبية تحذف كل شيء (بما فيه كلماتك) وتعيد إنشاء الفيديوهات والكلمات التجريبية.</p>
        <button class="btn bad" id="reset" style="justify-self:start">${icon.trash} إعادة تعيين البيانات التجريبية</button>
      </div>` : ''}
      </div></details>` : ''}
    </div>`;

  const $ = (s) => view.querySelector(s);
  $('#rate').addEventListener('input', (e) => ($('#rateVal').textContent = `${e.target.value}×`));
  $('#saveProfile').addEventListener('click', async () => {
    state.user = await api.updateMe({ name: $('#name').value });
    toast('تم الحفظ');
  });
  $('#rate').addEventListener('change', async (e) => {
    state.user = await api.updateMe({ speech_rate: Number(e.target.value) });
  });
  $('#test').addEventListener('click', () => speak('I was reluctant to ask for help.').catch(() => toast('الصوت غير مدعوم في هذا المتصفح')));
  // 🔘 every switch: green = on (its options open), grey = off (they fold away)
  const bindSw = (id, onChange) => $(`#${id}`)?.addEventListener('change', (e) => {
    e.target.closest('.set-item')?.classList.toggle('on', e.target.checked);
    onChange(e.target.checked);
  });
  // 🎯 advanced goals: switching one on adds it to the goals (the number is set beside it); at least one goal always stays
  ADVANCED_GOALS.forEach((k) => bindSw(`adv_${k}`, (on) => {
    const now = new Set(goalTypes());
    if (on) now.add(k); else now.delete(k);
    setGoalTypes([...now]);
  }));
  view.querySelectorAll('[data-advn]').forEach((i) => i.addEventListener('change', () => setGoalN(i.dataset.advn, Number(i.value))));
  bindSw('darkSw', (on) => { const t = on ? 'dark' : 'light'; try { localStorage.setItem('theme', t); } catch { /* ignore */ } applyTheme(t); });
  bindSw('wideSw', (on) => lsSet('app.openWide2', on ? '1' : '0'));
  bindSw('autoSw', (on) => lsSet('app.autoSave', on ? '1' : '0'));
  bindSw('ar', async (on) => { state.user = await api.updateMe({ speak_arabic: on }); });
  $('#reset')?.addEventListener('click', async () => {
    if (!confirm('سيتم حذف كل البيانات وإعادة إنشاء البيانات التجريبية. متابعة؟')) return;
    await api.resetDemo();
    toast('تمت إعادة التعيين');
    refreshStats();
    location.hash = '#/';
  });

  if ($('#emForm')) {
    api.myEmail().then((r) => { if (r.email) $('#emIn').value = r.email; }).catch(() => {});
    $('#emForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api.saveEmail($('#emIn').value.trim()); toast('تم حفظ الإيميل ✓'); } catch (err) { toast(err.message); }
    });
  }
  if ($('#phForm')) {
    api.myPhone().then((r) => { if (r.phone) $('#phIn').value = /^9665\d{8}$/.test(r.phone) ? `0${r.phone.slice(3)}` : r.phone; }).catch(() => {});
    $('#phForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api.savePhone($('#phIn').value.trim()); toast('تم حفظ رقم الجوال ✓'); } catch (err) { toast(err.message); }
    });
  }
  $('#pwForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.changePassword($('#pwOld').value, $('#pwNew').value);
      $('#pwOld').value = '';
      $('#pwNew').value = '';
      toast('تم تغيير كلمة المرور');
    } catch (err) {
      toast(err.message);
    }
  });
  $('#logout')?.addEventListener('click', async () => {
    await api.logout().catch(() => {});
    location.replace('/login');
  });

  bindFeedbackCard(view);
  bindTeamCard(view);
  bindCostReport(view);
  view.querySelectorAll('[data-paid]').forEach((box) => box.addEventListener('change', async () => {
    try {
      const r = await api.setPaid({ [box.dataset.paid]: box.checked });
      state.config = { ...(state.config || cfg), paid: r.paid };
      toast(box.checked ? 'شغّلتها — تستهلك رصيد الذكاء الاصطناعي، لا تنسين تطفينها' : 'انطفت ✓');
    } catch (err) { box.checked = !box.checked; toast(err.message); }
  }));

  /* ---------------------------------------------------------- data */
  let current = {};
  const loadSummary = async () => {
    try {
      const s = await api.dataSummary();
      current = s.counts;
      $('#counts').innerHTML = countsHtml(current, MAIN);
      const empty = !current.sources && !current.user_vocabulary;
      $('#demoBox').innerHTML = empty
        ? `<div class="alert info"><span>حسابك فارغ. انقل بياناتك من النسخة المحلية بالأعلى، أو جرّب التطبيق بالبيانات التجريبية.</span>
            <div><button class="btn sm" id="demo">تحميل البيانات التجريبية</button></div></div>`
        : '';
      $('#demo')?.addEventListener('click', async (ev) => {
        ev.target.disabled = true;
        try {
          await api.loadDemo();
          toast('تمت إضافة البيانات التجريبية');
          refreshStats();
          loadSummary();
        } catch (err) {
          toast(err.message);
          ev.target.disabled = false;
        }
      });
      $('#backupsBox').innerHTML = s.backups.length
        ? `<details class="small"><summary>نسخ احتياطية محفوظة على الخادم (${s.backups.length})</summary>
            <ul style="margin:6px 0 0">${s.backups.map((b) => `<li><a href="${api.serverBackupUrl(b.id)}" download>${esc(b.created_at.slice(0, 16).replace('T', ' '))}</a> · ${REASONS[b.reason] || 'يدوية'} · <button type="button" class="linkish" data-restore="${b.id}">استرجاع</button></li>`).join('')}</ul></details>`
        : '';
    } catch (err) {
      $('#counts').textContent = err.message;
    }
  };
  loadSummary();

  /* ---------------------------------------------------------- 🧹 إدارة بياناتي */
  $('#myData').addEventListener('click', () => openMyData({ onDone: () => { refreshStats(); loadSummary(); } }));
  view.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-restore]');
    if (!b) return;
    if (!confirm('نرجّع بياناتك كما كانت في هذه النسخة؟ (نحفظ نسخة من الحالية أولًا)')) return;
    b.disabled = true;
    b.innerHTML = '<span class="spinner"></span>';
    try {
      const snap = await api.serverBackup(b.dataset.restore);
      await importSnapshot(snap);
      toast('تم الاسترجاع ✓');
      refreshStats();
      loadSummary();
    } catch (err) {
      toast(err.message);
      b.disabled = false;
      b.textContent = 'استرجاع';
    }
  });

  $('#dataFile').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    const file = files.find((f) => !/-(wal|shm)$/i.test(f.name)) || files[0];
    const box = $('#importBox');
    if (!file) return;
    box.innerHTML = '<p class="small"><span class="spinner"></span> نقرأ الملف…</p>';
    let snap;
    try {
      snap = await readDataFiles(files);
    } catch (err) {
      box.innerHTML = `<div class="alert"><b>${esc(err.message)}</b></div>`;
      return;
    }
    const incoming = countsOf(snap);
    const hasCurrent = Object.values(current).some((n) => n > 0);
    box.innerHTML = `<div class="card soft stack">
        <b class="small">في الملف <span class="en-inline">${esc(file.name)}</span>:</b>${countsHtml(incoming)}
        ${hasCurrent ? `<div class="alert warn"><span>سيحلّ محتوى الملف <b>محل</b> بياناتك الحالية على الموقع (${current.user_vocabulary || 0} كلمة). سنحفظ نسخة احتياطية منها أولًا على الخادم، ويمكنك أيضًا تنزيلها الحين.</span></div>` : ''}
        <div class="btn-row">${hasCurrent ? `<a class="btn sm" href="${api.backupUrl()}" download>تنزيل بياناتي الحالية أولًا</a>` : ''}
          <button class="btn primary" id="doImport">${hasCurrent ? 'استبدال ونقل البيانات' : 'نقل البيانات'}</button></div>
        <div class="progress-line hidden" id="impProg"><i></i></div><div id="impMsg" class="small"></div>
      </div>`;
    $('#doImport').addEventListener('click', async (ev) => {
      if (hasCurrent && !confirm('سيتم استبدال بياناتك الحالية بمحتوى الملف (بعد حفظ نسخة احتياطية). متابعة؟')) return;
      ev.target.disabled = true;
      const bar = $('#impProg');
      bar.classList.remove('hidden');
      $('#impMsg').innerHTML = '<span class="spinner"></span> ننقل البيانات… لا تغلق الصفحة.';
      try {
        const r = await importSnapshot(snap, (done, total) => {
          bar.firstElementChild.style.width = `${Math.round((100 * done) / Math.max(1, total))}%`;
        });
        bar.firstElementChild.style.width = '100%';
        $('#impMsg').innerHTML = r.ok
          ? `<div class="alert info"><b>✓ تم النقل والتحقق: كل الجداول مطابقة للملف.</b></div>`
          : `<div class="alert warn"><b>تم النقل مع اختلاف في بعض الأعداد:</b><ul>${TABLES.filter((t) => r.actual[t] !== r.expected[t]).map((t) => `<li>${TABLE_LABELS[t]}: الملف ${r.expected[t]} · الموقع ${r.actual[t]}</li>`).join('')}</ul>
              <span class="small">نسختك السابقة محفوظة على الخادم ويمكن استرجاعها من القائمة أدناه.</span></div>`;
        toast('تم نقل البيانات');
        refreshStats();
        loadSummary();
      } catch (err) {
        $('#impMsg').innerHTML = `<div class="alert"><b>${esc(err.message)}</b><span class="small">بياناتك السابقة محفوظة كنسخة احتياطية على الخادم — يمكنك تنزيلها من القائمة أدناه واستيرادها مجددًا.</span></div>`;
        loadSummary();
      }
    });
  });
}

const REASONS = {
  'before-import': 'قبل الاستيراد', 'before-wipe-words': 'قبل مسح الكلمات', 'before-wipe-videos': 'قبل مسح المقاطع', 'before-wipe-all': 'قبل البداية الجديدة',
};

// Site settings kept in this browser (not learning data, not caches).
const SETTING_KEY = /^(theme$|reader\.|practice\.|listen\.|help\.|words\.|filters?\.|fields\.(level|last)$)/;
const SETTINGS_BACKUP = 'settings.backup';
const DEFAULT_PREFS = { daily_goal: 10, speech_rate: 1, speak_arabic: false };

async function resetSettings() {
  const saved = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (SETTING_KEY.test(k)) saved[k] = localStorage.getItem(k);
    }
    const u = state.user || {};
    localStorage.setItem(SETTINGS_BACKUP, JSON.stringify({ at: new Date().toISOString(), local: saved, prefs: { daily_goal: u.daily_goal, speech_rate: u.speech_rate, speak_arabic: u.speak_arabic } }));
    Object.keys(saved).forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
  document.documentElement.removeAttribute('data-theme');
  state.user = await api.updateMe(DEFAULT_PREFS);
}

async function restoreSettings() {
  let b = null;
  try { b = JSON.parse(localStorage.getItem(SETTINGS_BACKUP) || 'null'); } catch { /* ignore */ }
  if (!b) throw new Error('ما فيه نسخة محفوظة من إعداداتك.');
  for (const [k, v] of Object.entries(b.local || {})) localStorage.setItem(k, v);
  if (b.prefs?.daily_goal) state.user = await api.updateMe(b.prefs);
  if (b.local?.theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
}

const MY_DATA = [
  { k: 'words', ic: '📚', t: 'مسح الكلمات', d: 'كلماتك المحفوظة وتقدّمك ومراجعاتك ومجموعاتك. المقاطع تبقى.' },
  { k: 'videos', ic: '🎬', t: 'مسح المقاطع', d: 'المقاطع اللي أضفتها. كلماتك تبقى.' },
  { k: 'settings', ic: '⚙️', t: 'استعادة الإعدادات الأصلية', d: 'إعدادات الموقع (المظهر، القارئ، الفلاتر، الهدف اليومي، الصوت) ترجع للأصل. بياناتك تبقى.' },
  { k: 'all', ic: '✨', t: 'بداية جديدة', d: 'كل اللي فوق: الكلمات والمقاطع والإعدادات. حسابك يبقى.' },
];

function openMyData({ onDone }) {
  let hasSettingsBackup = false;
  try { hasSettingsBackup = Boolean(localStorage.getItem(SETTINGS_BACKUP)); } catch { /* ignore */ }
  const box = openModal(`<div class="stack">
    <h2 style="margin:0;padding-inline-start:40px">🧹 إدارة بياناتي</h2>
    <p class="tiny muted" style="margin:0">قبل أي مسح نحفظ نسخة احتياطية تقدر ترجّعها من «بياناتك ← خيارات متقدمة».</p>
    <div class="mydata-list">${MY_DATA.map((o) => `<button type="button" class="mydata-opt${o.k === 'all' ? ' danger' : ''}" data-md="${o.k}"><span class="md-ic">${o.ic}</span><span><b>${o.t}</b><span class="tiny muted">${o.d}</span></span></button>`).join('')}</div>
    ${hasSettingsBackup ? '<button type="button" class="btn sm ghost" id="mdRestoreSettings" style="justify-self:start">↩ رجّع إعداداتي السابقة</button>' : ''}
    <div id="mdConfirm"></div>
  </div>`);
  const q = (s) => box.querySelector(s);
  box.querySelector('#mdRestoreSettings')?.addEventListener('click', async () => {
    try { await restoreSettings(); toast('رجعت إعداداتك ✓'); closeModal(); onDone(); } catch (err) { toast(err.message); }
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-md]');
    if (!b) return;
    const o = MY_DATA.find((x) => x.k === b.dataset.md);
    box.querySelectorAll('[data-md]').forEach((x) => x.classList.toggle('on', x === b));
    q('#mdConfirm').innerHTML = `<div class="card soft stack">
      <b class="small">${o.ic} ${o.t}</b>
      <label class="field small">للمتابعة اكتب <b>تأكيد</b><input class="input" id="mdWord" autocomplete="off" placeholder="تأكيد"></label>
      <button type="button" class="btn bad" id="mdGo" disabled>${o.t}</button></div>`;
    const word = q('#mdWord');
    const go = q('#mdGo');
    word.focus();
    word.addEventListener('input', () => { go.disabled = word.value.trim() !== 'تأكيد'; });
    go.addEventListener('click', async () => {
      go.disabled = true;
      go.innerHTML = '<span class="spinner"></span> لحظة…';
      try {
        if (o.k === 'words' || o.k === 'videos') await api.wipeData(o.k);
        if (o.k === 'all') await api.wipeData('all');
        if (o.k === 'settings' || o.k === 'all') await resetSettings();
        toast(`تم: ${o.t} ✓ — النسخة الاحتياطية محفوظة`);
        closeModal();
        onDone();
        if (o.k === 'settings' || o.k === 'all') setTimeout(() => location.reload(), 600);
      } catch (err) {
        toast(err.message);
        go.disabled = false;
        go.textContent = o.t;
      }
    });
  });
}


const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
/** One setting: the switch right next to its name (green = on); its own options open under it only when on. */
function swItem(id, title, note, sub = '', on = null) {
  const checked = on === null ? ls('goal.off', '0') !== '1' : !!on;
  return `<div class="set-item${checked ? ' on' : ''}">
    <label class="set-top"><input type="checkbox" class="sw" id="${id}" ${checked ? 'checked' : ''}><span class="set-t"><b>${title}</b>${note ? `<small>${note}</small>` : ''}</span></label>
    ${sub ? `<div class="set-sub"><div class="set-sub-in">${sub}</div></div>` : ''}
  </div>`;
}
