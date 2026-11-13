// 📝 A video summary, shaped by the kind of video (lesson → benefit + steps;
// film / vlog / fun → quick summary + highlights). Used in the video and in «خلاصاتي».
import { esc } from './ui.js';

const POINTS_TITLE = { news: '📌 أهم الحقائق', talk: '🗣 أبرز الأفكار' };

export function summaryHtml(s = {}) {
  const learn = !s.kind || s.kind === 'learn';
  const list = (items, tag = 'ul') => `<${tag}>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</${tag}>`;
  return `${s.kind_ar ? `<div class="sum-kind">🏷 ${esc(s.kind_ar)}</div>` : ''}
    <div class="sum-sec"><b>${learn ? '💡 الفكرة' : '📝 الملخص'}</b><p>${esc(s.idea || '')}</p></div>
    ${s.benefit ? `<div class="sum-sec"><b>🎁 الفائدة</b><p>${esc(s.benefit)}</p></div>` : ''}
    ${s.points?.length ? `<div class="sum-sec"><b>${POINTS_TITLE[s.kind] || '📌 أهم النقاط'}</b>${list(s.points)}</div>` : ''}
    ${s.steps?.length ? `<div class="sum-sec"><b>✅ خطوات عملية</b>${list(s.steps, 'ol')}</div>` : ''}
    ${(s.sections || []).filter((x) => x.items?.length).map((x) => `<div class="sum-sec"><b>${esc(x.emoji || '•')} ${esc(x.title)}</b>${list(x.items)}</div>`).join('')}
    ${s.quotes?.length ? `<div class="sum-sec"><b>💬 ${learn ? 'أقوال وحِكم من المقطع' : 'جمل من المقطع'}</b>${s.quotes.map((q) => `<blockquote class="sum-quote"><p class="en" dir="ltr">“${esc(q.en)}” <button class="btn icon sm ghost" data-say="${esc(q.en)}" aria-label="استمع">🔊</button></p><p>${esc(q.ar)}</p></blockquote>`).join('')}</div>` : ''}`;
}
