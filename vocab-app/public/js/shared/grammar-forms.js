// 🧩 How each rule is built, as clear formulas read left → right (English order):
//   parts joined by " + ", each part "English|عربي"; ( a / b ) groups the choices for one slot.
// For every rule: ✅ sentence · ❌ negative · ❓ question (when they apply),
// «🔎 كلمات تدل عليها» (signal words) and «⚠️ انتبه» (the usual mistake).
// { f: [pos, neg, q], signs, tip }

const S = 'Subject|الفاعل';
const V = 'verb|الفعل';
const V2 = 'verb-2|التصريف الثاني';
const V3 = 'verb-3|التصريف الثالث';
const ING = 'verb-ing|الفعل+ing';
const REST = '…|باقي الجملة';
const Q = '?|';

export const GRAMMAR_FORMS = {
  // 1 tenses
  present_simple: { f: [`${S} + (verb / verb-s)|الفعل (+s مع he/she/it) + ${REST}`, `${S} + (don't / doesn't)|النفي + ${V} + ${REST}`, `(Do / Does)|السؤال + subject|الفاعل + ${V} + ${Q}`], signs: 'always · usually · often · every day · on Mondays', tip: 'مع he / she / it نضيف s للفعل: she works — وبعد does / doesn\'t يرجع الفعل بدون s.' },
  present_continuous: { f: [`${S} + (am / is / are)|فعل be + ${ING}`, `${S} + (am / is / are) not|النفي + ${ING}`, `(Am / Is / Are)|فعل be + subject|الفاعل + ${ING} + ${Q}`], signs: 'now · right now · at the moment · today · these days · Look!', tip: 'أفعال الشعور والمعرفة (know, like, want, need) ما تجي غالبًا بـ ing: I know (مو I am knowing).' },
  present_perfect: { f: [`${S} + (have / has)|have + ${V3}`, `${S} + (haven't / hasn't)|النفي + ${V3}`, `(Have / Has)|السؤال + subject|الفاعل + ${V3} + ${Q}`], signs: 'already · yet · just · ever · never · so far · recently · since · for', tip: 'ما نستخدمه مع وقت محدد بالماضي: I have seen it yesterday ✗ → I saw it yesterday ✓.' },
  present_perfect_continuous: { f: [`${S} + (have / has)|have + been|been + ${ING}`, `${S} + (haven't / hasn't)|النفي + been|been + ${ING}`, `(Have / Has)|السؤال + subject|الفاعل + been|been + ${ING} + ${Q}`], signs: 'for two hours · since morning · all day · How long…?', tip: 'يركز على مدة الشي وإنه مستمر، والتام البسيط يركز على النتيجة.' },
  past_simple: { f: [`${S} + ${V2} + ${REST}`, `${S} + didn't|النفي + ${V}`, `Did|السؤال + subject|الفاعل + ${V} + ${Q}`], signs: 'yesterday · last week · ago · in 2010 · when I was…', tip: 'بعد did / didn\'t يرجع الفعل لأصله: Did you go? (مو Did you went?).' },
  past_continuous: { f: [`${S} + (was / were)|فعل be ماضي + ${ING}`, `${S} + (wasn't / weren't)|النفي + ${ING}`, `(Was / Were)|السؤال + subject|الفاعل + ${ING} + ${Q}`], signs: 'while · when · at 8 last night · all day yesterday', tip: 'غالبًا معه ماضي بسيط يقطعه: I was cooking when he called.' },
  past_perfect: { f: [`${S} + had|had + ${V3}`, `${S} + hadn't|النفي + ${V3}`, `Had|السؤال + subject|الفاعل + ${V3} + ${Q}`], signs: 'before · after · already · by the time · when', tip: 'نستخدمه للحدث الأقدم من حدثين بالماضي.' },
  past_perfect_continuous: { f: [`${S} + had been|had been + ${ING}`, `${S} + hadn't been|النفي + ${ING}`, `Had|السؤال + subject|الفاعل + been|been + ${ING} + ${Q}`], signs: 'for · since · before · all day', tip: 'مدة شي مستمر لين لحظة بالماضي: I was tired because I had been running.' },
  future_simple: { f: [`${S} + (will / am going to)|المستقبل + ${V}`, `${S} + (won't / am not going to)|النفي + ${V}`, `(Will / Are … going to)|السؤال + subject|الفاعل + ${V} + ${Q}`], signs: 'tomorrow · next week · soon · later · in the future · I think', tip: 'will للقرار اللحظي والتوقع · going to للخطة المسبقة أو شي واضح بيصير.' },
  future_continuous: { f: [`${S} + will be|will be + ${ING}`, `${S} + won't be|النفي + ${ING}`, `Will|السؤال + subject|الفاعل + be|be + ${ING} + ${Q}`], signs: 'this time tomorrow · at 5 tomorrow · all day tomorrow', tip: 'شي بيكون شغّال في لحظة محددة بالمستقبل.' },
  future_perfect: { f: [`${S} + will have|will have + ${V3}`, `${S} + won't have|النفي + ${V3}`, `Will|السؤال + subject|الفاعل + have|have + ${V3} + ${Q}`], signs: 'by Friday · by then · by the time · by 2030', tip: 'غالبًا معه by = قبل أو عند.' },
  future_perfect_continuous: { f: [`${S} + will have been|will have been + ${ING}`, `${S} + won't have been|النفي + ${ING}`, `Will|السؤال + subject|الفاعل + have been|have been + ${ING} + ${Q}`], signs: 'for + مدة · by + وقت', tip: 'قليل الاستخدام — للمدة لين نقطة بالمستقبل.' },
  // 2 auxiliaries
  aux_do: { f: [`${S} + (do / does / did)|للتأكيد + ${V}`, `${S} + (don't / doesn't / didn't)|النفي + ${V}`, `(Do / Does / Did)|السؤال + subject|الفاعل + ${V} + ${Q}`], signs: 'أسئلة ونفي المضارع والماضي البسيط', tip: 'الفعل بعد do / does / did يكون بأصله دايم.' },
  aux_be: { f: [`${S} + (am / is / are / was / were)|be + (verb-ing / verb-3)|ing أو تصريف ثالث`, `${S} + be not|النفي + …|…`, `Be|السؤال + subject|الفاعل + …|… + ${Q}`], signs: 'الأزمنة المستمرة والمبني للمجهول', tip: 'إذا جا بعد be فعل فيه ing فهو مستمر (is going)، وإذا جا تصريف ثالث فهو مجهول (is made).' },
  aux_have: { f: [`${S} + (have / has / had)|have + ${V3}`, `${S} + (haven't / hasn't / hadn't)|النفي + ${V3}`, `(Have / Has / Had)|السؤال + subject|الفاعل + ${V3} + ${Q}`], signs: 'الأزمنة التامة', tip: 'has مع he / she / it فقط.' },
  // 3 modals
  can_could: { f: [`${S} + (can / could)|القدرة + ${V}`, `${S} + (can't / couldn't)|النفي + ${V}`, `(Can / Could)|السؤال + subject|الفاعل + ${V} + ${Q}`], signs: 'able to · ability · permission', tip: 'بعدها الفعل بدون to وبدون s: she can swim (مو she can swims).' },
  should: { f: [`${S} + should|النصيحة + ${V}`, `${S} + shouldn't|النفي + ${V}`, `Should|السؤال + subject|الفاعل + ${V} + ${Q}`], signs: 'advice · I think you should…', tip: 'أخف من must — نصيحة مو إلزام.' },
  must_have_to: { f: [`${S} + (must / have to)|الإلزام + ${V}`, `${S} + (mustn't / don't have to)|ممنوع / مو لازم + ${V}`, `(Do … have to)|السؤال + subject|الفاعل + ${V} + ${Q}`], signs: 'rules · necessary · obligation', tip: 'mustn\'t = ممنوع · don\'t have to = مو لازم (تقدر لو تبي).' },
  may_might: { f: [`${S} + (may / might)|الاحتمال + ${V}`, `${S} + (may not / might not)|النفي + ${V}`, `May|الاستئذان + I|أنا + ${V} + ${Q}`], signs: 'maybe · perhaps · possibly', tip: 'might احتماله أضعف شوي من may.' },
  would: { f: [`${S} + would|would + ${V}`, `${S} + wouldn't|النفي + ${V}`, `Would|السؤال + you|أنت + ${V} + ${Q}`], signs: 'would like · would you…? · if…', tip: 'I\'d = I would أو I had — نعرف من الفعل اللي بعدها.' },
  shall: { f: [`(I / We)|أنا / نحن + shall|shall + ${V}`, `(I / We)|أنا / نحن + shall not|النفي + ${V}`, `Shall|الاقتراح + (I / we)|أنا / نحن + ${V} + ${Q}`], signs: 'Shall we…? · Shall I…?', tip: 'اليوم أكثر شي في الاقتراح والعرض.' },
  // 4 questions
  yes_no_question: { f: [`Auxiliary|فعل مساعد + subject|الفاعل + ${V} + ${REST} + ${Q}`, `Negative aux|مساعد منفي + subject|الفاعل + ${V} + ${Q}`, `(Is / Are / Do / Can …)|المساعد + subject|الفاعل + …|… + ${Q}`], signs: 'الجواب: Yes, I do. / No, I don\'t.', tip: 'نقلب مكان الفاعل والفعل المساعد.' },
  wh_question: { f: [`Wh-word|كلمة السؤال + auxiliary|فعل مساعد + subject|الفاعل + ${V} + ${Q}`, `Wh-word|كلمة السؤال + aux-n't|مساعد منفي + subject|الفاعل + ${V} + ${Q}`, `(What / Where / Why / How …)|كلمة السؤال + (do / does / did)|المساعد + subject|الفاعل + ${V} + ${Q}`], signs: 'what · where · when · why · who · how · which', tip: 'الترتيب: كلمة السؤال ← المساعد ← الفاعل ← الفعل.' },
  subject_question: { f: [`(Who / What)|مين / وش + verb|الفعل مباشرة + ${REST} + ${Q}`, `(Who / What)|مين / وش + (didn't / doesn't)|النفي + ${V} + ${Q}`, `(Who / What)|مين / وش + verb-2|الفعل + ${Q}`], signs: 'Who called? · What happened?', tip: 'لما نسأل عن الفاعل ما نستخدم do: Who called you? (مو Who did call you?).' },
  indirect_question: { f: [`(Do you know / Can you tell me)|بداية مؤدبة + wh-word / if|كلمة السؤال + subject|الفاعل + ${V} + ${Q}`, `I don't know|ما أدري + wh-word|كلمة السؤال + subject|الفاعل + ${V}`, `Could you tell me|ممكن تقولي + where|وين + subject|الفاعل + is|يكون + ${Q}`], signs: 'Do you know… · Can you tell me… · I wonder…', tip: 'بعد كلمة السؤال يرجع الترتيب عادي: where the station is (مو where is the station).' },
  // 5 negation
  not: { f: [`${S} + auxiliary not|مساعد منفي + ${V}`, `${S} + (don't / isn't / can't …)|النفي المختصر + ${V}`, `(Don't / Isn't …)|سؤال منفي + subject|الفاعل + …|… + ${Q}`], signs: "not · n't · cannot", tip: 'نفي واحد يكفي في الجملة: I don\'t know anything (مو nothing).' },
  never_no: { f: [`${S} + never|أبدًا + ${V}`, `(Nobody / Nothing)|محد / ولا شي + verb|فعل مثبت`, `${S} + have|عنده + no|ولا + noun|اسم`], signs: 'never · no · nobody · nothing · none · nowhere', tip: 'هذي كلمات نفي بنفسها، فما نحط معها not: I never go (مو I don\'t never go).' },
  neither_nor: { f: ['Neither|لا + A|الأول + nor|ولا + B|الثاني + verb|الفعل', `${S} + verb|الفعل + neither A nor B|لا هذا ولا ذاك`, ''], signs: 'neither … nor', tip: 'الفعل يتبع أقرب اسم له: Neither he nor they are…' },
  // 6 pronouns
  subject_object_pronouns: { f: ['(I / you / he / she / it / we / they)|ضمير الفاعل + verb|الفعل', 'verb|الفعل + (me / you / him / her / it / us / them)|ضمير المفعول', ''], signs: 'قبل الفعل = فاعل · بعد الفعل أو حرف الجر = مفعول', tip: 'بعد حروف الجر نستخدم ضمير المفعول: with me (مو with I).' },
  possessive_pronouns: { f: ['It is|هو + (mine / yours / his / hers / ours / theirs)|حقي / حقك…', '', 'Is it|هل هو + yours|حقك + ?|'], signs: 'mine · yours · his · hers · ours · theirs', tip: 'ما يجي بعدها اسم: It\'s mine (مو mine book).' },
  reflexive_pronouns: { f: [`${S} + ${V} + (myself / yourself / himself …)|نفسي / نفسك…`, `${S} + don't|النفي + ${V} + yourself|نفسك`, ''], signs: 'myself · yourself · himself · herself · itself · ourselves · themselves', tip: 'by myself = لحالي / بنفسي.' },
  indefinite_pronouns: { f: ['(Someone / Something / Everyone)|أحد / شي / الكل + verb-s|الفعل (مفرد)', `${S} + don't|النفي + ${V} + (anyone / anything)|أحد / شي`, '(Is / Does)|السؤال + (anyone / anything)|أحد / شي + …|… + ?|'], signs: 'some- · any- · every- · no- + one / body / thing', tip: 'everyone مفرد: Everyone is here (مو are).' },
  // 7 articles
  a_an: { f: ['(a / an)|واحد غير محدد + noun|اسم مفرد', '', ''], signs: 'a + صوت ساكن · an + صوت متحرك', tip: 'العبرة بالصوت مو الحرف: an hour · a university.' },
  the: { f: ['the|ال التعريف + noun|اسم معروف', '', ''], signs: 'شي ذكرناه قبل · شي وحيد (the sun) · the best', tip: 'ما نستخدمها مع الكلام العام: I like music (مو the music).' },
  zero_article: { f: ['noun (plural / uncountable)|اسم جمع أو غير معدود + (general meaning)|معنى عام', '', ''], signs: 'اللغات · الوجبات · أسماء المدن · go to school', tip: 'I go to school / work / bed — بدون the.' },
  // 8 plural
  regular_plural: { f: ['noun|الاسم + (-s / -es / -ies)|علامة الجمع', '', ''], signs: 'book → books · box → boxes · city → cities', tip: 'ينتهي بـ s, sh, ch, x, o → نضيف es.' },
  irregular_plural: { f: ['(person → people / child → children / man → men)|جمع شاذ', '', ''], signs: 'people · children · men · women · feet · teeth · mice', tip: 'people جمع: People are… (مو is).' },
  // 9 possessives
  apostrophe_s: { f: ["Owner|المالك + 's|علامة الملكية + thing|الشي", '', "Whose|حق مين + noun|الشي + is it|هو + ?|"], signs: "Sara's · my brother's · the teacher's", tip: "الجمع اللي ينتهي بـ s نحط ' بس: my parents' house." },
  possessive_adjectives: { f: ['(my / your / his / her / its / our / their)|صفة الملكية + noun|اسم', '', ''], signs: 'my · your · his · her · its · our · their', tip: "its (ملكية) غير it's (it is)." },
  of_possessive: { f: ['the|ال + part|الجزء + of|من + the whole|الشي الكامل', '', ''], signs: 'the end of · the name of · the top of', tip: 'غالبًا مع الأشياء والأفكار، و\'s مع الأشخاص.' },
  // 10 prepositions
  prep_time: { f: ['(at / on / in)|حرف جر الزمان + time|الوقت', '', 'What time|الساعة كم + …|… + ?|'], signs: 'at 5 · on Monday · in July · since · for · until · by', tip: 'at للساعة · on لليوم · in للشهر والسنة — من الأصغر للأكبر.' },
  prep_place: { f: ['noun|الشي + (in / on / at / under / next to …)|حرف جر المكان + place|المكان', '', 'Where is|وين + noun|الشي + ?|'], signs: 'in · on · at · under · next to · between · behind · in front of', tip: 'in داخل · on على سطح · at عند نقطة.' },
  prep_movement: { f: ['verb of movement|فعل حركة + (into / out of / through / across …)|اتجاه + place|المكان', '', ''], signs: 'into · out of · through · across · towards · along', tip: 'in = مكان ثابت · into = حركة لداخل.' },
  // 11 adjectives
  ed_ing_adjectives: { f: ['person|الشخص + (is / feels)|يكون + adjective-ed|شعوره', 'thing|الشي + is|يكون + adjective-ing|يسبب الشعور', ''], signs: 'bored/boring · interested/interesting · tired/tiring', tip: 'I am boring = أنا ممل 😅 — اللي تبيه غالبًا I am bored.' },
  adjective_order: { f: ['(a / the)|أداة + opinion|رأي + size|حجم + age|عمر + colour|لون + noun|الاسم', `${S} + (is / looks / feels)|يكون / يبان + adjective|الصفة`, ''], signs: 'a nice big old red car', tip: 'الصفة قبل الاسم بالإنجليزي، وما تنجمع: two big cars (مو bigs).' },
  // 12 adverbs
  adverb_manner: { f: [`${S} + ${V} + adverb-ly|الطريقة`, '', 'How|كيف + (do / did)|المساعد + subject|الفاعل + verb|الفعل + ?|'], signs: 'quickly · slowly · carefully · well · hard · fast', tip: 'good صفة · well ظرف: She sings well.' },
  adverb_frequency: { f: [`${S} + (always / often / never …)|كم مرة + ${V}`, `${S} + be|يكون + (always / often …)|كم مرة + …|…`, 'How often|كم مرة + (do / does)|المساعد + subject|الفاعل + verb|الفعل + ?|'], signs: 'always · usually · often · sometimes · rarely · never', tip: 'مكانها قبل الفعل العادي وبعد be: I always eat · I am always late.' },
  adverb_degree: { f: ['(very / too / quite / extremely)|الدرجة + adjective|صفة', 'adjective|صفة + enough|كفاية', ''], signs: 'very · too · enough · quite · extremely · really', tip: 'too = زيادة (سلبي) · very = مرة · enough بعد الصفة.' },
  // 13 comparison
  comparative: { f: ['A|الأول + is|يكون + (adj-er / more adj)|الصفة بالمقارنة + than|من + B|الثاني', "A|الأول + isn't|ما يكون + (adj-er / more adj)|المقارنة + than|من + B|الثاني", '(Is / Are)|هل + A|الأول + (adj-er / more adj)|المقارنة + than B|من الثاني + ?|'], signs: 'than · -er · more · less · better · worse', tip: 'صفة قصيرة → er (taller) · طويلة → more (more expensive) · good → better.' },
  superlative: { f: ['A|الشي + is|يكون + the|ال + (adj-est / most adj)|التفضيل + (in / of)|في / من + group|المجموعة', "A|الشي + isn't|ما يكون + the (adj-est / most adj)|التفضيل", '(What / Who) is|وش / مين + the (adj-est / most adj)|الأكثر + …|… + ?|'], signs: 'the -est · the most · the best · the worst · ever', tip: 'لازم the قبله: the biggest (مو biggest بس).' },
  equality: { f: ['A|الأول + is|يكون + as|بنفس + adjective|الصفة + as|مثل + B|الثاني', "A|الأول + isn't|ما يكون + (as / so)|بنفس + adjective|الصفة + as|مثل + B|الثاني", 'Is|هل + A|الأول + as|بنفس + adjective|الصفة + as|مثل + B|الثاني + ?|'], signs: 'as … as · not as … as · the same as', tip: 'الصفة بين as و as تكون عادية: as tall as (مو as taller as).' },
  less_than: { f: ['A|الأول + is|يكون + less|أقل + adjective|صفة + than|من + B|الثاني', 'fewer|أقل عددًا + plural noun|جمع + than|من', ''], signs: 'less … than · fewer … than · the least', tip: 'less مع غير المعدود · fewer مع المعدود: fewer people.' },
  // 14 conjunctions
  coordinating: { f: ['Sentence 1|الجملة الأولى + (and / but / or / so)|أداة الربط + Sentence 2|الجملة الثانية', '', ''], signs: 'and · but · or · so · yet', tip: 'and إضافة · but تضاد · or خيار · so نتيجة.' },
  subordinating: { f: ['Main sentence|الجملة الرئيسية + (because / although / if / when)|أداة الربط + sentence|الجملة التابعة', '(Because / Although / If)|أداة الربط + sentence|الجملة التابعة + ,|فاصلة + main sentence|الجملة الرئيسية', ''], signs: 'because · although · if · when · while · unless', tip: 'لو بدأنا بالأداة نحط فاصلة بين الجملتين.' },
  correlative: { f: ['(both … and / either … or / neither … nor / not only … but also)|زوج + A|الأول + B|الثاني', '', ''], signs: 'both … and · either … or · neither … nor', tip: 'الكلمتين لازم يجون مع بعض: both A and B (مو both A or B).' },
  // 15 conditionals
  zero_conditional: { f: ['If|إذا + present simple|مضارع بسيط + ,|فاصلة + present simple|مضارع بسيط', 'If|إذا + subject|الفاعل + (don\'t / doesn\'t)|نفي + …|… + ,|فاصلة + result|النتيجة', 'What happens|وش يصير + if|إذا + present|مضارع + ?|'], signs: 'if · when (حقائق)', tip: 'if هنا = when: النتيجة دايم صحيحة.' },
  first_conditional: { f: ['If|إذا + present simple|مضارع بسيط + ,|فاصلة + will|سوف + verb|الفعل', 'If|إذا + subject|الفاعل + (don\'t / doesn\'t)|نفي + …|… + ,|فاصلة + won\'t|ما راح + verb|الفعل', 'What will you do|وش بتسوي + if|إذا + present|مضارع + ?|'], signs: 'if · unless · as soon as · when (مستقبل)', tip: 'ما نحط will بعد if: If it rains (مو If it will rain).' },
  second_conditional: { f: ['If|لو + past simple|ماضي بسيط + ,|فاصلة + would|كان + verb|الفعل', "If|لو + subject|الفاعل + didn't|نفي ماضي + …|… + ,|فاصلة + wouldn't|ما كان + verb|الفعل", 'What would you do|وش بتسوي + if|لو + past|ماضي + ?|'], signs: 'if I were you · if I had · would', tip: 'مع be نستخدم were للكل: If I were you.' },
  third_conditional: { f: ['If|لو + had|had + verb-3|التصريف الثالث + ,|فاصلة + would have|كان + verb-3|التصريف الثالث', "If|لو + hadn't|نفي + verb-3|التصريف الثالث + ,|فاصلة + wouldn't have|ما كان + verb-3|التصريف الثالث", 'Would you have|كان + verb-3|التصريف الثالث + if|لو + had|had + verb-3|التصريف الثالث + ?|'], signs: 'if … had … would have', tip: 'كله عن الماضي اللي ما صار — ندم أو تخيل.' },
  mixed_conditional: { f: ['If|لو + had|had + verb-3|التصريف الثالث + ,|فاصلة + would|كان + verb|الفعل (الحين)', '', ''], signs: 'now · today (في النتيجة)', tip: 'السبب بالماضي والنتيجة بالحاضر.' },
  // 16 passive
  present_passive: { f: ['Object|الشي + (am / is / are)|فعل be + verb-3|التصريف الثالث + (by …)|بواسطة (اختياري)', "Object|الشي + (isn't / aren't)|النفي + verb-3|التصريف الثالث", '(Is / Are)|السؤال + object|الشي + verb-3|التصريف الثالث + ?|'], signs: 'is made · are sold · is called · by', tip: 'نستخدمه لما الفاعل مو مهم أو مو معروف.' },
  past_passive: { f: ['Object|الشي + (was / were)|be ماضي + verb-3|التصريف الثالث + (by …)|بواسطة', "Object|الشي + (wasn't / weren't)|النفي + verb-3|التصريف الثالث", '(Was / Were)|السؤال + object|الشي + verb-3|التصريف الثالث + ?|'], signs: 'was built · were invited · was born', tip: 'I was born (مو I born).' },
  perfect_passive: { f: ['Object|الشي + (has / have)|have + been|been + verb-3|التصريف الثالث', "Object|الشي + (hasn't / haven't)|النفي + been|been + verb-3|التصريف الثالث", '(Has / Have)|السؤال + object|الشي + been|been + verb-3|التصريف الثالث + ?|'], signs: 'has been done · have been sold', tip: 'been لازم تجي قبل التصريف الثالث.' },
  // 17 verb patterns
  verb_to_infinitive: { f: [`${S} + (want / need / decide …)|الفعل الأول + to|to + verb|الفعل الثاني`, `${S} + (want …)|الفعل + not to|to منفية + verb|الفعل`, ''], signs: 'want · need · decide · hope · plan · learn · would like', tip: 'بعد to الفعل بأصله: I want to go (مو to going).' },
  verb_gerund: { f: [`${S} + (enjoy / finish / avoid …)|الفعل الأول + verb-ing|الفعل الثاني+ing`, `${S} + don't|النفي + enjoy|الفعل + verb-ing|ing`, ''], signs: 'enjoy · finish · avoid · keep · mind · stop · suggest', tip: 'stop doing = يوقف عن الشي · stop to do = يوقف عشان يسويه.' },
  gerund_subject: { f: ['verb-ing|الفعل+ing (الفاعل) + (is / makes …)|الفعل + …|…', 'verb-ing|الفعل+ing + isn\'t|النفي + …|…', 'Is|هل + verb-ing|الفعل+ing + …|… + ?|'], signs: 'Swimming is… · Reading helps…', tip: 'يعامل كمفرد: Reading books is fun.' },
  preposition_gerund: { f: ['(about / of / for / without / before …)|حرف جر + verb-ing|الفعل+ing', '', ''], signs: 'interested in · good at · thanks for · without · before · after', tip: 'بعد حرف الجر الفعل دايم ing: Thanks for coming (مو for come).' },
  // 18 phrasal verbs
  phrasal_separable: { f: [`verb|الفعل + particle|الحرف + object|المفعول`, `verb|الفعل + (it / them)|ضمير + particle|الحرف`, ''], signs: 'turn off · pick up · give up · find out · set up', tip: 'الضمير لازم بالنص: turn it off (مو turn off it).' },
  phrasal_inseparable: { f: [`verb|الفعل + particle|الحرف + object|المفعول`, '', ''], signs: 'look for · look after · get along · come back · grow up', tip: 'ما نفصلهم: look for it (مو look it for).' },
  // 19 determiners
  demonstratives: { f: ['(this / that)|مفرد + singular noun|اسم مفرد', '(these / those)|جمع + plural noun|اسم جمع', ''], signs: 'this · that · these · those', tip: 'قريب: this / these · بعيد: that / those.' },
  some_any: { f: ['some|شوية + noun|اسم (مثبت)', "not … any|ولا + noun|اسم (نفي)", 'any|أي + noun|اسم (سؤال) + ?|'], signs: 'some · any · something · anything', tip: 'في العرض نستخدم some: Would you like some tea?' },
  much_many: { f: ['many|كثير + plural noun|جمع معدود', 'much|كثير + uncountable noun|غير معدود', '(How many / How much)|كم + noun|اسم + ?|'], signs: 'many · much · a lot of · lots of · how many · how much', tip: 'much غالبًا في النفي والسؤال · a lot of في المثبت.' },
  few_little: { f: ['(a few / few)|كم / قليل + plural noun|جمع معدود', '(a little / little)|شوية / قليل + uncountable|غير معدود', ''], signs: 'a few · few · a little · little', tip: 'مع a = إيجابي (يكفي) · بدون a = سلبي (ما يكفي).' },
  each_every_all: { f: ['(each / every)|كل + singular noun|اسم مفرد + verb-s|فعل مفرد', 'all|كل + (the) plural noun|اسم جمع + verb|فعل جمع', ''], signs: 'each · every · all · everyone', tip: 'every day = كل يوم · all day = اليوم كله.' },
  // 20 countable
  countable_nouns: { f: ['(a / an / one)|واحد + noun|اسم مفرد', '(many / a few / two …)|عدد + noun-s|اسم جمع', 'How many|كم + noun-s|جمع + ?|'], signs: 'a · many · a few · how many · numbers', tip: 'المفرد المعدود لازم قبله a / the / my…' },
  uncountable_nouns: { f: ['(much / a little / some)|كمية + noun|اسم بدون جمع', '(a piece of / a cup of)|وحدة + noun|الاسم', 'How much|كم + noun|اسم + ?|'], signs: 'information · advice · money · water · news · furniture', tip: 'ما نقول an advice أو informations — نقول a piece of advice.' },
  // 21 relative
  rel_who: { f: ['person|شخص + who|اللي + verb|الفعل + …|…', '', ''], signs: 'the man who · people who · someone who', tip: 'who للأشخاص · which للأشياء · that للثنين.' },
  rel_which_that: { f: ['thing|شي + (which / that)|اللي + (verb / subject verb)|الجملة', 'thing|شي + ,|فاصلة + which|وهو + …|معلومة زيادة + ,|', ''], signs: 'which · that', tip: 'بعد الفاصلة نستخدم which بس (مو that).' },
  rel_where_when: { f: ['place|مكان + where|اللي فيه + subject|الفاعل + verb|الفعل', 'time|وقت + when|اللي فيه + subject|الفاعل + verb|الفعل', ''], signs: 'the place where · the day when', tip: 'where = in which · when = on/in which.' },
  rel_whose: { f: ['person|شخص + whose|اللي (ملكه) + noun|الشي + verb|الفعل', '', ''], signs: 'whose', tip: "whose (ملكية) غير who's (who is)." },
  // 22 reported
  reported_statement: { f: ['(He said / She told me)|قال + (that)|إن + subject|الفاعل + verb (one step back)|الفعل يرجع زمن لورا', "He said|قال + (that)|إن + subject|الفاعل + didn't|النفي + verb|الفعل", ''], signs: 'said · told · explained · mentioned', tip: 'is → was · will → would · can → could · am going → was going.' },
  reported_question: { f: ['(He asked / She wanted to know)|سأل + (if / whether / wh-word)|إذا / كلمة السؤال + subject|الفاعل + verb|الفعل', '', ''], signs: 'asked if · asked whether · asked where', tip: 'ما فيه علامة سؤال، والترتيب يصير مثل الجملة: He asked where I lived.' },
  reported_command: { f: ['(told / asked)|قال / طلب + person|الشخص + to|to + verb|الفعل', '(told / asked)|قال / طلب + person|الشخص + not to|لا + verb|الفعل', ''], signs: 'told me to · asked us to · advised him to', tip: 'say ما يجي بعده شخص مباشرة — told me (مو said me).' },
  // 23 noun clauses
  that_clause: { f: [`${S} + (think / know / believe)|يعتقد / يعرف + (that)|إن + sentence|جملة`, `${S} + don't think|ما أعتقد + (that)|إن + sentence|جملة`, '(Do you think)|تعتقد + (that)|إن + sentence|جملة + ?|'], signs: 'think that · know that · the fact that · I\'m sure that', tip: 'that غالبًا تنحذف في الكلام: I think you\'re right.' },
  wh_clause: { f: [`${S} + (know / remember / understand)|يعرف + wh-word|كلمة السؤال + subject|الفاعل + verb|الفعل`, `${S} + don't know|ما أدري + wh-word|كلمة السؤال + subject|الفاعل + verb|الفعل`, ''], signs: 'what · how · why · where · when · who', tip: 'الترتيب داخلها مثل الجملة: I know what you mean (مو what do you mean).' },
  if_whether_clause: { f: [`${S} + (wonder / don't know / ask)|يتساءل + (if / whether)|إذا + sentence|جملة`, '', ''], signs: 'if · whether · whether or not', tip: 'whether أرسم شوي، وتجي مع or not.' },
  // 24 adverbial clauses
  adv_time: { f: ['Main sentence|الجملة الرئيسية + (when / while / before / after / until)|متى + sentence|جملة الزمن', '(When / After …)|أداة الزمن + sentence|جملة + ,|فاصلة + main sentence|الجملة الرئيسية', ''], signs: 'when · while · before · after · until · as soon as', tip: 'للمستقبل نستخدم المضارع بعدها: when I arrive (مو when I will arrive).' },
  adv_reason: { f: ['Main sentence|الجملة الرئيسية + (because / since / as)|لأن + sentence|السبب', 'Because of|بسبب + noun|اسم', ''], signs: 'because · since · as · because of · due to', tip: 'بعد because تجي جملة كاملة (because it rained)، وبعد because of يجي اسم بس (because of the rain).' },
  adv_contrast: { f: ['(Although / Even though)|مع إن + sentence|جملة + ,|فاصلة + main sentence|الجملة الرئيسية', '(Despite / In spite of)|رغم + noun / verb-ing|اسم أو ing + ,|فاصلة + main sentence|الجملة', ''], signs: 'although · even though · though · whereas · despite', tip: 'ما نجمع although و but في نفس الجملة.' },
  adv_result: { f: ['so|لدرجة + adjective|صفة + that|إن + result|النتيجة', 'such (a)|كذا + adjective noun|صفة واسم + that|إن + result|النتيجة', ''], signs: 'so … that · such … that', tip: 'بعد so تجي صفة بس (so hot)، وبعد such يجي اسم معه صفة (such a hot day).' },
  // 25 purpose
  to_purpose: { f: ['Sentence|الجملة + to|عشان + verb|الفعل', 'Sentence|الجملة + (in order) not to|عشان ما + verb|الفعل', '(To)|عشان + verb|الفعل (جواب Why?)'], signs: 'to + verb بعد جملة كاملة', tip: 'للغرض نستخدم to مو for قبل الفعل: I came to see you (مو for see).' },
  in_order_to: { f: ['Sentence|الجملة + (in order to / so as to)|عشان + verb|الفعل', 'Sentence|الجملة + (in order not to / so as not to)|عشان ما + verb|الفعل', ''], signs: 'in order to · so as to', tip: 'نفس to بس أرسم.' },
  so_that: { f: ['Sentence|الجملة + so that|عشان + subject|الفاعل + (can / could / will / would)|المساعد + verb|الفعل', "Sentence|الجملة + so that|عشان + subject|الفاعل + (won't / wouldn't)|ما + verb|الفعل", ''], signs: 'so that + فاعل + can / could', tip: 'لما يختلف الفاعل نستخدم so that.' },
  // 26 causative
  have_something_done: { f: [`${S} + (have / has / had)|يخلي + thing|الشي + verb-3|التصريف الثالث`, `${S} + (didn't have)|النفي + thing|الشي + verb-3|التصريف الثالث`, '(Did / Do) you have|هل + thing|الشي + verb-3|التصريف الثالث + ?|'], signs: 'have my hair cut · have the car repaired', tip: 'أنت ما سويته بنفسك — أحد سواه لك.' },
  get_something_done: { f: [`${S} + get|يخلص / يخلي + thing|الشي + verb-3|التصريف الثالث`, `${S} + (didn't get)|النفي + thing|الشي + verb-3|التصريف الثالث`, 'Did you get|هل + thing|الشي + verb-3|التصريف الثالث + ?|'], signs: 'get it done · get it fixed', tip: 'أقل رسمية من have.' },
  make_let: { f: [`${S} + (make / let)|يجبر / يخلي + person|الشخص + verb|الفعل (بدون to)`, `${S} + (doesn't let)|ما يخلي + person|الشخص + verb|الفعل`, 'Will you let|بتخليني + me|أنا + verb|الفعل + ?|'], signs: 'made me · let me know · let him go', tip: 'بعدهم الفعل بدون to: made me laugh (مو to laugh).' },
  // 27 modal passive
  modal_passive_present: { f: ['Object|الشي + (can / should / must / will)|فعل ناقص + be|be + verb-3|التصريف الثالث', "Object|الشي + (can't / shouldn't)|النفي + be|be + verb-3|التصريف الثالث", '(Can / Should)|السؤال + object|الشي + be|be + verb-3|التصريف الثالث + ?|'], signs: 'can be done · must be paid · will be sent', tip: 'بعد الفعل الناقص دايم be بأصلها.' },
  modal_passive_perfect: { f: ['Object|الشي + (should / could / must)|فعل ناقص + have been|have been + verb-3|التصريف الثالث', "Object|الشي + (shouldn't / couldn't)|النفي + have been|have been + verb-3|التصريف الثالث", ''], signs: 'should have been · could have been · must have been', tip: 'عن الماضي: كان المفروض أو يمكن صار.' },
  // 28 question tags
  tag_positive_negative: { f: ["Positive sentence|جملة مثبتة + ,|فاصلة + aux-n't|مساعد منفي + pronoun|ضمير + ?|", '', ''], signs: "isn't it? · don't you? · didn't she?", tip: "I am → aren't I? (استثناء)." },
  tag_negative_positive: { f: ['Negative sentence|جملة منفية + ,|فاصلة + aux|مساعد مثبت + pronoun|ضمير + ?|', '', ''], signs: 'is it? · do you? · did she?', tip: 'الذيل عكس الجملة دايم: مثبت ← منفي · منفي ← مثبت.' },
  // 29 wishes
  wish_present: { f: [`${S} + wish|يتمنى + subject|الفاعل + past simple|ماضي بسيط`, `${S} + wish|يتمنى + subject|الفاعل + (didn't / weren't)|ماضي منفي`, ''], signs: 'I wish I had · I wish I were · I wish I could', tip: 'نستخدم were للكل: I wish I were taller.' },
  wish_past: { f: [`${S} + wish|يتمنى + subject|الفاعل + had|had + verb-3|التصريف الثالث`, `${S} + wish|يتمنى + subject|الفاعل + hadn't|hadn't + verb-3|التصريف الثالث`, ''], signs: "I wish I had… · I wish I hadn't… · I wish I'd…", tip: 'ندم على شي صار خلاص بالماضي.' },
  if_only: { f: ['If only|ياليت + past|ماضي (للحاضر)', 'If only|ياليت + had|had + verb-3|التصريف الثالث (للماضي)', ''], signs: 'if only', tip: 'أقوى من I wish.' },
  hypothetical_other: { f: [`${S} + would rather|يفضل + verb|الفعل`, "It's (high) time|حان الوقت + subject|الفاعل + past|ماضي", `${S} + verb|الفعل + as if|كأن + sentence|جملة`], signs: "would rather · it's time · as if · as though", tip: "بعد would rather يجي الفعل بدون to: I'd rather stay." },
  // 30 inversion
  inv_negative_adverb: { f: ['(Never / Rarely / Seldom)|ظرف نفي + auxiliary|المساعد + subject|الفاعل + verb|الفعل', '', ''], signs: 'Never have I… · Rarely does he… · Hardly ever…', tip: 'أسلوب أدبي للتأكيد — الترتيب يصير مثل السؤال.' },
  inv_not_only: { f: ['Not only|مو بس + auxiliary|المساعد + subject|الفاعل + verb|الفعل + ,|فاصلة + but also|بل بعد + …|…', 'Only then|وقتها بس + auxiliary|المساعد + subject|الفاعل + verb|الفعل', ''], signs: 'Not only … but also · Only then · Only when', tip: 'بعد Not only في أول الجملة نقلب: Not only does she sing…' },
  inv_so_neither: { f: ['So|وأنا بعد + auxiliary|المساعد + subject|الفاعل', 'Neither|ولا أنا + auxiliary|المساعد + subject|الفاعل', ''], signs: 'So do I · So am I · Neither can I · Nor do I', tip: 'المساعد يطابق جملة الشخص الثاني: I can swim → So can I.' },
  inv_conditional: { f: ['Had|لو + subject|الفاعل + verb-3|التصريف الثالث + ,|فاصلة + would have|كان + verb-3|التصريف الثالث', 'Were|لو كان + subject|الفاعل + …|… + ,|فاصلة + would|كان + verb|الفعل', 'Should|لو صار + subject|الفاعل + verb|الفعل + ,|فاصلة + …|…'], signs: 'Had I known · Were I you · Should you need', tip: 'نشيل if ونقدم الفعل المساعد — أسلوب رسمي.' },
};

/** "a|b + c|d" → [{ en, ar }] */
export function parseFormula(s) {
  return String(s || '').split(' + ').map((p) => {
    const [en, ar = ''] = p.split('|');
    return { en: en.trim(), ar: ar.trim() };
  }).filter((x) => x.en);
}

// Rows that are not «جملة / نفي / سؤال» get their own label.
export const FORM_LABELS = {
  neither_nor: [null, '🔁 بعد الفعل'], subject_object_pronouns: ['👤 فاعل', '🎯 مفعول'], demonstratives: ['☝️ مفرد', '✌️ جمع'],
  adjective_order: ['🔤 قبل الاسم', '🔁 بعد الفعل'], adverb_frequency: [null, '🔁 مع be'], adverb_degree: [null, '🔁 enough'],
  ed_ing_adjectives: ['🙂 الشعور (ed)', '🎬 الشي المسبب (ing)'], less_than: [null, '🔢 مع المعدود'], subordinating: [null, '🔁 بالعكس'],
  much_many: ['🔢 معدود', '💧 غير معدود'], few_little: ['🔢 معدود', '💧 غير معدود'], each_every_all: ['☝️ مفرد', '👥 جمع'],
  countable_nouns: ['☝️ مفرد', '👥 جمع'], uncountable_nouns: [null, '📏 وحدة قياس'], rel_which_that: [null, '🔁 بعد فاصلة'],
  rel_where_when: ['📍 مكان', '🕒 وقت'], adv_time: [null, '🔁 بالعكس'], adv_reason: [null, '🔁 مع اسم'], adv_contrast: [null, '🔁 مع اسم'],
  adv_result: ['🔁 so', '🔁 such'], to_purpose: [null, null, '💬 جواب Why?'], hypothetical_other: ['🔁 would rather', "🕒 it's time", '🎭 as if'],
  if_only: ['🕒 عن الحاضر', '⏪ عن الماضي'], inv_not_only: ['🔁 Not only', '🔁 Only then'], inv_so_neither: ['👍 على جملة مثبتة', '👎 على جملة منفية'],
  inv_conditional: ['🔁 Had', '🔁 Were', '🔁 Should'], a_an: ['🔤 الشكل'], the: ['🔤 الشكل'], zero_article: ['🔤 الشكل'], regular_plural: ['🔤 الشكل'],
  irregular_plural: ['🔤 الشكل'], apostrophe_s: [null, null, '❓ سؤال: لمين؟'], possessive_adjectives: ['🔤 الشكل'], of_possessive: ['🔤 الشكل'],
  prep_movement: ['🔤 الشكل'], coordinating: ['🔤 الشكل'], correlative: ['🔤 الشكل'], mixed_conditional: ['🔤 الشكل'],
  rel_who: ['🔤 الشكل'], rel_whose: ['🔤 الشكل'], reported_question: ['🔤 الشكل'], if_whether_clause: ['🔤 الشكل'],
  preposition_gerund: ['🔤 الشكل'], phrasal_separable: [null, '🔁 مع ضمير'], phrasal_inseparable: ['🔤 الشكل'],
  tag_positive_negative: ['🔤 الشكل'], tag_negative_positive: ['🔤 الشكل'], inv_negative_adverb: ['🔤 الشكل'], may_might: [null, null, '🙋 استئذان'],
  modal_passive_perfect: [null, null], wish_present: [null, null], wish_past: [null, null],
};
