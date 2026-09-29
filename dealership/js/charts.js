/* =====================================================================
   مكتبة رسوم خفيفة (HTML/SVG) — بدون اعتماديات خارجية
   كل عنصر قابل للنقر يحمل data-* يلتقطها app.js (تفسير / فلترة / فتح تفاصيل)
   ===================================================================== */
(function () {
  'use strict';
  const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const num = (n) => nf0.format(Math.round(n || 0));
  const sar = (n) => num(n) + ' ر.س';
  const pct = (x, d = 1) => (isFinite(x) ? (d ? nf1.format(x) : nf0.format(x)) : '0') + '%';
  const short = (n) => {
    const a = Math.abs(n);
    if (a >= 1e6) return nf1.format(n / 1e6).replace('.0', '') + ' م';
    if (a >= 1e3) return nf0.format(n / 1e3) + ' ألف';
    return num(n);
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const attrs = (o) => (o ? Object.entries(o).map(([k, v]) => ` ${k}="${esc(v)}"`).join('') : '');

  const empty = (msg) => `<div class="empty"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/></svg><span>${esc(msg || 'لا توجد بيانات ضمن الفلاتر الحالية')}</span></div>`;

  /* Horizontal bars (RTL: labels right, bars grow leftwards) */
  function hbars(items, opt = {}) {
    if (!items.length || items.every((i) => !i.value)) return empty();
    const max = opt.max || Math.max(...items.map((i) => i.value)) || 1;
    return `<div class="hbars${opt.compact ? ' compact' : ''}">` + items.map((it) => {
      const w = Math.max(0.5, (it.value / max) * 100);
      return `<div class="hb-row${it.active ? ' active' : ''}${it.dim ? ' dim' : ''}"${attrs(it.attrs)} data-tip="${esc(it.tip || it.label + ': ' + (it.valueLabel || num(it.value)))}">
        <div class="hb-label">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>
        <div class="hb-track"><div class="hb-bar" style="width:${w}%;${it.color ? 'background:' + it.color : ''}"></div></div>
        <div class="hb-val">${esc(it.valueLabel || num(it.value))}</div>
      </div>`;
    }).join('') + '</div>';
  }

  /* Vertical columns (time: oldest on the right in RTL) */
  function columns(items, opt = {}) {
    if (!items.length || items.every((i) => !i.value)) return empty();
    const max = Math.max(...items.map((i) => i.value)) || 1;
    const h = opt.height || 180;
    return `<div class="cols" style="height:${h + 40}px">` + items.map((it) => {
      const hh = Math.max(2, (it.value / max) * h);
      return `<div class="col${it.active ? ' active' : ''}"${attrs(it.attrs)} data-tip="${esc(it.tip || it.label + ': ' + (it.valueLabel || num(it.value)))}">
        <div class="col-bar-wrap" style="height:${h}px"><div class="col-bar" style="height:${hh}px"></div></div>
        <div class="col-label">${esc(it.label)}</div></div>`;
    }).join('') + '</div>';
  }

  /* Line / area chart. series: [{name, cls, values[]}], labels[] — RTL x axis */
  function line(labels, series, opt = {}) {
    const W = 640, H = opt.height || 220, pl = 12, pr = 52, pt = 14, pb = 28;
    const all = series.flatMap((s) => s.values);
    if (!all.length || all.every((v) => !v)) return empty();
    const max = (opt.max || Math.max(...all)) * 1.08 || 1;
    const min = opt.min != null ? opt.min : 0;
    const n = labels.length;
    const x = (i) => W - pr - (n === 1 ? (W - pl - pr) / 2 : (i / (n - 1)) * (W - pl - pr));
    const y = (v) => pt + (1 - (v - min) / (max - min || 1)) * (H - pt - pb);
    const fmt = opt.fmt || short;
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const v = min + ((max - min) * k) / 4;
      g += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${W - pr + 6}" y="${y(v) + 4}" text-anchor="start">${esc(fmt(v))}</text>`;
    }
    const step = Math.ceil(n / 12);
    labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) g += `<text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => [x(i), y(v)]);
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      if (si === 0 && opt.area !== false) g += `<path class="area ${s.cls || ''}" d="${d} L${pts[pts.length - 1][0]} ${y(min)} L${pts[0][0]} ${y(min)} Z"/>`;
      g += `<path class="line ${s.cls || ''}" d="${d}"/>`;
      pts.forEach((p, i) => { g += `<circle class="dot ${s.cls || ''}" cx="${p[0]}" cy="${p[1]}" r="3.5"/>`; });
    });
    // hit targets per x (bigger than marks)
    const bw = (W - pl - pr) / Math.max(1, n - 1);
    labels.forEach((l, i) => {
      const tip = l + ' — ' + series.map((s) => (series.length > 1 ? s.name + ': ' : '') + (opt.tipFmt || fmt)(s.values[i])).join(' · ');
      g += `<rect class="hit" x="${x(i) - bw / 2}" y="${pt}" width="${bw}" height="${H - pt - pb}" data-tip="${esc(tip)}"${attrs(opt.pointAttrs ? opt.pointAttrs(i) : null)}/>`;
    });
    const legend = series.length > 1 ? `<div class="legend ll">${series.map((s) => `<span><i class="sw ${s.cls || ''}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
    return `${legend}<svg class="chart line-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">${g}</svg>`;
  }

  /* Donut. items: [{label, value, cls, attrs}] */
  function donut(items, opt = {}) {
    const total = items.reduce((a, b) => a + b.value, 0);
    if (!total) return empty();
    const R = 70, r = 46, C = 90;
    let a0 = -Math.PI / 2, paths = '';
    const gap = items.filter((i) => i.value > 0).length > 1 ? 0.025 : 0;
    items.forEach((it) => {
      if (!it.value) return;
      const a = (it.value / total) * Math.PI * 2;
      const s = a0 + gap / 2, e = a0 + a - gap / 2;
      const large = e - s > Math.PI ? 1 : 0;
      const p = (ang, rad) => [C + rad * Math.cos(ang), C + rad * Math.sin(ang)];
      const [x1, y1] = p(s, R), [x2, y2] = p(e, R), [x3, y3] = p(e, r), [x4, y4] = p(s, r);
      const d = a >= Math.PI * 2 - 0.001
        ? `M${C} ${C - R} A${R} ${R} 0 1 1 ${C - 0.01} ${C - R} L${C - 0.01} ${C - r} A${r} ${r} 0 1 0 ${C} ${C - r} Z`
        : `M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`;
      paths += `<path class="seg ${it.cls || ''}${it.active ? ' active' : ''}" d="${d}" data-tip="${esc(it.label + ': ' + (it.valueLabel || num(it.value)) + ' (' + pct((it.value / total) * 100) + ')')}"${attrs(it.attrs)}/>`;
      a0 += a;
    });
    const center = opt.center ? `<text x="${C}" y="${C - 2}" class="donut-v">${esc(opt.center.value)}</text><text x="${C}" y="${C + 16}" class="donut-l">${esc(opt.center.label)}</text>` : '';
    const legend = `<div class="d-legend">${items.map((it) => `<div class="d-leg-row"${attrs(it.attrs)}><i class="sw ${it.cls || ''}"></i><span>${esc(it.label)}</span><b>${pct((it.value / total) * 100)}</b><em>${esc(it.valueLabel || num(it.value))}</em></div>`).join('')}</div>`;
    return `<div class="donut-wrap"><svg class="chart donut" viewBox="0 0 180 180">${paths}${center}</svg>${legend}</div>`;
  }

  function sparkline(values, cls) {
    if (!values || values.length < 2) return '';
    const W = 120, H = 34, max = Math.max(...values), min = Math.min(...values);
    const n = values.length;
    const pts = values.map((v, i) => [W - (i / (n - 1)) * W, H - 3 - ((v - min) / (max - min || 1)) * (H - 6)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return `<svg class="spark ${cls || ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d} L0 ${H} L${W} ${H} Z" class="spark-area"/><path d="${d}" class="spark-line"/><circle cx="${pts[n - 1][0]}" cy="${pts[n - 1][1]}" r="2.6" class="spark-dot"/></svg>`;
  }

  /* Funnel. stages: [{label, value, attrs, note}] */
  function funnel(stages) {
    if (!stages.length || !stages[0].value) return empty();
    const max = stages[0].value;
    return '<div class="funnel">' + stages.map((s, i) => {
      const prev = i ? stages[i - 1].value : null;
      const conv = prev ? (s.value / prev) * 100 : null;
      const w = Math.max(6, (s.value / max) * 100);
      return `<div class="fn-row"${attrs(s.attrs)} data-tip="${esc(s.label + ': ' + num(s.value) + (conv != null ? ' — ' + pct(conv) + ' من المرحلة السابقة' : ''))}">
        <div class="fn-label"><span class="fn-i">${i + 1}</span>${esc(s.label)}</div>
        <div class="fn-track"><div class="fn-bar" style="width:${w}%"><b>${num(s.value)}</b></div></div>
        <div class="fn-conv">${conv != null ? pct(conv) : '—'}</div></div>`;
    }).join('') + '</div>';
  }

  /* Bubble quadrant. points: [{x,y,size,label,cls,attrs}] */
  function bubbles(points, opt = {}) {
    if (!points.length) return empty();
    const W = 760, H = 440, pl = 58, pr = 20, pt = 20, pb = 46;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y), ss = points.map((p) => p.size);
    const xMax = Math.max(...xs) * 1.1 || 1, yMin = Math.max(0, Math.min(...ys) - 1.5), yMax = Math.max(...ys) + 1.5;
    const sMax = Math.max(...ss) || 1;
    const X = (v) => pl + (v / xMax) * (W - pl - pr);
    const Y = (v) => pt + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - pt - pb);
    let g = '';
    const xm = X(opt.xMid), ym = Y(opt.yMid);
    g += `<rect class="q q-hh" x="${xm}" y="${pt}" width="${W - pr - xm}" height="${ym - pt}"/>`;
    g += `<rect class="q q-lh" x="${pl}" y="${pt}" width="${xm - pl}" height="${ym - pt}"/>`;
    g += `<rect class="q q-hl" x="${xm}" y="${ym}" width="${W - pr - xm}" height="${H - pb - ym}"/>`;
    g += `<rect class="q q-ll" x="${pl}" y="${ym}" width="${xm - pl}" height="${H - pb - ym}"/>`;
    for (let k = 0; k <= 4; k++) {
      const yv = yMin + ((yMax - yMin) * k) / 4, xv = (xMax * k) / 4;
      g += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${Y(yv)}" y2="${Y(yv)}"/><text class="axis" x="${pl - 8}" y="${Y(yv) + 4}" text-anchor="end">${nf1.format(yv)}%</text>`;
      g += `<text class="axis" x="${X(xv)}" y="${H - pb + 18}" text-anchor="middle">${num(xv)}</text>`;
    }
    g += `<line class="mid" x1="${xm}" x2="${xm}" y1="${pt}" y2="${H - pb}"/><line class="mid" x1="${pl}" x2="${W - pr}" y1="${ym}" y2="${ym}"/>`;
    const ql = opt.quadLabels || {};
    g += `<text class="qlabel" x="${W - pr - 8}" y="${pt + 16}" text-anchor="end">${esc(ql.hh || '')}</text>`;
    g += `<text class="qlabel" x="${pl + 8}" y="${pt + 16}" text-anchor="start">${esc(ql.lh || '')}</text>`;
    g += `<text class="qlabel" x="${W - pr - 8}" y="${H - pb - 8}" text-anchor="end">${esc(ql.hl || '')}</text>`;
    g += `<text class="qlabel" x="${pl + 8}" y="${H - pb - 8}" text-anchor="start">${esc(ql.ll || '')}</text>`;
    g += `<text class="axis-title" x="${(W + pl) / 2}" y="${H - 6}" text-anchor="middle">${esc(opt.xLabel || '')}</text>`;
    g += `<text class="axis-title" transform="translate(14 ${(H - pb) / 2}) rotate(-90)" text-anchor="middle">${esc(opt.yLabel || '')}</text>`;
    points.slice().sort((a, b) => b.size - a.size).forEach((p) => {
      const r = 5 + Math.sqrt(p.size / sMax) * 21;
      g += `<g class="bub ${p.cls || ''}${p.active ? ' active' : ''}"${attrs(p.attrs)} data-tip="${esc(p.tip || p.label)}"><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${r}"/>${r > 15 ? `<text x="${X(p.x)}" y="${Y(p.y) + 4}" text-anchor="middle">${esc(p.short || p.label)}</text>` : ''}</g>`;
    });
    return `<div dir="ltr" class="bubble-wrap"><svg class="chart bubble" viewBox="0 0 ${W} ${H}">${g}</svg></div>`;
  }

  /* Stacked horizontal (aging / composition). segs: [{label, value, cls, attrs}] */
  function stack(segs, opt = {}) {
    const total = segs.reduce((a, b) => a + b.value, 0);
    if (!total) return empty(opt.empty);
    return `<div class="stackbar">${segs.filter((s) => s.value > 0).map((s) => `<div class="st-seg ${s.cls || ''}" style="flex:${s.value}"${attrs(s.attrs)} data-tip="${esc(s.label + ': ' + (s.valueLabel || num(s.value)) + ' (' + pct((s.value / total) * 100) + ')')}"></div>`).join('')}</div>
      <div class="legend">${segs.map((s) => `<span${attrs(s.attrs)}><i class="sw ${s.cls || ''}"></i>${esc(s.label)} <b>${esc(s.valueLabel || num(s.value))}</b></span>`).join('')}</div>`;
  }

  /* Gauge (0..100) */
  function gauge(value, opt = {}) {
    const v = Math.max(0, Math.min(100, value || 0));
    const R = 70, C = 90, a0 = Math.PI, a1 = Math.PI + (v / 100) * Math.PI;
    const p = (a) => [C + R * Math.cos(a), C + R * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1), [xe, ye] = p(2 * Math.PI);
    return `<svg class="chart gauge ${opt.cls || ''}" viewBox="0 0 180 104"><path class="g-track" d="M${x0} ${y0} A${R} ${R} 0 0 1 ${xe} ${ye}"/><path class="g-val" d="M${x0} ${y0} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}"/><text x="90" y="86" class="g-text">${esc(opt.label || pct(v))}</text></svg>`;
  }

  window.CH = { num, sar, pct, short, esc, attrs, empty, hbars, columns, line, donut, sparkline, funnel, bubbles, stack, gauge };
})();
