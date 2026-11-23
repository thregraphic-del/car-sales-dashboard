// 🧠 «اسأل ChatGPT»: a ready message («لخّص لي النص») with the whole text attached is copied, and ChatGPT opens in a new tab
// (the learner is already signed in there): paste, send, then ask anything about the text. Nothing is sent from our side.
import { toast, openModal, copyText } from './ui.js';

/** @param {string[]} lines the text, one sentence per item @param {{onTap?: () => void}} o */
export async function askChatGpt(lines, { onTap } = {}) {
    const body = lines.join('\n');
    const head = 'أنت خبير تلخيص. لخّص لي النص التالي بالعربي بأسلوب علمي واضح وعملي، وبأقصر شكل: الزبدة فقط، بدون مقدمات ولا حشو ولا إعادة للنص.\n'
      + 'أعطني: (١) الفكرة الأساسية في جملتين. (٢) أهم ٣ إلى ٥ نقاط. (٣) كيف أطبّقها عمليًا من اليوم.\n'
      + 'لا تتجاوز نحو ١٥٠ كلمة، وأجب عن أسئلتي عن النص بعدها بنفس الأسلوب المختصر.';
    const full = `${head}\n\n${body}`;
    onTap?.();
    const fits = encodeURIComponent(full).length <= 7000; // short enough to travel inside the link (?q=) → the box arrives filled
    const url = fits ? `https://chatgpt.com/?q=${encodeURIComponent(full)}` : 'https://chatgpt.com/';
    if (fits && body.length <= 3500) {
      // a short text: straight to ChatGPT with the whole message in the box (also copied, in case the box stays empty)
      const win = window.open(url, '_blank'); // opened first, inside the tap
      if (win) win.opener = null;
      copyText(full);
      toast(win ? '✓ فتحنا ChatGPT والرسالة جاهزة فيه — اضغط إرسال' : 'المتصفح منع فتح ChatGPT — افتحه والصق (الرسالة منسوخة)');
      return;
    }
    // a long text: the message is copied; one short card pair says what to do, one button opens ChatGPT
    const ok = await copyText(full);
    const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    openModal(`<div class="gpt2">
        <div class="gpt2-logo"><span class="gpt-mark" aria-hidden="true"></span></div>
        <div class="gpt2-steps" dir="ltr">
          <div class="gpt2-card" dir="rtl"><i class="gpt2-n">1</i><span class="gpt2-ic">${I('<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>')}</span><b>الصق</b><p>${ok ? 'تم نسخ النص مع أمر لاستخراج الملخص.' : 'ما قدرنا ننسخ — بعد ما يفتح: المس مربع الكتابة مطوّلًا ← «لصق».'}</p></div>
          <span class="gpt2-arrow" aria-hidden="true">›</span>
          <div class="gpt2-card" dir="rtl"><i class="gpt2-n">2</i><span class="gpt2-ic">${I('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>')}</span><b>انسخ</b><p>يمكنك الاحتفاظ بالملخص في «أفكاري».</p></div>
        </div>
        <a class="btn primary gpt2-go" href="${url}" target="_blank" rel="noopener" data-close>${I('<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>')}<span>انتقل إلى ChatGPT</span></a>
      </div>`);
}
