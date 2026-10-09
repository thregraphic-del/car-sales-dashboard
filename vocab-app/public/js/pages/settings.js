import { api } from '../api.js';
import { state } from '../state.js';
import { speak } from '../audio.js';
import { esc, icon, toast, num } from '../ui.js';
import { refreshStats } from '../app.js';
import { readDataFiles, importSnapshot, countsOf, TABLES } from '../data-transfer.js';

const TABLE_LABELS = {
  sources: 'مصادر', transcript_lines: 'أسطر نص', vocabulary: 'مفردات', examples: 'أمثلة', occurrences: 'سياقات', user_vocabulary: 'كلماتك',
  review_logs: 'مراجعات', daily_plans: 'خطط يومية', daily_plan_items: 'عناصر الخطط', word_groups: 'مجموعات', word_group_items: 'عضويات', ai_cache: 'ذاكرة الذكاء',
};
const countsHtml = (c) => `<div class="data-counts">${TABLES.map((t) => `<span>${TABLE_LABELS[t]}: <b class="en-inline">${c[t] ?? 0}</b></span>`).join('')}</div>`;

export async function render(view) {
  const cfg = await api.config();
  state.config = cfg;
  state.user = cfg.user;
  const u = cfg.user;
  let theme = 'system';
  try {
    theme = localStorage.getItem('theme') || 'system';
  } catch {
    /* storage unavailable */
  }

  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Settings</div><h1>الإعدادات</h1></div></div>
    <div class="grid cols-2">
      <div class="card stack">
        <b>ملفك</b>
        <label class="field">الاسم<input class="input" id="name" value="${esc(u.name)}"></label>
        <label class="field">هدف الكلمات اليومي: <span id="goalVal" class="en-inline">${u.daily_goal}</span>
          <input type="range" id="goal" min="${cfg.limits?.daily_goal_min || 4}" max="${cfg.limits?.daily_goal_max || 30}" value="${u.daily_goal}" style="accent-color:var(--accent)"></label>
        <p class="tiny muted">يطبّق الهدف الجديد على خطة الغد (خطة اليوم ثابتة؛ يمكنك إضافة 5 كلمات من صفحة اليوم).</p>
        <button class="btn primary" id="saveProfile" style="justify-self:start">حفظ</button>
      </div>
      <div class="card stack">
        <b>الصوت والمظهر</b>
        <label class="field">سرعة النطق الأساسية: <span id="rateVal" class="en-inline">${u.speech_rate}×</span>
          <input type="range" id="rate" min="0.6" max="1.3" step="0.05" value="${u.speech_rate}" style="accent-color:var(--accent)"></label>
        <label class="row small" style="gap:8px"><input type="checkbox" class="check" id="ar" ${u.speak_arabic ? 'checked' : ''}> نطق المعنى العربي في صفحة الاستماع</label>
        <button class="btn sm" id="test" style="justify-self:start">${icon.speaker} جرّب الصوت</button>
        <div class="field">المظهر<div class="segmented" id="theme">${[['system', 'تلقائي'], ['light', 'فاتح'], ['dark', 'داكن']].map(([k, l]) => `<button data-t="${k}" class="${k === theme ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      </div>
      <div class="card stack" id="usageCard">
        <b>الاستهلاك والتكلفة</b>
        <div class="small muted">…</div>
      </div>
      <div class="card stack">
        <b>المحرّكات</b>
        <div class="row between small"><span>تحليل المفردات</span><span class="chip ar-chip ${cfg.ai.available ? 'st-mastered' : 'st-learning'}">${cfg.ai.configured ? (cfg.ai.available ? 'OpenRouter ✓' : 'OpenRouter متوقف مؤقتًا') : 'قاموس محلي'}</span></div>
        <p class="tiny muted">${cfg.ai.configured
          ? `القاموس المحلي أولًا، والذكاء الاصطناعي فقط عند الحاجة (والنتائج تُحفظ ولا تُطلب مرتين). النموذج: <span class="en-inline">${esc(cfg.ai.model || '')}</span>`
          : 'شرح الذكاء الاصطناعي غير متاح — نستخدم القاموس المحلي.'}</p>
        <div class="row between small"><span>تحويل النص إلى كلام</span><span class="chip ar-chip ${cfg.tts.server ? 'st-mastered' : 'st-learning'}">${cfg.tts.server ? esc(cfg.tts.provider) : 'أصوات المتصفح'}</span></div>
        <p class="tiny muted">لأصوات أعلى جودة اضبط TTS_PROVIDER و TTS_API_KEY على الخادم.</p>
        <div class="row between small"><span>نسخة التطبيق</span><span class="chip en-inline">v${esc(cfg.app?.version || '?')}</span></div>
        <div class="row between small"><span>قاعدة البيانات</span><span class="chip en-inline">${cfg.database.engine === 'postgres' ? 'Postgres' : 'SQLite (محلي)'}</span></div>
      </div>
      ${cfg.auth?.required ? `<div class="card stack">
        <b>الحساب</b>
        <div class="row between small"><span>اسم المستخدم</span><span class="chip en-inline">${esc(u.username || '')}</span></div>
        <div class="row between small"><span>نوع الحساب</span><span class="chip ar-chip">${u.role === 'admin' ? 'المسؤول' : 'متعلّم'}</span></div>
        <p class="tiny muted">كلماتك ومجموعاتك وتقدّمك وفيديوهاتك خاصة بحسابك — لا يراها أي حساب آخر.</p>
        <form id="pwForm" class="stack" autocomplete="on">
          <input class="hidden" autocomplete="username" value="${esc(u.username || '')}" readonly>
          <label class="field">كلمة المرور الحالية<input class="input en" type="password" id="pwOld" autocomplete="current-password" required></label>
          <label class="field">كلمة مرور جديدة <span class="tiny muted">(10 أحرف على الأقل)</span><input class="input en" type="password" id="pwNew" autocomplete="new-password" minlength="10" required></label>
          <button class="btn" type="submit" style="justify-self:start">تغيير كلمة المرور</button>
        </form>
        <button class="btn ghost" id="logout" style="justify-self:start">تسجيل الخروج</button>
      </div>` : ''}
      <div class="card stack" style="grid-column:1/-1">
        <b>بياناتك</b>
        <div id="counts" class="small muted">…</div>
        <div class="btn-row">
          <a class="btn" href="${api.backupUrl()}" download>${icon.download || '⬇'} تنزيل نسخة احتياطية كاملة (JSON)</a>
          <a class="btn ghost" href="#/words">تصدير الكلمات إلى Excel ←</a>
        </div>
        <div class="divider" style="margin:6px 0"></div>
        <b class="small">نقل بياناتك من النسخة المحلية</b>
        <p class="small ink-2">أغلق نافذة النسخة المحلية أولًا، ثم اختر من مجلدها <span class="en-inline">data</span> الملف <span class="en-inline">lexitube.db</span>
          — ومعه <span class="en-inline">lexitube.db-wal</span> إن وُجد (حدّد الملفين معًا) — أو نسخة احتياطية <span class="en-inline">.json</span>.
          تُقرأ الملفات داخل متصفحك ولا تتغيّر. قبل الاستبدال نحفظ نسخة احتياطية من بياناتك الحالية على الخادم.</p>
        <input type="file" id="dataFile" multiple accept=".db,.sqlite,.json,.db-wal,application/json" class="input">
        <div id="importBox"></div>
        <div id="demoBox"></div>
        <div id="backupsBox"></div>
      </div>
      ${cfg.features?.demo_reset ? `<div class="card stack">
        <b>البيانات التجريبية (محلي فقط)</b>
        <p class="small ink-2">إعادة تعيين البيانات التجريبية تحذف كل شيء (بما فيه كلماتك) وتعيد إنشاء الفيديوهات والكلمات التجريبية.</p>
        <button class="btn bad" id="reset" style="justify-self:start">${icon.trash} إعادة تعيين البيانات التجريبية</button>
      </div>` : ''}
    </div>`;

  const $ = (s) => view.querySelector(s);
  $('#goal').addEventListener('input', (e) => ($('#goalVal').textContent = e.target.value));
  $('#rate').addEventListener('input', (e) => ($('#rateVal').textContent = `${e.target.value}×`));
  $('#saveProfile').addEventListener('click', async () => {
    state.user = await api.updateMe({ name: $('#name').value, daily_goal: Number($('#goal').value) });
    toast('تم الحفظ');
  });
  $('#rate').addEventListener('change', async (e) => {
    state.user = await api.updateMe({ speech_rate: Number(e.target.value) });
  });
  $('#ar').addEventListener('change', async (e) => {
    state.user = await api.updateMe({ speak_arabic: e.target.checked });
  });
  $('#test').addEventListener('click', () => speak('I was reluctant to ask for help.').catch(() => toast('الصوت غير مدعوم في هذا المتصفح')));
  $('#theme').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const t = b.dataset.t;
    try {
      localStorage.setItem('theme', t);
    } catch {
      /* ignore */
    }
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    view.querySelectorAll('#theme button').forEach((x) => x.classList.toggle('active', x === b));
  });
  $('#reset')?.addEventListener('click', async () => {
    if (!confirm('سيتم حذف كل البيانات وإعادة إنشاء البيانات التجريبية. متابعة؟')) return;
    await api.resetDemo();
    toast('تمت إعادة التعيين');
    refreshStats();
    location.hash = '#/';
  });

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

  /* --------------------------------------------------------- usage */
  const usd = (n) => `$${Number(n || 0).toFixed(Number(n) && Number(n) < 0.01 ? 4 : 2)}`;
  const tok = (u) => num(Number(u.prompt_tokens || 0) + Number(u.completion_tokens || 0));
  const row = (label, u) => `<tr><td>${label}</td><td class="en-inline">${num(u.calls)}</td><td class="en-inline">${tok(u)}</td><td class="en-inline">${usd(u.cost)}</td><td class="en-inline">${num(u.transcripts)}</td></tr>`;
  const head = '<tr class="muted"><th></th><th>طلبات AI</th><th>توكنز</th><th>التكلفة</th><th>فيديوهات</th></tr>';
  api.aiUsage().then((r) => {
    const box = document.getElementById('usageCard');
    if (!box) return;
    const or = r.openrouter;
    box.innerHTML = `<b>الاستهلاك والتكلفة</b>
      <table class="usage-table small">${head}${row('اليوم', r.me.today)}${row('هذا الشهر', r.me.month)}${row('الإجمالي', r.me.total)}</table>
      ${r.site ? `<b class="small" style="margin-top:6px">كل الحسابات — هذا الشهر</b>
        <table class="usage-table small">${head}${row('المجموع', r.site.month)}${r.site.users.map((u) => row(`<span class="en-inline">${esc(u.username || u.name)}</span>`, u)).join('')}${row('الإجمالي منذ البداية', r.site.total)}</table>
        ${or ? `<div class="row between small"><span>مفتاح OpenRouter (المصروف الفعلي)</span><b class="en-inline">${usd(or.usage)}${or.limit != null ? ` / ${usd(or.limit)}` : ''}</b></div>` : ''}
        <p class="tiny muted">«فيديوهات» = نصوص جُلبت عبر Supadata (الخطة المجانية ≈ 100 شهريًا). التكلفة كما يحسبها OpenRouter؛ الإجابات المحفوظة مجانية.</p>` : ''}`;
  }).catch(() => {});

  /* ---------------------------------------------------------- data */
  let current = {};
  const loadSummary = async () => {
    try {
      const s = await api.dataSummary();
      current = s.counts;
      $('#counts').innerHTML = countsHtml(current);
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
            <ul style="margin:6px 0 0">${s.backups.map((b) => `<li><a href="${api.serverBackupUrl(b.id)}" download>${esc(b.created_at.slice(0, 16).replace('T', ' '))}</a> · ${b.reason === 'before-import' ? 'قبل الاستيراد' : 'يدوية'}</li>`).join('')}</ul></details>`
        : '';
    } catch (err) {
      $('#counts').textContent = err.message;
    }
  };
  loadSummary();

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
        ${hasCurrent ? `<div class="alert warn"><span>سيحلّ محتوى الملف <b>محل</b> بياناتك الحالية على الموقع (${current.user_vocabulary || 0} كلمة). سنحفظ نسخة احتياطية منها أولًا على الخادم، ويمكنك أيضًا تنزيلها الآن.</span></div>` : ''}
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
