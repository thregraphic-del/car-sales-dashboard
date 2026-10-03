// Opened directly from disk (file://): the app needs its server.
if (location.protocol === 'file:') {
  document.body.innerHTML = '<div style="max-width:640px;margin:8vh auto;padding:32px;font-family:system-ui,sans-serif;background:#fff;border:1px solid #e7e4dc;border-radius:20px;line-height:1.9;color:#1b1d21">'
    + '<h1 style="margin:0 0 8px;font-size:24px">⚠️ يجب تشغيل التطبيق عبر الخادم</h1>'
    + '<p>فتحت ملف <b>index.html</b> مباشرة. هذا التطبيق يحتاج خادمه (قاعدة البيانات وتحليل يوتيوب)، لذلك لا يعمل بفتح الملف.</p>'
    + '<ol style="padding-inline-start:22px">'
    + '<li>استخدم الموقع المنشور، أو شغّل النسخة المحلية:</li>'
    + '<li>ثبّت <a href="https://nodejs.org" target="_blank" rel="noopener">Node.js</a> الإصدار 22 أو أحدث (LTS).</li>'
    + '<li>في ويندوز: انقر مرتين على <b>start-windows.bat</b> داخل المجلد.<br><span style="color:#8a8f98">أو من الطرفية: <code dir="ltr">npm install</code> ثم <code dir="ltr">npm start</code></span></li>'
    + '<li>افتح <a href="http://localhost:3000" dir="ltr">http://localhost:3000</a> في المتصفح.</li>'
    + '</ol></div>';
  document.body.style.background = '#f6f5f1';
}
