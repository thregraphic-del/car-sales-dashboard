// 📰 Read an article page: open it safely and keep only the readable text (title + paragraphs).
// The server opens addresses typed by learners, so it refuses anything that points inside a network
// (localhost, private ranges, cloud metadata), uses only ports 80/443 and checks the address again at
// connect time (a name that changes its answer between the check and the connection is still refused).
import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { httpError } from './errors.js';
import { config } from '../config.js';

const MAX_BYTES = 2_500_000;
const IDLE_MS = 8000;
const TOTAL_MS = 12000;
const MAX_HOPS = 4;
const OPEN_FAIL = 'ما قدرنا نفتح هذي الصفحة. تأكد من الرابط، أو الصق نص المقال هنا.';
const NO_TEXT = 'ما قدرنا نقرأ نص هذي الصفحة (قد تحتاج تسجيل دخول أو تعتمد على جافاسكربت). الصق نص المقال هنا.';

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19));
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const dotted = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateAddress(dotted[1]);
    const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) { const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16); return isPrivateAddress([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')); }
    return /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('64:ff9b:') || v.startsWith('2001:db8');
  }
  return true;
}

const safeLookup = (hostname, options, cb) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }));
    if (options?.all) return cb(null, addrs);
    return cb(null, addrs[0].address, addrs[0].family);
  });
};

/** A normal public http(s) address, or an error the learner can read. */
export function checkArticleUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw httpError(400, 'الرابط غير صحيح.'); }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw httpError(400, 'الصق رابط صفحة عادي يبدأ بـ https://');
  if (u.port && u.port !== '80' && u.port !== '443') throw httpError(400, 'هذا الرابط غير مسموح.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || (net.isIP(host) && isPrivateAddress(host)) || /^localhost$/i.test(host) || /\.(local|internal|localhost)$/i.test(host)) throw httpError(400, 'هذا الرابط غير مسموح.');
  u.hash = '';
  return u;
}

function getOnce(url) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; clearTimeout(whole); fn(v); } };
    const whole = setTimeout(() => { req.destroy(); finish(reject, new Error('timeout')); }, TOTAL_MS);
    const req = lib.request(url, {
      method: 'GET', lookup: safeLookup, timeout: IDLE_MS,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LexiTube reader)', Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5', 'Accept-Language': 'en', 'Accept-Encoding': 'identity' },
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) { res.resume(); finish(resolve, { redirect: res.headers.location }); return; }
      const type = String(res.headers['content-type'] || '');
      if (status >= 400 || !/^(text\/html|application\/xhtml|text\/plain)/i.test(type)) { res.resume(); finish(resolve, { status, type, body: null }); return; }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        chunks.push(c);
        if (size > MAX_BYTES) res.destroy(); // a very long page: the first part is enough
      });
      res.on('end', () => finish(resolve, { status, type, body: Buffer.concat(chunks) }));
      res.on('close', () => finish(resolve, { status, type, body: Buffer.concat(chunks) }));
      res.on('error', () => finish(resolve, { status, type, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => finish(reject, e));
    req.end();
  });
}

function decodeBody(buf, type) {
  let charset = (/charset=([\w-]+)/i.exec(type) || [])[1];
  if (!charset) charset = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString('latin1')) || [])[1];
  try { return new TextDecoder(charset || 'utf-8').decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

/** Open the page (following a few redirects, each one checked again). → { html, finalUrl } */
export async function fetchPage(raw) {
  let url = checkArticleUrl(raw);
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    let r;
    try { r = await getOnce(url); } catch (e) {
      if (e?.code === 'EBLOCKED') throw httpError(400, 'هذا الرابط غير مسموح.');
      throw httpError(422, OPEN_FAIL);
    }
    if (r.redirect) { url = checkArticleUrl(new URL(r.redirect, url).href); continue; }
    if (!r.body || !r.body.length) throw httpError(422, r.status === 403 || r.status === 401 ? 'الموقع منع فتح الصفحة. الصق نص المقال هنا.' : OPEN_FAIL);
    return { html: decodeBody(r.body, r.type), finalUrl: url.href };
  }
  throw httpError(422, OPEN_FAIL);
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©' };
const decode = (s) => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; } })
  .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return ' '; } })
  .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
const plain = (s) => decode(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const blocksOf = (chunk) => {
  const out = [];
  for (const m of chunk.matchAll(/<(p|h1|h2|h3|h4|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const tag = m[1].toLowerCase();
    const s = plain(m[2]);
    const words = s ? s.split(' ').length : 0;
    if (!s) continue;
    if ((tag === 'p' || tag === 'blockquote') && s.length < 25) continue;
    if (tag === 'li' && (s.length < 30 || words < 5)) continue;
    if (/^h/.test(tag) && (s.length < 6 || words < 2)) continue;
    out.push(s);
  }
  return out;
};
const size = (blocks) => blocks.reduce((n, s) => n + s.length, 0);

/** The readable part of an HTML page: { title, text }. */
export function extractArticle(html) {
  let t = String(html || '').replace(/<!--[\s\S]*?-->/g, ' ');
  const meta = (re) => plain((re.exec(t) || [])[1] || '');
  const title = (meta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || meta(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
    || meta(/<title[^>]*>([\s\S]*?)<\/title>/i) || meta(/<h1[^>]*>([\s\S]*?)<\/h1>/i)).slice(0, 200);
  t = t.replace(/<(script|style|noscript|svg|template|iframe|form|nav|header|footer|aside|button|select|figure)\b[\s\S]*?<\/\1>/gi, ' ');
  const longest = (re) => { let best = ''; for (const m of t.matchAll(re)) if (m[1].length > best.length) best = m[1]; return best; };
  let blocks = blocksOf(longest(/<article\b[^>]*>([\s\S]*?)<\/article>/gi));
  if (size(blocks) < 500) { const main = blocksOf(longest(/<main\b[^>]*>([\s\S]*?)<\/main>/gi)); if (size(main) > size(blocks)) blocks = main; }
  if (size(blocks) < 500) { const all = blocksOf(t); if (size(all) > size(blocks)) blocks = all; }
  blocks = blocks.filter((s, i) => s !== blocks[i - 1]);
  let text = blocks.join('\n').slice(0, config.limits.importTextChars);
  const letters = text.match(/\p{L}/gu) || [];
  const latin = text.match(/[A-Za-z]/g) || [];
  if (text.length < 200 || letters.length < 150) throw httpError(422, NO_TEXT);
  if (latin.length / letters.length < 0.6) throw httpError(422, 'هذي الصفحة مو بالإنجليزي. جرّب مقالًا إنجليزيًا.');
  text = text.replace(/[ \t]+/g, ' ');
  return { title, text };
}

/** Open an article address and return its title and text. */
export async function readArticle(raw, { fetcher = fetchPage } = {}) {
  const { html, finalUrl } = await fetcher(raw);
  return { ...extractArticle(html), url: finalUrl };
}
