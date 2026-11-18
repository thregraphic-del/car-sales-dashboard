// 📰 Article links: only public pages are opened, the readable text is kept, the dictionary words are marked.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';
import { isPrivateAddress, checkArticleUrl, extractArticle } from '../server/lib/article.js';

const db = freshDatabase();
delete process.env.OPENROUTER_API_KEY;
delete process.env.SESSION_SECRET;

let app;
const call = async (method, url, body) => {
  const res = await fetch(app.base + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); db.cleanup(); });

const PAGE = `<!doctype html><html><head><title>Fallback title</title>
<meta property="og:title" content="How teams cope with every deadline &amp; burnout"></head><body>
<nav><ul><li>Home page of the site</li><li>Pricing and plans for everyone</li></ul></nav>
<script>var tracking = "this must never appear in the text at all";</script>
<article><h1>How teams cope with every deadline</h1>
<p>Many people are reluctant to change their habits, but it is crucial to be consistent and to cope with every distraction.</p>
<p>The deadline was feasible, yet the burnout was a real struggle for the whole team &mdash; and that is why we must prioritize the evidence.</p>
<ul><li>Good teams rely on each other and come up with efficient ideas every week.</li></ul>
<p>Short.</p></article>
<footer><p>Copyright notice and a long list of legal links for the footer area.</p></footer></body></html>`;

test('addresses that point inside a network are refused', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.5.5', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '151.101.1.1', '2606:4700:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('only normal public http(s) links pass', () => {
  for (const bad of ['ftp://example.com/a', 'javascript:alert(1)', 'http://localhost/', 'http://127.0.0.1/', 'http://10.0.0.5/x', 'http://[::1]/', 'https://user:pw@example.com/', 'http://example.com:8080/', 'http://printer.local/', 'not a link']) {
    assert.throws(() => checkArticleUrl(bad), (e) => e.status === 400, bad);
  }
  assert.equal(checkArticleUrl('https://www.ycombinator.com/blog/post#top').href, 'https://www.ycombinator.com/blog/post');
});

test('the readable text is kept; menus, scripts, footers and tiny bits are dropped', () => {
  const { title, text } = extractArticle(PAGE);
  assert.equal(title, 'How teams cope with every deadline & burnout');
  assert.match(text, /reluctant to change their habits/);
  assert.match(text, /burnout was a real struggle for the whole team — and that/);
  assert.match(text, /Good teams rely on each other/);
  assert.doesNotMatch(text, /tracking|Pricing|Copyright|Short\./);
  assert.ok(text.split('\n').length >= 3);
});

test('a page with no text or not in English gives a clear message', () => {
  assert.throws(() => extractArticle('<html><body><div id="root"></div><script>app()</script></body></html>'), (e) => e.status === 422);
  const ar = `<article>${[1, 2, 3, 4, 5, 6].map((n) => `<p>هذه الفقرة العربية رقم ${n} طويلة ولا تحتوي على كلمات إنجليزية كثيرة ولكنها تكفي لتجاوز الحد الأدنى للطول المطلوب هنا.</p>`).join('')}</article>`;
  assert.throws(() => extractArticle(ar), (e) => e.status === 422 && /مو بالإنجليزي/.test(e.message));
});

test('the route refuses an address inside the network', async () => {
  for (const url of ['http://127.0.0.1:9/', 'http://localhost/', 'http://169.254.169.254/latest/meta-data/']) {
    const r = await call('POST', '/api/sources/article', { url });
    assert.equal(r.status, 400, url);
  }
  assert.equal((await call('POST', '/api/sources/article', {})).status, 400);
});

test('an article becomes a text with its link, and the dictionary words are marked at once', async () => {
  const { analyzeArticle } = await import('../server/services/sources.js');
  const r = await analyzeArticle('https://example.com/blog/deadlines', 1, { fetcher: async () => ({ html: PAGE, finalUrl: 'https://example.com/blog/deadlines' }) });
  assert.equal(r.title, 'How teams cope with every deadline & burnout');
  const view = await call('GET', `/api/sources/${r.source_id}`);
  assert.equal(view.body.source.kind, 'text');
  assert.equal(view.body.source.url, 'https://example.com/blog/deadlines');
  const terms = view.body.items.map((i) => i.term);
  for (const w of ['reluctant', 'crucial', 'deadline', 'burnout', 'prioritize', 'evidence']) assert.ok(terms.includes(w), `${w} is marked (${terms.join(', ')})`);
  const list = await call('GET', '/api/sources');
  const mine = list.body.find((s) => s.id === r.source_id);
  assert.equal(mine.kind, 'text');
  assert.match(mine.preview, /reluctant to change/);
});
