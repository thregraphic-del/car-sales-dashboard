// 🎯 The single words inside a rule (e.g. «on» inside «حروف جر المكان»): what each one goes with,
// how it is used, and an example — so the rule card can explain the exact word of the line,
// then list the others of the same rule in one line each.
// w(word, goes-with, [uses], [English, Arabic])

const w = (word, withAr, uses, ex) => ({ word, with: withAr, uses, ex });

export const GRAMMAR_ITEMS = {
  prep_time: [
    w('at', 'ساعة محددة، الليل، الويكند، الأعياد', ['وقت دقيق: at 5 o’clock', 'at night · at noon · at the weekend', 'لحظة: at the moment · at the end'], ['The class starts at 9.', 'الحصة تبدأ الساعة ٩.']),
    w('on', 'الأيام والتواريخ', ['يوم: on Monday', 'تاريخ: on 5 May', 'يوم مميز: on my birthday'], ['We meet on Fridays.', 'نتلاقى أيام الجمعة.']),
    w('in', 'الشهور والسنين والفصول وأجزاء اليوم', ['in July · in 2020 · in summer', 'in the morning / evening', 'بعد مدة: in two days = بعد يومين'], ['I was born in 1998.', 'انولدت سنة ١٩٩٨.']),
    w('since', 'بداية الفترة (مع المضارع التام)', ['من نقطة بداية: since 2019 · since Monday'], ['I have lived here since 2019.', 'ساكن هنا من ٢٠١٩.']),
    w('for', 'طول المدة', ['المدة: for two hours · for years'], ['I waited for an hour.', 'انتظرت ساعة.']),
    w('during', 'اسم (حدث أو فترة)', ['خلال فترة: during the meeting'], ['He slept during the film.', 'نام خلال الفيلم.']),
    w('by', 'آخر موعد', ['قبل أو عند: by Friday = قبل الجمعة بالكثير'], ['Finish it by 5.', 'خلّصه قبل الساعة ٥.']),
    w('until', 'نهاية الفترة', ['لين: until 6 · until tomorrow'], ['Wait until I call.', 'انتظر لين أتصل.']),
  ],
  prep_place: [
    w('in', 'مكان مقفول أو له حدود: غرفة، صندوق، مدينة، دولة', ['داخل شي: in the box · in the car', 'مدن ودول: in Riyadh · in Japan', 'in the picture · in the world'], ['The keys are in my bag.', 'المفاتيح في شنطتي.']),
    w('on', 'سطح أو خط: طاولة، جدار، أرض، شاشة، شارع', ['فوق سطح ولامسه: on the table', 'على جدار/شاشة: on the wall · on TV · on the page', 'وسائل نركبها: on the bus · on a plane'], ['The phone is on the table.', 'الجوال على الطاولة.']),
    w('at', 'نقطة أو مكان محدد: عنوان، محل، حدث', ['نقطة: at the door · at the bus stop', 'أماكن نروحها لغرض: at school · at work · at home', 'حدث: at a party'], ['I am at the station.', 'أنا عند المحطة.']),
    w('under', 'شي تحت شي', ['تحت مباشرة: under the bed'], ['The cat is under the chair.', 'القطو تحت الكرسي.']),
    w('next to', 'جنب الشي على طول', ['بجانب: next to the bank'], ['Sit next to me.', 'اجلس جنبي.']),
    w('between', 'شيئين (أو أكثر) على الجانبين', ['بين: between the bank and the café'], ['The shop is between two banks.', 'المحل بين بنكين.']),
    w('behind', 'ورا الشي', ['خلف: behind the door'], ['He hid behind the tree.', 'تخبى ورا الشجرة.']),
    w('in front of', 'قدام الشي', ['أمام: in front of the house'], ['Park in front of the house.', 'وقف قدام البيت.']),
    w('above', 'أعلى من الشي بدون ما يلمسه', ['فوق: above the door'], ['The light is above the table.', 'اللمبة فوق الطاولة.']),
    w('below', 'أوطى من الشي', ['تحت (مستوى): below zero'], ['Sign below the line.', 'وقّع تحت الخط.']),
    w('near', 'قريب (مو لازم ملاصق)', ['قريب من: near my house'], ['I live near the sea.', 'أسكن قريب من البحر.']),
    w('opposite', 'مقابل الشي من الجهة الثانية', ['مقابل: opposite the bank'], ['The café is opposite the park.', 'المقهى مقابل الحديقة.']),
    w('among', 'وسط مجموعة (أكثر من اثنين)', ['بين مجموعة: among friends'], ['She was among the winners.', 'كانت بين الفائزين.']),
    w('inside', 'داخل الشي (أقوى من in)', ['داخل: inside the box'], ['Wait inside.', 'انتظر داخل.']),
    w('outside', 'برا الشي', ['خارج: outside the house', 'مجازي: outside the box = تفكير خارج المألوف'], ['Let’s eat outside.', 'خلنا ناكل برا.']),
    w('on top of', 'فوق الشي بالضبط', ['على قمة: on top of the box'], ['Put it on top of the pile.', 'حطه فوق الكومة.']),
  ],
  prep_movement: [
    w('into', 'دخول لمكان', ['من برا لداخل: into the room'], ['She ran into the house.', 'ركضت داخل البيت.']),
    w('onto', 'حركة لفوق سطح', ['على: onto the stage'], ['He jumped onto the table.', 'نط فوق الطاولة.']),
    w('out of', 'طلوع من مكان', ['من داخل لبرا: out of the car'], ['Get out of the car.', 'انزل من السيارة.']),
    w('through', 'من خلال شي له مدخل ومخرج', ['عبر: through the tunnel · through the door'], ['We drove through the city.', 'سقنا وسط المدينة.']),
    w('across', 'من جهة لجهة', ['قطع: across the road'], ['Walk across the bridge.', 'امشِ على الجسر للجهة الثانية.']),
    w('towards', 'باتجاه الشي', ['نحو: towards the door'], ['He walked towards me.', 'مشى باتجاهي.']),
    w('along', 'على طول خط', ['بمحاذاة: along the beach'], ['We walked along the river.', 'مشينا على طول النهر.']),
    w('up to', 'لين نقطة', ['إلى حد: up to the top'], ['Come up to the front.', 'تعال لين القدام.']),
    w('away from', 'بعيد عن الشي', ['ابتعاد: away from the fire'], ['Stay away from the edge.', 'ابعد عن الحافة.']),
  ],
  can_could: [
    w('can', 'الفعل بدون to', ['القدرة الحين: I can swim', 'الإذن: You can go', 'طلب عادي: Can you help?'], ['I can speak English.', 'أقدر أتكلم إنجليزي.']),
    w('could', 'الفعل بدون to', ['قدرة بالماضي: I could swim at five', 'طلب بأدب: Could you…?', 'احتمال: It could rain'], ['Could you open the door?', 'ممكن تفتح الباب؟']),
  ],
  should: [w('should', 'الفعل بدون to', ['نصيحة: You should sleep', 'توقع: He should be home now'], ['You should try it.', 'المفروض تجربه.'])],
  must_have_to: [
    w('must', 'الفعل بدون to', ['إلزام من المتكلم: I must study', 'استنتاج قوي: He must be tired', "mustn't = ممنوع"], ['You must wear a seatbelt.', 'لازم تلبس الحزام.']),
    w('have to', 'الفعل بعد to (has to مع he/she)', ['إلزام من برا (قانون/شغل)', "don't have to = مو لازم", 'الماضي: had to'], ['I have to work tomorrow.', 'لازم أشتغل بكرة.']),
  ],
  may_might: [
    w('may', 'الفعل بدون to', ['احتمال: It may rain', 'استئذان رسمي: May I…?'], ['May I come in?', 'ممكن أدخل؟']),
    w('might', 'الفعل بدون to', ['احتمال أضعف: I might go'], ['I might be late.', 'يمكن أتأخر.']),
  ],
  would: [w('would', "الفعل بدون to · ’d", ['طلب بأدب: Would you…?', 'رغبة: I would like', 'افتراض: I would buy it if…', 'عادة بالماضي: we would play'], ['I would love to come.', 'ودي أجي.'])],
  shall: [w('shall', 'الفعل بدون to (مع I / we)', ['اقتراح: Shall we go?', 'عرض: Shall I help?'], ['Shall I open the window?', 'أفتح الشباك؟'])],
  a_an: [
    w('a', 'كلمة تبدأ بصوت ساكن', ['a book · a car · a university (صوت يو)'], ['I need a pen.', 'أحتاج قلم.']),
    w('an', 'كلمة تبدأ بصوت متحرك', ['an apple · an idea · an hour (h ما تنطق)'], ['It’s an easy test.', 'اختبار سهل.']),
  ],
  some_any: [
    w('some', 'جمع أو غير معدود', ['الجمل المثبتة: some water', 'العرض والطلب: Would you like some tea?'], ['I bought some apples.', 'شريت شوية تفاح.']),
    w('any', 'جمع أو غير معدود', ['النفي: I don’t have any', 'السؤال: Do you have any…?', 'أي واحد: any time'], ['Do you have any ideas?', 'عندك أي أفكار؟']),
  ],
  much_many: [
    w('much', 'غير المعدود (time, money, water)', ['غالبًا في النفي والسؤال: How much…?', 'too much · so much'], ['I don’t have much time.', 'ما عندي وقت كثير.']),
    w('many', 'الجمع المعدود (people, books)', ['How many…? · too many · so many'], ['Many people came.', 'جا ناس كثير.']),
    w('a lot of', 'الثنين (معدود وغير معدود)', ['أشهرها في الجمل المثبتة'], ['She has a lot of friends.', 'عندها أصدقاء كثير.']),
    w('lots of', 'الثنين', ['مثل a lot of بس أقل رسمية'], ['We had lots of fun.', 'استانسنا مرة.']),
  ],
  few_little: [
    w('a few', 'الجمع المعدود', ['كم واحد (إيجابي): a few friends'], ['I have a few questions.', 'عندي كم سؤال.']),
    w('few', 'الجمع المعدود', ['قليل جدًا (سلبي): few people came'], ['Few people know this.', 'قليل اللي يعرفون هذا.']),
    w('a little', 'غير المعدود', ['شوية (إيجابي): a little water', 'a little bit = شوي'], ['Add a little salt.', 'حط شوية ملح.']),
    w('little', 'غير المعدود', ['قليل جدًا (سلبي): little hope'], ['There is little time.', 'الوقت قليل.']),
  ],
  each_every_all: [
    w('each', 'اسم مفرد', ['كل واحد لحاله (مجموعة صغيرة): each student'], ['Each room has a TV.', 'كل غرفة فيها تلفزيون.']),
    w('every', 'اسم مفرد', ['كل (الكل كمجموعة): every day · every time'], ['I run every morning.', 'أركض كل صباح.']),
    w('all', 'جمع أو غير معدود', ['الكل: all the students · all day'], ['All my friends came.', 'كل أصدقائي جوا.']),
  ],
  demonstratives: [
    w('this', 'مفرد قريب', ['هذا/هذي: this book'], ['This is my car.', 'هذي سيارتي.']),
    w('that', 'مفرد بعيد', ['ذاك/ذيك: that house'], ['Look at that bird.', 'شوف ذاك الطير.']),
    w('these', 'جمع قريب', ['هذولا: these shoes'], ['These are new.', 'هذولا جداد.']),
    w('those', 'جمع بعيد', ['هذوليك: those people'], ['Who are those men?', 'مين هذوليك الرجال؟']),
  ],
  adverb_frequency: [
    w('always', 'قبل الفعل · بعد be', ['دايمًا (100%)'], ['I always drink water.', 'دايم أشرب ماي.']),
    w('usually', 'قبل الفعل · بعد be', ['عادةً (90%)'], ['I usually walk to work.', 'عادة أمشي للدوام.']),
    w('often', 'قبل الفعل · بعد be', ['كثيرًا (70%)'], ['We often eat out.', 'كثير ناكل برا.']),
    w('sometimes', 'أول الجملة أو قبل الفعل', ['أحيانًا (50%)'], ['Sometimes I forget.', 'أحيانًا أنسى.']),
    w('rarely', 'قبل الفعل', ['نادرًا (10%)'], ['He rarely calls.', 'نادرًا يتصل.']),
    w('seldom', 'قبل الفعل', ['نادرًا (رسمي أكثر)'], ['She seldom complains.', 'نادرًا تتشكى.']),
    w('never', 'قبل الفعل (بدون not)', ['أبدًا (0%)'], ['I never smoke.', 'عمري ما دخنت.']),
    w('normally', 'قبل الفعل', ['في العادة'], ['I normally sleep early.', 'عادة أنام بدري.']),
  ],
  adverb_degree: [
    w('very', 'صفة أو ظرف', ['جدًا: very good'], ['It’s very cold.', 'الجو بارد مرة.']),
    w('too', 'صفة (زيادة عن اللازم)', ['زيادة: too hot = حار زيادة (سلبي)', 'too + صفة + to: too tired to walk'], ['It’s too late.', 'تأخر الوقت (زيادة).']),
    w('enough', 'بعد الصفة · قبل الاسم', ['كفاية: big enough · enough money'], ['Are you old enough?', 'عمرك يكفي؟']),
    w('quite', 'صفة', ['نوعًا ما / مرة (حسب السياق)'], ['It’s quite far.', 'بعيد شوي.']),
    w('extremely', 'صفة', ['للغاية'], ['She is extremely smart.', 'ذكية للغاية.']),
    w('pretty', 'صفة (عامية)', ['لحد كبير: pretty good'], ['It was pretty easy.', 'كان سهل مرة.']),
    w('rather', 'صفة', ['نوعًا ما (رسمي)'], ['It’s rather expensive.', 'غالي نوعًا ما.']),
    w('fairly', 'صفة', ['إلى حد ما'], ['I’m fairly sure.', 'متأكد إلى حد ما.']),
    w('completely', 'صفة أو فعل', ['تمامًا'], ['I completely agree.', 'أوافق تمامًا.']),
    w('totally', 'صفة أو فعل', ['كليًا (عامية أكثر)'], ['It’s totally different.', 'مختلف كليًا.']),
  ],
  rel_who: [w('who', 'الأشخاص', ['الشخص اللي…: the man who called'], ['The girl who won is my sister.', 'البنت اللي فازت أختي.'])],
  rel_which_that: [
    w('which', 'الأشياء (وبعد الفاصلة)', ['الشي اللي…: the car which…', 'بعد فاصلة لمعلومة زيادة: , which…'], ['The book, which is old, is mine.', 'الكتاب، وهو قديم، حقي.']),
    w('that', 'الأشياء والأشخاص (بدون فاصلة)', ['اللي…: the film that I saw'], ['This is the phone that I bought.', 'هذا الجوال اللي شريته.']),
  ],
  rel_where_when: [
    w('where', 'مكان', ['المكان اللي…: the city where I live'], ['This is the café where we met.', 'هذا المقهى اللي تلاقينا فيه.']),
    w('when', 'وقت', ['الوقت اللي…: the day when…'], ['I remember the day when I started.', 'أذكر اليوم اللي بديت فيه.']),
  ],
  rel_whose: [w('whose', 'اسم بعدها (الشي المملوك)', ['اللي (ملكه): the man whose car…'], ['I met a girl whose dad is a pilot.', 'قابلت بنت أبوها طيار.'])],
  wh_question: [
    w('what', 'شي', ['وش: What is it?'], ['What do you want?', 'وش تبي؟']),
    w('where', 'مكان', ['وين: Where is it?'], ['Where do you work?', 'وين تشتغل؟']),
    w('when', 'وقت', ['متى'], ['When did you arrive?', 'متى وصلت؟']),
    w('why', 'سبب', ['ليش'], ['Why are you sad?', 'ليش زعلان؟']),
    w('who', 'شخص', ['مين'], ['Who is that?', 'مين هذا؟']),
    w('how', 'طريقة أو حال', ['كيف · How much/many = كم'], ['How did you do it?', 'كيف سويتها؟']),
    w('which', 'اختيار من خيارات', ['أي واحد'], ['Which one do you like?', 'أي واحد يعجبك؟']),
  ],
  never_no: [
    w('never', 'فعل (بدون not)', ['أبدًا'], ['I never lie.', 'عمري ما أكذب.']),
    w('nobody', 'فعل مثبت', ['محد'], ['Nobody came.', 'محد جا.']),
    w('nothing', 'فعل مثبت', ['ولا شي'], ['Nothing happened.', 'ما صار شي.']),
    w('no', 'اسم', ['ما فيه: no time · no money'], ['There is no milk.', 'ما فيه حليب.']),
    w('none', 'بدل الاسم', ['ولا واحد: none of them'], ['None of them knew.', 'ولا واحد منهم يدري.']),
  ],
  coordinating: [
    w('and', 'جملتين أو كلمتين', ['إضافة: و'], ['I ate and slept.', 'أكلت ونمت.']),
    w('but', 'جملتين', ['تضاد: بس / لكن'], ['It’s small but nice.', 'صغير بس حلو.']),
    w('or', 'خيارين', ['أو / ولا'], ['Tea or coffee?', 'شاي ولا قهوة؟']),
    w('so', 'نتيجة', ['فـ / عشان كذا'], ['I was tired, so I slept.', 'كنت تعبان فنمت.']),
  ],
  adv_time: [
    w('when', 'جملة', ['لما'], ['Call me when you land.', 'اتصل لما توصل.']),
    w('while', 'جملة (غالبًا مستمر)', ['وقت ما / بينما'], ['I read while I wait.', 'أقرأ وأنا أنتظر.']),
    w('before', 'جملة أو فعل ing', ['قبل'], ['Wash your hands before you eat.', 'اغسل يدك قبل ما تاكل.']),
    w('after', 'جملة أو فعل ing', ['بعد'], ['We left after the film ended.', 'طلعنا بعد ما خلص الفيلم.']),
    w('until', 'جملة', ['لين'], ['Wait until I come.', 'انتظر لين أجي.']),
    w('as soon as', 'جملة', ['أول ما'], ['Text me as soon as you arrive.', 'أرسلي أول ما توصل.']),
    w('once', 'جملة', ['بمجرد ما'], ['Once you start, you can’t stop.', 'بمجرد ما تبدأ ما تقدر توقف.']),
  ],
  adv_reason: [
    w('because', 'جملة (because of + اسم)', ['لأن'], ['I stayed because it rained.', 'جلست لأنها مطرت.']),
    w('since', 'جملة (أول الجملة غالبًا)', ['بما إن'], ['Since you’re here, help me.', 'بما إنك هنا ساعدني.']),
  ],
  adv_contrast: [
    w('although', 'جملة', ['مع إن'], ['Although it was late, we went.', 'مع إن الوقت متأخر رحنا.']),
    w('even though', 'جملة', ['مع إن (أقوى)'], ['Even though I tried, I failed.', 'مع إني حاولت فشلت.']),
    w('though', 'جملة (أو آخر الجملة: عامية)', ['مع إن / بس'], ['It’s hard. I like it, though.', 'صعب، بس يعجبني.']),
    w('whereas', 'جملة', ['بينما (مقارنة)'], ['I like tea, whereas she likes coffee.', 'أحب الشاي بينما هي تحب القهوة.']),
    w('even if', 'جملة', ['حتى لو'], ['I’ll go even if it rains.', 'بروح حتى لو مطرت.']),
  ],
  reflexive_pronouns: [
    w('myself', 'I', ['نفسي'], ['I did it myself.', 'سويتها بنفسي.']), w('yourself', 'you (مفرد)', ['نفسك'], ['Help yourself.', 'تفضل خذ.']),
    w('himself', 'he', ['نفسه'], ['He hurt himself.', 'أذى نفسه.']), w('herself', 'she', ['نفسها'], ['She taught herself.', 'علمت نفسها.']),
    w('itself', 'it', ['نفسه (للأشياء)'], ['The door closed itself.', 'الباب تسكّر بنفسه.']), w('ourselves', 'we', ['أنفسنا'], ['We enjoyed ourselves.', 'استانسنا.']),
    w('themselves', 'they', ['أنفسهم'], ['They built it themselves.', 'بنوه بأنفسهم.']),
  ],
};

const norm = (s) => String(s || '').replace(/[’‘`]/g, "'").toLowerCase();
const has = (text, word) => new RegExp(`(?:^|[^a-z'])${word.replace(/ /g, '\\s+')}(?![a-z])`).test(text);

/** The exact word of a rule used in a piece of the line (longest first), or null. */
export function itemIn(subId, ...texts) {
  const list = GRAMMAR_ITEMS[subId];
  if (!list) return null;
  const sorted = [...list].sort((a, b) => b.word.length - a.word.length);
  for (const t of texts) {
    const n = norm(t);
    if (!n) continue;
    const hit = sorted.find((it) => has(n, it.word));
    if (hit) return hit;
  }
  return null;
}
