import { api } from '../api.js';
import { esc, num } from '../ui.js';
import { wordRowHtml, bindWordList } from '../components.js';

const SOURCE_AR = {
  flashcard: 'البطاقات', today: 'تعلّم اليوم', listening: 'الاستماع',
  'game:connections': 'روابط الكلمات', 'game:choose-meaning': 'اختر المعنى', 'game:listen-choose': 'استمع واختر',
  'game:fill-blank': 'املأ الفراغ', 'game:build-sentence': 'ركّب الجملة', 'game:context': 'تحدّي السياق', 'game:translation': 'تحدّي الترجمة',
};

/** Single-series bar chart (reviews per day) with hover tooltip. */
function barChart(series) {
  const W = 720;
  const H = 200;
  const pad = { t: 10, r: 8, b: 26, l: 30 };
  const max = Math.max(4, ...series.map((d) => d.reviews));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = iw / series.length;
  const barW = Math.max(3, bw - 4);
  const y = (v) => pad.t + ih - (v / top) * ih;
  const r = Math.min(4, barW / 2);
  const bars = series.map((d, i) => {
    const x = pad.l + i * bw + (bw - barW) / 2;
    const h = (d.reviews / top) * ih;
    if (!d.reviews) return `<rect x="${x}" y="${pad.t + ih - 1}" width="${barW}" height="1" fill="var(--line)" data-i="${i}"/>`;
    // Rounded top, square baseline.
    const yy = pad.t + ih - h;
    const rr = Math.min(r, h);
    return `<path class="bar-mark" data-i="${i}" d="M${x},${pad.t + ih} V${yy + rr} Q${x},${yy} ${x + rr},${yy} H${x + barW - rr} Q${x + barW},${yy} ${x + barW},${yy + rr} V${pad.t + ih} Z"/>`;
  });
  const grid = [0, 1, 2, 3, 4].map((k) => `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(k * step)}" y2="${y(k * step)}"/><text class="axis-text" x="${pad.l - 6}" y="${y(k * step) + 4}" text-anchor="end">${k * step}</text>`);
  const labels = series.map((d, i) => (i % 5 === 0 || i === series.length - 1)
    ? `<text class="axis-text" x="${pad.l + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${d.date.slice(5).replace('-', '/')}</text>` : '');
  const hits = series.map((d, i) => `<rect x="${pad.l + i * bw}" y="${pad.t}" width="${bw}" height="${ih}" fill="transparent" data-hit="${i}"/>`);
  return `<div class="chart" dir="ltr"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Reviews per day, last 30 days">${grid.join('')}${bars.join('')}${labels.join('')}${hits.join('')}</svg><div class="tooltip" id="tt"></div></div>`;
}

export async function render(view) {
  const p = await api.progress(30);
  const total = p.levels.B1 + p.levels.B2 + p.levels.C1 || 1;
  const statusTotal = p.status.new + p.status.learning + p.status.mastered || 1;
  const last30 = p.series.reduce((s, d) => s + d.reviews, 0);
  const activeDays = p.series.filter((d) => d.reviews).length;

  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Progress</div><h1>تقدّمك</h1><p>كل الأرقام محسوبة من سجل إجاباتك الفعلي.</p></div></div>
    <div class="grid cols-4">
      <div class="card stat"><div class="value">🔥 ${p.streak.current}</div><div class="label">سلسلة الأيام الحالية</div><div class="hint">الأفضل: ${p.streak.best}</div></div>
      <div class="card stat"><div class="value">${p.accuracy}%</div><div class="label">دقة الإجابات</div><div class="hint">من ${num(p.total_reviews)} إجابة</div></div>
      <div class="card stat"><div class="value">${num(last30)}</div><div class="label">إجابات آخر 30 يومًا</div><div class="hint">${activeDays} يوم نشط</div></div>
      <div class="card stat"><div class="value" style="color:var(--good)">${p.status.mastered}</div><div class="label">كلمات متقنة</div><div class="hint">${p.status.learning} قيد التعلّم · ${p.status.new} جديدة</div></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="row between" style="margin-bottom:10px"><b>المراجعات اليومية — آخر 30 يومًا</b><span class="small muted" id="chartTotal"></span></div>
      ${barChart(p.series)}
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="card"><b>المستويات</b><div style="margin-top:14px">
        ${['B1', 'B2', 'C1'].map((l) => `<div class="meter-row"><span class="chip lvl-${l}">${l}</span><div class="bar"><span style="width:${(100 * p.levels[l]) / total}%;background:var(--${l.toLowerCase()})"></span></div><b class="en-inline small">${p.levels[l]}</b></div>`).join('')}
      </div></div>
      <div class="card"><b>الحالة</b><div style="margin-top:14px">
        ${[['new', 'جديدة', 'accent'], ['learning', 'قيد التعلّم', 'warn'], ['mastered', 'متقنة', 'good']].map(([k, l, c]) => `<div class="meter-row" style="grid-template-columns:90px 1fr 40px"><span class="small">${l}</span><div class="bar"><span style="width:${(100 * p.status[k]) / statusTotal}%;background:var(--${c})"></span></div><b class="en-inline small">${p.status[k]}</b></div>`).join('')}
      </div></div>
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="card"><b>أين تتدرّب</b>
        <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:14px">
          <thead><tr class="muted small"><th style="text-align:start;padding:6px 0">النشاط</th><th>الإجابات</th><th>الدقة</th></tr></thead>
          <tbody>${p.by_source.map((s) => `<tr style="border-top:1px solid var(--line)"><td style="padding:8px 0">${esc(SOURCE_AR[s.source] || s.source)}</td><td style="text-align:center" class="en-inline">${s.n}</td><td style="text-align:center" class="en-inline">${Math.round((100 * s.c) / s.n)}%</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="card"><b>الكلمات الأكثر صعوبة</b><p class="small muted" style="margin:4px 0 12px">تظهر هذه الكلمات أكثر في خطتك اليومية.</p>
        <div class="word-list" id="hard">${p.hardest.map((w) => wordRowHtml(w)).join('') || '<p class="muted small">لا توجد أخطاء بعد.</p>'}</div>
      </div>
    </div>`;

  // Hover tooltip for the chart.
  const chart = view.querySelector('.chart');
  const tt = view.querySelector('#tt');
  chart.addEventListener('mousemove', (e) => {
    const hit = e.target.closest('[data-hit]');
    if (!hit) return tt.classList.remove('show');
    const i = Number(hit.dataset.hit);
    const d = p.series[i];
    chart.querySelectorAll('.bar-mark').forEach((b) => b.classList.toggle('dim', Number(b.dataset.i) !== i));
    const box = chart.getBoundingClientRect();
    const hb = hit.getBoundingClientRect();
    tt.style.left = `${hb.left - box.left + hb.width / 2}px`;
    tt.style.top = `${Math.max(30, e.clientY - box.top)}px`;
    tt.innerHTML = `<b>${d.date}</b><br>${d.reviews} reviews · ${d.correct} correct${d.saved ? `<br>${d.saved} saved` : ''}`;
    tt.classList.add('show');
  });
  chart.addEventListener('mouseleave', () => {
    tt.classList.remove('show');
    chart.querySelectorAll('.bar-mark').forEach((b) => b.classList.remove('dim'));
  });
  view.querySelector('#chartTotal').textContent = `${num(last30)} إجابة`;
  bindWordList(view.querySelector('#hard'), () => p.hardest);
}
