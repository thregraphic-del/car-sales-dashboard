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
    // a long text: say first that it takes about a minute, copy the full message, and give one clear button
    const ok = await copyText(full);
    openModal(`<div class="stack gpt-help">
        <h2 style="margin:0">لخّص المقطع في ChatGPT</h2>
        <p class="gpt-step">⏳ <b>النص طويل، فتجهيزه في ChatGPT ياخذ نحو دقيقة</b> قبل ما يشتغل زر الإرسال — انتظر لين يخلص الشريط «جارٍ إضافة النص».</p>
        <p class="gpt-step">${ok ? '✓' : '⚠'} <b>${ok ? 'نُسخت الرسالة كاملة' : 'ما قدرنا ننسخ'}</b> (طلب «لخّص بالعربي، الزبدة فقط» ومعه النص كله)${ok ? '' : ' — استخدم «نسخ كل النص» من الإعدادات'}.</p>
        <a class="btn primary" href="${url}" target="_blank" rel="noopener" data-close>افتح ChatGPT ↗</a>
        <p class="gpt-step">${fits ? 'الرسالة بتكون جاهزة في المربع.' : '<b>بعد ما يفتح:</b> المس مربع الكتابة مطوّلًا ← «لصق» ← إرسال.'}</p>
      </div>`);
}
