// 📚 Channels for learning English, by field. Shipped with the site; each @handle is checked
// once by the server (real link + logo) and a handle YouTube doesn't know is never shown.
// Entry: [name, handle, level, type?] — level 1 سهل · 2 متوسط · 3 صعب. Family-friendly only.
export const FIELDS = [
  { k: 'stories', n: 'قصص', c: [
    ['Storyline Online', 'StorylineOnline', 1, 'قصص أطفال'], ['Little Fox', 'LittleFoxKids', 1, 'قصص للتعلّم'], ['English Singsing', 'EnglishSingsing', 1, 'قصص للتعلّم'],
    ['Dream English Kids', 'DreamEnglishKids', 1, 'قصص أطفال'], ['Peppa Pig', 'PeppaPigOfficial', 1, 'كرتون'], ['Bluey', 'BlueyOfficialChannel', 1, 'كرتون'],
    ['StoryBots', 'StoryBots', 1, 'قصص أطفال'], ['Sesame Street', 'SesameStreet', 1, 'قصص أطفال'], ['Super Simple Songs', 'SuperSimpleSongs', 1, 'أغاني وقصص'],
    ['Pinkfong', 'Pinkfong', 1, 'قصص أطفال'], ['TED-Ed', 'TEDEd', 2, 'قصص وأساطير'], ['Pixar', 'Pixar', 2, 'أفلام قصيرة'],
    ['Disney Animation', 'DisneyAnimation', 2, 'أفلام قصيرة'], ['BBC Learning English', 'bbclearningenglish', 2, 'قصص للتعلّم'], ['VOA Learning English', 'VOALearningEnglish', 2, 'قصص للتعلّم'],
    ['Lingua Marina', 'linguamarina', 2, 'قصص للتعلّم'], ['English Addict', 'duncaninchina', 2, 'حكايات'], ['DUST', 'watchdust', 3, 'أفلام قصيرة'],
    ['Omeleto', 'Omeleto', 3, 'أفلام قصيرة'], ['The Moth', 'TheMoth', 3, 'قصص حقيقية'], ['StoryCorps', 'StoryCorps', 2, 'قصص حقيقية'],
    ['Great Big Story', 'GreatBigStory', 2, 'قصص حقيقية'], ['Business Insider', 'BusinessInsider', 3, 'قصص حقيقية'], ['Kurzgesagt', 'kurzgesagt', 3, 'قصص علمية'],
    ['Pursuit of Wonder', 'PursuitofWonder', 3, 'روايات وفلسفة'], ['Audible', 'audible', 3, 'كتب مسموعة'], ['Crash Course', 'crashcourse', 3, 'قصص التاريخ'],
    ['Simple History', 'SimpleHistory', 2, 'قصص التاريخ'], ['OverSimplified', 'OverSimplified', 3, 'قصص التاريخ'], ['Sprouts', 'SproutsSchools', 2, 'قصص وعبر'],
  ] },
  { k: 'books', n: 'تلخيص كتب', c: [
    ['Productivity Game', 'ProductivityGame', 2], ['The Swedish Investor', 'TheSwedishInvestor', 2], ['FightMediocrity', 'FightMediocrity', 2],
    ['Ali Abdaal', 'aliabdaal', 2], ['Thomas Frank', 'Thomasfrank', 2], ['Matt D\'Avella', 'mattdavella', 2], ['Practical Psychology', 'PracticalPsychology', 1],
    ['Sprouts', 'SproutsSchools', 1], ['Clark Kegley', 'ClarkKegley', 2], ['Einzelgänger', 'Einzelganger', 3], ['Pursuit of Wonder', 'PursuitofWonder', 3],
    ['Academy of Ideas', 'academyofideas', 3], ['The School of Life', 'theschooloflifetv', 3], ['Mark Manson', 'IAmMarkManson', 3], ['TED-Ed', 'TEDEd', 1],
  ] },
  { k: 'talk', n: 'محادثات', c: [
    ['English with Lucy', 'EnglishwithLucy', 2], ['Speak English With Vanessa', 'SpeakEnglishWithVanessa', 2], ['mmmEnglish', 'mmmEnglish', 2],
    ['Rachel\'s English', 'rachelsenglish', 3], ['Bob the Canadian', 'LearnEnglishwithBobtheCanadian', 1], ['EnglishClass101', 'EnglishClass101', 1],
    ['Easy English', 'EasyEnglishVideos', 2], ['Go Natural English', 'GoNaturalEnglish', 2], ['Oxford Online English', 'OxfordOnlineEnglish', 2],
    ['EnglishAnyone', 'EnglishAnyone', 3], ['English Addict with Mr Duncan', 'duncaninchina', 2], ['Learn English with TV Series', 'LearnEnglishWithTVSeries', 3],
    ['BBC Learning English', 'bbclearningenglish', 1], ['Jennifer ESL', 'JenniferESL', 1], ['Interactive English', 'interactiveenglish', 1],
  ] },
  { k: 'beginner', n: 'تأسيس', c: [
    ['BBC Learning English', 'bbclearningenglish', 1], ['VOA Learning English', 'VOALearningEnglish', 1], ['EnglishClass101', 'EnglishClass101', 1],
    ['Bob the Canadian', 'LearnEnglishwithBobtheCanadian', 1], ['engVid', 'engvidenglish', 2], ['Adam\'s English Lessons', 'EnglishLessons4U', 2],
    ['Jennifer ESL', 'JenniferESL', 1], ['Woodward English', 'WoodwardEnglish', 1], ['Super Simple Songs', 'SuperSimpleSongs', 1],
    ['English with Lucy', 'EnglishwithLucy', 2], ['Oxford Online English', 'OxfordOnlineEnglish', 2], ['Rachel\'s English', 'rachelsenglish', 3],
    ['EnglishAnyone', 'EnglishAnyone', 3],
  ] },
  { k: 'science', n: 'علوم', c: [
    ['SciShow Kids', 'SciShowKids', 1], ['Nat Geo Kids', 'NatGeoKids', 1], ['Peekaboo Kidz', 'PeekabooKidz', 1], ['TED-Ed', 'TEDEd', 2],
    ['SciShow', 'SciShow', 2], ['National Geographic', 'NatGeo', 2], ['Mark Rober', 'MarkRober', 2], ['BBC Earth', 'bbcearth', 2],
    ['Kurzgesagt', 'kurzgesagt', 3], ['Veritasium', 'veritasium', 3], ['Vsauce', 'Vsauce', 3], ['MinutePhysics', 'minutephysics', 3],
    ['Smarter Every Day', 'smartereveryday', 3], ['Steve Mould', 'SteveMould', 3], ['Real Engineering', 'RealEngineering', 3],
  ] },
  { k: 'neuro', n: 'علم الأعصاب', c: [
    ['SciShow Kids', 'SciShowKids', 1], ['TED-Ed', 'TEDEd', 1], ['Sprouts', 'SproutsSchools', 1], ['Psych2Go', 'Psych2go', 2],
    ['SciShow Psych', 'SciShowPsych', 2], ['Kurzgesagt', 'kurzgesagt', 2], ['Crash Course', 'crashcourse', 2], ['Andrew Huberman', 'hubermanlab', 3],
    ['Neuro Transmissions', 'NeuroTransmissions', 3], ['Dr Tracey Marks', 'DrTraceyMarks', 3], ['Big Think', 'bigthink', 3], ['Stanford', 'stanford', 3],
  ] },
  { k: 'psych', n: 'علم النفس', c: [
    ['Sprouts', 'SproutsSchools', 1], ['Psych2Go', 'Psych2go', 1], ['TED-Ed', 'TEDEd', 1], ['Practical Psychology', 'PracticalPsychology', 2],
    ['SciShow Psych', 'SciShowPsych', 2], ['The School of Life', 'theschooloflifetv', 2], ['Charisma on Command', 'Charismaoncommand', 2], ['Dr Tracey Marks', 'DrTraceyMarks', 3],
    ['Big Think', 'bigthink', 3], ['Andrew Huberman', 'hubermanlab', 3], ['Academy of Ideas', 'academyofideas', 3], ['Einzelgänger', 'Einzelganger', 3],
  ] },
  { k: 'cartoon', n: 'كرتون', c: [
    ['Peppa Pig', 'PeppaPigOfficial', 1], ['Bluey', 'BlueyOfficialChannel', 1], ['Cocomelon', 'CoComelon', 1], ['Pinkfong', 'Pinkfong', 1],
    ['Numberblocks', 'Numberblocks', 1], ['Sesame Street', 'SesameStreet', 1], ['Pixar', 'Pixar', 2], ['Disney Animation', 'DisneyAnimation', 2],
    ['Shaun the Sheep', 'shaunthesheep', 2], ['DreamWorks', 'DreamWorksTV', 2], ['Cartoon Network', 'cartoonnetwork', 2], ['Mr Bean Cartoon', 'MrBeanCartoonWorld', 2],
    ['Omeleto', 'Omeleto', 3], ['DUST', 'watchdust', 3],
  ] },
  { k: 'comedy', n: 'فكاهة', c: [
    ['Mr Bean', 'MrBean', 1], ['Shaun the Sheep', 'shaunthesheep', 1], ['Just For Laughs Gags', 'JustForLaughsGags', 1], ['Dude Perfect', 'DudePerfect', 2],
    ['The Tonight Show', 'fallontonight', 2], ['The Late Late Show', 'TheLateLateShow', 2], ['Jimmy Kimmel Live', 'JimmyKimmelLive', 3], ['Saturday Night Live', 'SaturdayNightLive', 3],
    ['Studio C', 'StudioC', 2], ['How Ridiculous', 'HowRidiculous', 2], ['Brooklyn Nine-Nine', 'brooklynninenine', 3],
  ] },
  { k: 'vlogs', n: 'فلوقات', c: [
    ['Nas Daily', 'NasDaily', 1], ['Yes Theory', 'YesTheory', 2], ['Drew Binsky', 'drewbinsky', 2], ['Mark Wiens', 'MarkWiens', 2],
    ['Kara and Nate', 'KaraandNate', 2], ['Lost LeBlanc', 'LostLeBlanc', 2], ['Matt D\'Avella', 'mattdavella', 2], ['Casey Neistat', 'casey', 3],
    ['Peter McKinnon', 'PeterMcKinnon', 3], ['Ali Abdaal', 'aliabdaal', 2], ['Dude Perfect', 'DudePerfect', 1], ['Mark Rober', 'MarkRober', 1],
  ] },
  { k: 'tech', n: 'تقنية', c: [
    ['Marques Brownlee', 'mkbhd', 2], ['Unbox Therapy', 'unboxtherapy', 1], ['Linus Tech Tips', 'LinusTechTips', 3], ['Mrwhosetheboss', 'Mrwhosetheboss', 2],
    ['Fireship', 'Fireship', 3], ['Tom Scott', 'TomScottGo', 3], ['Computerphile', 'Computerphile', 3], ['Mark Rober', 'MarkRober', 1],
    ['TED-Ed', 'TEDEd', 1], ['Austin Evans', 'austinevans', 2], ['iJustine', 'ijustine', 1], ['Tech Insider', 'TechInsider', 2],
  ] },
  { k: 'cooking', n: 'طبخ', c: [
    ['Tasty', 'buzzfeedtasty', 1], ['Gordon Ramsay', 'gordonramsay', 2], ['Joshua Weissman', 'JoshuaWeissman', 2], ['Jamie Oliver', 'JamieOliver', 2],
    ['Babish Culinary Universe', 'babishculinaryuniverse', 3], ['Bon Appétit', 'bonappetit', 3], ['Preppy Kitchen', 'PreppyKitchen', 1], ['Food Wishes', 'foodwishes', 2],
    ['Nick DiGiovanni', 'NickDiGiovanni', 1], ['Mark Wiens', 'MarkWiens', 2], ['Ethan Chlebowski', 'EthanChlebowski', 3],
  ] },
  { k: 'sport', n: 'رياضة', c: [
    ['Dude Perfect', 'DudePerfect', 1], ['FIFA', 'FIFA', 1], ['Olympics', 'Olympics', 1], ['NBA', 'NBA', 2], ['Premier League', 'premierleague', 2],
    ['Sky Sports Football', 'SkySportsFootball', 2], ['Athlean-X', 'athleanx', 3], ['Jeff Nippard', 'JeffNippard', 3], ['Tifo Football', 'TifoFootball_', 3],
    ['Chloe Ting', 'ChloeTing', 1], ['Red Bull', 'redbull', 2],
  ] },
  { k: 'history', n: 'تاريخ', c: [
    ['Simple History', 'SimpleHistory', 1], ['TED-Ed', 'TEDEd', 1], ['Kings and Generals', 'KingsandGenerals', 3], ['OverSimplified', 'OverSimplified', 2],
    ['Crash Course', 'crashcourse', 2], ['Extra History', 'ExtraHistory', 2], ['History Matters', 'HistoryMatters', 2], ['Epic History TV', 'EpicHistoryTV', 3],
    ['Historia Civilis', 'HistoriaCivilis', 3], ['Geography Now', 'GeographyNow', 2], ['Kurzgesagt', 'kurzgesagt', 3],
  ] },
  { k: 'health', n: 'صحة', c: [
    ['Chloe Ting', 'ChloeTing', 1], ['Yoga With Adriene', 'yogawithadriene', 1], ['SciShow Kids', 'SciShowKids', 1], ['Doctor Mike', 'DoctorMike', 2],
    ['Jeff Nippard', 'JeffNippard', 3], ['Athlean-X', 'athleanx', 3], ['Andrew Huberman', 'hubermanlab', 3], ['Rich Roll', 'richroll', 3],
    ['TED-Ed', 'TEDEd', 2], ['Psych2Go', 'Psych2go', 2], ['Pick Up Limes', 'PickUpLimes', 2],
  ] },
  { k: 'spirit', n: 'روحانيات وتحفيز', c: [
    ['Goalcast', 'Goalcast', 1], ['Mel Robbins', 'melrobbins', 1], ['Jay Shetty', 'JayShettyPodcast', 2], ['Motivation Madness', 'MotivationMadness', 2],
    ['Fearless Motivation', 'FearlessMotivation', 2], ['Be Inspired', 'BeInspiredChannel', 2], ['Lavendaire', 'Lavendaire', 1], ['Simon Sinek', 'simonsinek', 2],
    ['Eckhart Tolle', 'EckhartTolle', 3], ['Dr. Joe Dispenza', 'DrJoeDispenza', 3], ['Brendon Burchard', 'BrendonBurchard', 2], ['Marisa Peer', 'MarisaPeer', 3],
    ['Mindvalley', 'Mindvalley', 3], ['Headspace', 'headspace', 1], ['Ali Abdaal', 'aliabdaal', 2],
  ] },
  { k: 'speakers', n: 'أشهر المتحدثين', c: [
    ['TED', 'TED', 2], ['TEDx Talks', 'TEDx', 2], ['Mel Robbins', 'melrobbins', 1], ['Simon Sinek', 'simonsinek', 2], ['Tony Robbins', 'TonyRobbinsLive', 3],
    ['Les Brown', 'LesBrownSpeaks', 2], ['Nick Vujicic', 'NickVujicic', 1], ['Brené Brown', 'BreneBrown', 3], ['Eric Thomas', 'etthehiphoppreacher', 2],
    ['Jay Shetty', 'JayShettyPodcast', 2], ['Inky Johnson', 'InkyJohnson', 2], ['Robin Sharma', 'RobinSharma', 2], ['Goalcast', 'Goalcast', 1],
  ] },
  { k: 'podcast', n: 'بودكاست', c: [
    ['The Diary Of A CEO', 'TheDiaryOfACEO', 3], ['Jay Shetty Podcast', 'JayShettyPodcast', 2], ['Huberman Lab', 'hubermanlab', 3], ['The Mel Robbins Podcast', 'melrobbins', 1],
    ['Deep Dive with Ali Abdaal', 'DeepDivewithAliAbdaal', 2], ['Lex Fridman', 'lexfridman', 3], ['Rich Roll', 'richroll', 3], ['Impact Theory', 'ImpactTheory', 3],
    ['BBC Learning English', 'bbclearningenglish', 1], ['Luke\'s English Podcast', 'LukesEnglishPodcast', 2], ['Speak English With Vanessa', 'SpeakEnglishWithVanessa', 1],
    ['The School of Greatness', 'lewishowes', 2], ['TED', 'TED', 2],
  ] },
  { k: 'self', n: 'تطوير الذات', c: [
    ['TED', 'TED', 2], ['Mel Robbins', 'melrobbins', 1], ['Ali Abdaal', 'aliabdaal', 2], ['Psych2Go', 'Psych2go', 1], ['Simon Sinek', 'simonsinek', 2],
    ['Matt D\'Avella', 'mattdavella', 2], ['Thomas Frank', 'Thomasfrank', 2], ['The School of Life', 'theschooloflifetv', 3], ['Lavendaire', 'Lavendaire', 1],
    ['Improvement Pill', 'ImprovementPill', 2], ['Charisma on Command', 'Charismaoncommand', 2], ['Huberman Lab', 'hubermanlab', 3], ['Sprouts', 'SproutsSchools', 1],
  ] },
  { k: 'news', n: 'أخبار', c: [
    ['VOA Learning English', 'VOALearningEnglish', 1], ['BBC Learning English', 'bbclearningenglish', 1], ['Newsround', 'BBCNewsround', 1], ['CNN 10', 'CNN10', 2],
    ['Vox', 'Vox', 3], ['BBC News', 'BBCNews', 3], ['DW News', 'dwnews', 3], ['The Economist', 'TheEconomist', 3], ['TLDR News', 'TLDRnews', 3],
    ['Johnny Harris', 'johnnyharris', 3], ['PBS NewsHour', 'PBSNewsHour', 2], ['Wendover Productions', 'Wendoverproductions', 3],
  ] },
  { k: 'business', n: 'أعمال', c: [
    ['Business English Pod', 'BusinessEnglishPod', 1], ['Ali Abdaal', 'aliabdaal', 2], ['Simon Sinek', 'simonsinek', 2], ['Harvard Business Review', 'harvardbusinessreview', 3],
    ['Y Combinator', 'ycombinator', 3], ['Two Cents', 'TwoCentsPBS', 2], ['CNBC Make It', 'CNBCMakeIt', 2], ['Graham Stephan', 'GrahamStephan', 2],
    ['The Futur', 'thefutur', 2], ['Stanford GSB', 'stanfordgsb', 3], ['Company Man', 'companyman', 2], ['Investopedia', 'Investopedia', 1],
  ] },
  { k: 'kids', n: 'أطفال', c: [
    ['Super Simple Songs', 'SuperSimpleSongs', 1], ['Cocomelon', 'CoComelon', 1], ['Peppa Pig', 'PeppaPigOfficial', 1], ['Bluey', 'BlueyOfficialChannel', 1],
    ['Sesame Street', 'SesameStreet', 1], ['Dream English Kids', 'DreamEnglishKids', 1], ['Pinkfong', 'Pinkfong', 1], ['Storyline Online', 'StorylineOnline', 1],
    ['SciShow Kids', 'SciShowKids', 2], ['Nat Geo Kids', 'NatGeoKids', 2], ['Numberblocks', 'Numberblocks', 2], ['Ms Rachel', 'msrachel', 1],
    ['Blippi', 'Blippi', 1], ['Little Fox', 'LittleFoxKids', 3], ['Peekaboo Kidz', 'PeekabooKidz', 3],
  ] },
  { k: 'travel', n: 'سفر وثقافة', c: [
    ['Nas Daily', 'NasDaily', 1], ['Rick Steves', 'RickSteves', 2], ['Drew Binsky', 'drewbinsky', 2], ['Kara and Nate', 'KaraandNate', 2],
    ['Mark Wiens', 'MarkWiens', 1], ['Lost LeBlanc', 'LostLeBlanc', 2], ['Yes Theory', 'YesTheory', 2], ['Geography Now', 'GeographyNow', 3],
    ['Wendover Productions', 'Wendoverproductions', 3], ['Best Ever Food Review Show', 'BestEverFoodReviewShow', 2], ['Eva zu Beck', 'EvazuBeck', 3],
  ] },
];
