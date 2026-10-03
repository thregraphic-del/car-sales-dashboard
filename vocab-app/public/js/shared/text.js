// Deterministic text utilities shared by the server and the browser.
// Duplicate detection, tokenising and word tiers must never depend on AI.

export const ARABIC_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
export const LATIN_RE = /[A-Za-z]/;

const SLOTS = new Set(['something', 'someone', 'somebody', 'sth', 'sb', 'smth', 'sth.', 'sb.']);
const POSSESSIVE = /\b(?:my|your|his|her|our|their|its|one's)\b/g;

/** Lowercase, unify quotes/dashes/spaces, trim punctuation at the edges. */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '')
    .trim();
}

/**
 * Key used to decide whether two entries are the same vocabulary item.
 * "Figure something out", "figure out", " Figure-out." and "to figure out"
 * all map to "figure out"; "take your time" → "take one's time".
 */
export function matchKey(term) {
  let s = normalize(term).replace(/-/g, ' ');
  s = s.replace(POSSESSIVE, "one's");
  let words = s.split(' ').filter((w) => w && !SLOTS.has(w));
  // "to improve" → "improve", "the deadline" → "deadline" (only for short items)
  if (words.length === 2 && ['to', 'a', 'an', 'the'].includes(words[0])) words = words.slice(1);
  return words.join(' ').replace(/[^a-z0-9' ]/g, '').trim();
}

// Words where a final "s" is not a plural.
const NOT_PLURAL = new Set([
  'news', 'analysis', 'basis', 'crisis', 'thesis', 'hypothesis', 'emphasis', 'diagnosis', 'synthesis', 'business',
  'process', 'progress', 'success', 'access', 'address', 'class', 'glass', 'grass', 'boss', 'loss', 'stress', 'less',
  'unless', 'across', 'always', 'perhaps', 'series', 'species', 'means', 'physics', 'economics', 'mathematics',
  'politics', 'statistics', 'ethics', 'logistics', 'analytics', 'status', 'bonus', 'focus', 'virus', 'campus',
  'census', 'consensus', 'corpus', 'versus', 'bus', 'plus', 'gas', 'yes', 'this', 'his', 'was', 'has', 'is', 'us',
  'thus', 'its', 'whereas', 'nevertheless', 'regardless', 'afterwards', 'towards', 'sometimes', 'nowadays',
  'cosmos', 'chaos', 'canvas', 'atlas', 'alias', 'bias', 'lens', 'tennis', 'kudos', 'mumps', 'aerobics',
]);

/** Possible singular forms of a single English word (for duplicate checks). */
export function singularCandidates(word) {
  const w = normalize(word);
  if (!/^[a-z]+$/.test(w) || w.length < 4 || NOT_PLURAL.has(w)) return [];
  const out = [];
  if (w.endsWith('ies') && w.length > 4) out.push(`${w.slice(0, -3)}y`);
  if (/(ses|xes|zes|ches|shes)$/.test(w)) out.push(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) out.push(w.slice(0, -1));
  return [...new Set(out)];
}

const IRREGULAR = {
  took: 'take', taken: 'take', came: 'come', got: 'get', gotten: 'get', gave: 'give', given: 'give', went: 'go',
  gone: 'go', brought: 'bring', kept: 'keep', made: 'make', ran: 'run', stood: 'stand', broke: 'break',
  broken: 'break', caught: 'catch', dealt: 'deal', thought: 'think', sought: 'seek', found: 'find', felt: 'feel',
  left: 'leave', meant: 'mean', spent: 'spend', built: 'build', taught: 'teach', bought: 'buy', paid: 'pay',
  said: 'say', told: 'tell', knew: 'know', known: 'know', grew: 'grow', grown: 'grow', drew: 'draw', drawn: 'draw',
  chose: 'choose', chosen: 'choose', wrote: 'write', written: 'write', spoke: 'speak', spoken: 'speak',
  began: 'begin', begun: 'begin', led: 'lead', held: 'hold', fell: 'fall', fallen: 'fall', overcame: 'overcome',
  undertook: 'undertake', undertaken: 'undertake', underwent: 'undergo', undergone: 'undergo', arose: 'arise',
  arisen: 'arise', withdrew: 'withdraw', withdrawn: 'withdraw', forgot: 'forget', forgotten: 'forget', men: 'man',
  women: 'woman', children: 'child', people: 'person', data: 'data', criteria: 'criterion', phenomena: 'phenomenon',
  better: 'good', best: 'good', worse: 'bad', worst: 'bad',
};

/**
 * Base-form candidates for an inflected token, most likely first.
 * "decided" → decided, decide, decid; "reliably" → reliably, reliable; "studies" → studies, study.
 */
export function lemmaCandidates(token) {
  const w = normalize(token).replace(/'s$/, '');
  if (!w) return [];
  const out = [w];
  const add = (x) => x && x.length >= 2 && !out.includes(x) && out.push(x);
  if (IRREGULAR[w]) add(IRREGULAR[w]);
  singularCandidates(w).forEach(add);
  if (w.endsWith('ied')) add(`${w.slice(0, -3)}y`);
  if (w.endsWith('ed')) {
    add(w.slice(0, -1)); // decided → decide
    add(w.slice(0, -2)); // worked → work
    if (/([^aeiou])\1ed$/.test(w)) add(w.slice(0, -3)); // stopped → stop
  }
  if (w.endsWith('ing') && w.length > 5) {
    add(w.slice(0, -3)); // working → work
    add(`${w.slice(0, -3)}e`); // making → make
    if (/([^aeiou])\1ing$/.test(w)) add(w.slice(0, -4)); // getting → get
  }
  if (w.endsWith('ably') || w.endsWith('ibly')) add(`${w.slice(0, -1)}e`); // reliably → reliable
  else if (w.endsWith('ily')) add(`${w.slice(0, -3)}y`); // easily → easy
  else if (w.endsWith('ly') && w.length > 4) add(w.slice(0, -2)); // significantly → significant
  if (w.endsWith('er') && w.length > 4) add(w.slice(0, -2));
  if (w.endsWith('est') && w.length > 5) add(w.slice(0, -3));
  return out;
}

/** Split a line into word / non-word tokens, keeping exact characters. */
export function tokenize(line) {
  const out = [];
  const re = /[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*/g;
  let last = 0;
  let m;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), word: false, start: last, end: m.index });
    out.push({ text: m[0], word: true, start: m.index, end: m.index + m[0].length });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), word: false, start: last, end: line.length });
  return out;
}

/* ------------------------------------------------------------ word tiers */

const FUNCTION_LIST = `a an the this that these those my your his her its our their mine yours hers ours theirs i me you he him she it we us they them myself yourself himself herself itself ourselves themselves who whom whose which what where when why how whoever whatever and or but nor so yet for because although though if unless while whereas since as than then also too either neither both not no yes of to in on at by from with without into onto upon about above below over under between among through during before after against along around across behind beyond near off out up down within toward towards via per be is am are was were been being have has had having do does did done doing will would shall should can could may might must ought let 's 're 've 'll 'd n't there here just very really quite rather such some any each every all most more much many few little less least other another same own only even still already ever never always often sometimes else okay ok oh um uh yeah hey well like gonna wanna gotta kind sort lot lots thing things stuff one ones`;

export const FUNCTION_WORDS = new Set(FUNCTION_LIST.split(/\s+/));

// High-frequency A1–A2 words a B1 learner almost certainly knows.
const BASIC_LIST = `able about accept accident across act action activity actor actually add address adult advice afraid after afternoon again age ago agree air airport alive allow almost alone along already alright also always amazing angry animal answer anyone anything anyway anywhere apartment appear apple area arm arrive art article ask asleep attack aunt autumn available average avoid awake away baby back bad bag ball banana band bank bar base basic bath bathroom beach bear beautiful beauty become bed bedroom beer begin beginning believe belong best better big bike bill bird birthday bit black blood blue board boat body book boot bored boring born borrow boss bottle bottom bowl box boy brain bread break breakfast bridge bright bring brother brown build building burn bus business busy butter buy cafe cake call camera camp capital car card care careful carry case cat catch cause centre center century chair chance change cheap check cheese chicken child children chocolate choice choose church cinema city class classroom clean clear clever climb clock close clothes cloud club coat coffee cold collect college colour color come comfortable common company compare complete computer concert condition contain continue control cook cool copy corner correct cost could country couple course cousin cover crazy cream create cross crowd cry culture cup customer cut dad daily damage dance danger dangerous dark date daughter day dead deal dear decide decision deep degree delicious dentist describe desk detail die diet difference different difficult dinner direction dirty discover discuss dish doctor dog dollar door double doubt draw dream dress drink drive driver drop dry during each ear early earn earth easily east easy eat education effect egg either electric else email empty end energy engine enjoy enough enter environment equal error especially evening event ever everybody everyone everything everywhere exactly exam example excellent excited exciting exercise expect expensive experience explain extra eye face fact factory fail fair fall false family famous fan fantastic far farm fashion fast fat father favourite favorite fear feel feeling festival few field fight figure fill film final finally find fine finger finish fire first fish fit fix flat flight floor flower fly follow food foot football forest forget form forward free fresh friend friendly front fruit full fun funny future game garden gas general get gift girl give glad glass go goal gold good government grade grandfather grandmother great green grey gray ground group grow guess guest guitar guy hair half hall hand handle happen happy hard hat hate head health healthy hear heart heat heavy hello help high hill history hit hobby hold holiday home homework hope horse hospital hot hotel hour house however huge human hungry hurry hurt husband ice idea ill image imagine important improve include information inside instead interest interested interesting internet introduce invite island issue item job join joke journey juice jump keep key kid kill kind king kitchen knife know knowledge lake land language large last late later laugh law lazy lead learn leave left leg lesson letter level library lie life light line list listen live local long look lose lost loud love lovely low luck lucky lunch machine magazine main make man manage manager map market marry match matter meal mean meat medicine meet meeting member memory message metal method middle might mile milk mind minute miss mistake mix model modern mom moment money month mood moon morning mother mountain mouse mouth move movie mum museum music name nation natural nature near nearly necessary neck need neighbour neighbor nervous net network new news newspaper next nice night noise noisy none normal north nose note nothing notice now number nurse object ocean offer office officer oil old once online open opinion opposite orange order ordinary organise organize outside page pain paint pair paper parent park part partner party pass past pay peace pen pencil people perfect perhaps period person phone photo photograph physical pick picture piece pink place plan plane plant plastic plate play player please pleased pocket point police polite poor popular position possible post pound power practice practise prefer prepare present president pretty price print prison private prize probably problem produce product program programme project promise proud provide public pull purple push put quality question quick quickly quiet race radio rain raise reach read ready real realise realize reason receive recent recently recipe recommend record red relax remember rent repair repeat reply report rest restaurant result return rich ride right ring rise risk river road rock role room round rule run sad safe salad salary sale salt same sandwich save say scared school science score screen sea season seat second secret see seem sell send sense sentence serious serve service set several shape share sheep shirt shoe shop shopping short shout show shower shut shy sick side sign silver simple sing single sister sit situation size skill skin sky sleep slow slowly small smart smell smile snow social sock soft soldier solution solve somebody someone something sometimes somewhere son song soon sorry sound soup south space speak special speed spell spend sport spring square staff stage stairs stand star start station stay steal step stop store storm story straight strange street strong student study style subject success successful sugar suit summer sun sunny supermarket support sure surprise surprised sweet swim system table take talk tall taste taxi tea teach teacher team technology teenager telephone television tell temperature tennis terrible test text thank theatre theater thin think thirsty though thought throw ticket tidy time tired title today together toilet tomato tomorrow tonight tooth top topic total touch tour tourist town toy traffic train training travel tree trip trouble true trust truth try turn type typical ugly umbrella uncle understand unit university until unusual use useful usual usually vacation vegetable video view village visit visitor voice wait wake walk wall want war warm wash watch water way wear weather website wedding week weekend weight welcome west wet whatever wheel white whole wide wife wild win wind window wine winter wish woman wonder wonderful wood word work worker world worried worry write writer wrong year yellow yesterday young zero`;

export const BASIC_WORDS = new Set(BASIC_LIST.split(/\s+/));

/** Deterministic tier for a single token: function | basic | null (unknown). */
export function quickTier(token) {
  const cands = lemmaCandidates(token);
  if (cands.some((c) => FUNCTION_WORDS.has(c))) return 'function';
  if (cands.some((c) => BASIC_WORDS.has(c))) return 'basic';
  return null;
}

/** Normalised sentence key used to avoid storing the same example twice. */
export function sentenceKey(s) {
  return normalize(s).replace(/[^a-z0-9' ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Normalise Arabic for comparison: no diacritics/tatweel, unified alef/yaa/taa marbuta. */
export function normalizeArabic(s) {
  return String(s ?? '')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-ي\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when one Arabic meaning already covers the other ("متردد" ⊂ "متردد / غير راغب"). */
export function sameArabicMeaning(a, b) {
  const x = normalizeArabic(a);
  const y = normalizeArabic(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Subtitle sync: the line being spoken at time t (seconds) — the last line
 * whose start ≤ t (+ a small lead so text appears as the words begin).
 * lines must be in transcript order; lines without timestamps are skipped.
 */
export function lineAt(lines, t, lead = 0.3) {
  let found = null;
  for (const l of lines) {
    if (l.start_seconds == null) continue;
    if (l.start_seconds <= t + lead) found = l;
    else break;
  }
  return found;
}
