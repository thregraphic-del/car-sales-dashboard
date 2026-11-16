// 🔎 Grammar spotting without AI: patterns on the English line → which of the 30 rules it uses.
// Free and instant; the lines it cannot place are sent once to the AI (and cached for everyone).
// Each hit: { sub, start, end, p } — p = how worth showing (3 advanced … 1 common, 0 never alone).

const PAST = 'went|saw|did|made|came|took|got|gave|knew|thought|told|said|found|felt|left|brought|bought|began|became|ran|wrote|spoke|ate|drank|drove|flew|grew|heard|held|kept|lost|met|paid|sat|sent|sold|spent|stood|taught|understood|won|wore|woke|broke|chose|fell|forgot|meant|led|built|caught|fought|threw|slept|sang|swam|stole|rode|rose|rang|lent|fed|shone|sought|drew|hid|struck|was|were|had|put|cut|let|hit|hurt|set|shut|quit|read';
const PP = 'been|gone|seen|done|made|come|taken|gotten|got|given|known|thought|told|said|found|felt|left|brought|bought|begun|become|run|written|spoken|eaten|drunk|driven|flown|grown|heard|held|kept|lost|met|paid|sat|sent|sold|spent|stood|taught|understood|won|worn|woken|broken|chosen|fallen|forgotten|meant|led|built|caught|fought|thrown|slept|sung|swum|stolen|ridden|risen|rung|lent|fed|shown|drawn|hidden|put|cut|set|let|hit|hurt|read|shut|cost|quit|had';
const NOT_ED = 'need|needed?|feed|speed|seed|bleed|proceed|succeed|exceed|breed|indeed|bed|red|shed|wed|hundred|sacred|naked|wicked|kindred';
const VED = `(?!(?:${NOT_ED})\\b)[a-z]{2,}ed`;
const PPX = `(?:${VED}|${PP})`;
const PASTX = `(?:${VED}|${PAST})`;
const ING = '(?!(?:some|no|any|every)?thing\\b|during\\b|morning\\b|evening\\b|building\\b|king\\b|ring\\b|spring\\b|ceiling\\b|wing\\b)[a-z]{2,}ing';
const G = '(?:\\s+(?:not|never|just|already|always|also|really|still|ever|even|actually|probably|definitely|finally|only|all|both))?\\s+';
const SUBJ = '(?:i|you|he|she|it|we|they|people|everyone|everybody|someone|somebody)';
// -ed words that are feelings/states (adjectives), not passives
const ADJ_ED = 'interested|excited|bored|tired|married|scared|surprised|worried|confused|amazed|pleased|satisfied|disappointed|embarrassed|frightened|annoyed|relaxed|stressed|shocked|exhausted|involved|supposed|used|based|located|related|concerned|prepared|determined|qualified|allowed|born|called|named';
const VERBS = 'know|think|want|need|like|love|have|go|make|get|see|say|mean|feel|look|work|live|believe|use|try|take|come|give|find|tell|ask|seem|help|play|start|keep|understand|remember|hope|learn|talk|speak|eat|read|write|watch|hear|agree|lose|win|become|leave|call|move|pay|run|walk|depend|matter|happen|care|guess|forget|teach|study|buy|sell|send|spend|build|create|change|show|bring|hold|put|let|begin|feel';
const VERB_S = VERBS.split('|').map((v) => (/(s|sh|ch|x|o)$/.test(v) ? `${v}es` : /[^aeiou]y$/.test(v) ? `${v.slice(0, -1)}ies` : v === 'have' ? 'has' : `${v}s`)).join('|');

// Phrasal verbs: [base forms, particle, separable?]
const PV = [
  ['give|gives|gave|giving|given', 'up', 1], ['give|gives|gave|giving|given', 'back', 1], ['turn|turns|turned|turning', 'down', 1], ['turn|turns|turned|turning', 'on', 1], ['turn|turns|turned|turning', 'off', 1],
  ['pick|picks|picked|picking', 'up', 1], ['set|sets|setting', 'up', 1], ['find|finds|found|finding', 'out', 1], ['figure|figures|figured|figuring', 'out', 1],
  ['point|points|pointed|pointing', 'out', 1], ['put|puts|putting', 'off', 1], ['put|puts|putting', 'on', 1], ['bring|brings|brought|bringing', 'up', 1], ['make|makes|made|making', 'up', 1],
  ['work|works|worked|working', 'out', 1], ['carry|carries|carried|carrying', 'out', 1], ['look|looks|looked|looking', 'up', 1], ['call|calls|called|calling', 'off', 1],
  ['throw|throws|threw|thrown|throwing', 'away', 1], ['fill|fills|filled|filling', 'out', 1], ['write|writes|wrote|written|writing', 'down', 1], ['take|takes|took|taken|taking', 'over', 1],
  ['check|checks|checked|checking', 'out', 1], ['try|tries|tried|trying', 'out', 1], ['shut|shuts|shutting', 'down', 1],
  ['look|looks|looked|looking', 'for', 0], ['look|looks|looked|looking', 'after', 0], ['come|comes|came|coming', 'across', 0], ['get|gets|got|getting', 'along', 0],
  ['run|runs|ran|running', 'into', 0], ['go|goes|went|going|gone', 'on', 0], ['come|comes|came|coming', 'up with', 0], ['get|gets|got|getting', 'over', 0], ['look|looks|looked|looking', 'forward to', 0],
  ['carry|carries|carried|carrying', 'on', 0], ['show|shows|showed|showing', 'up', 0], ['end|ends|ended|ending', 'up', 0], ['grow|grows|grew|grown|growing', 'up', 0],
  ['wake|wakes|woke|woken|waking', 'up', 0], ['run|runs|ran|running', 'out of', 0], ['go|goes|went|going|gone', 'back', 0], ['come|comes|came|coming', 'back', 0],
  ['sit|sits|sat|sitting', 'down', 0], ['stand|stands|stood|standing', 'up', 0], ['hang|hangs|hung|hanging', 'out', 0], ['break|breaks|broke|broken|breaking', 'down', 0],
  ['get|gets|got|getting', 'up', 0], ['get|gets|got|getting', 'back', 0], ['get|gets|got|getting', 'rid of', 0], ['catch|catches|caught|catching', 'up', 0], ['give|gives|gave|giving|given', 'in', 0],
];

const UNCOUNT = 'information|advice|money|furniture|knowledge|news|research|evidence|equipment|homework|traffic|luggage|baggage|music|water|weather|software|feedback|progress|happiness|electricity|rice|bread|sugar|work|fun';
const NOT_EST = 'rest|test|west|interest|request|guest|chest|forest|nest|contest|protest|honest|best|least|most|east|quest|vest|pest|crest|harvest|invest|suggest|digest|arrest|latest';
const NEG_TAG = "isn't|aren't|wasn't|weren't|don't|doesn't|didn't|won't|can't|couldn't|wouldn't|shouldn't|haven't|hasn't|hadn't";
const POS_TAG = 'is|are|was|were|do|does|did|will|can|could|would|should|have|has|had|am';
const TAG_PRON = 'it|you|he|she|they|we|i|there|that';
const AUXQ = 'do|does|did|is|are|was|were|can|could|will|would|should|have|has|am';

// [sub-rule, pattern, p] — order matters inside a family: the more specific pattern first.
const R = (sub, src, p, flags = 'gi') => ({ sub, re: new RegExp(src, flags), p });
const RULES = [
  // 30 inversion
  R('inv_negative_adverb', `^\\s*(?:never|rarely|seldom|hardly|scarcely|barely|little|at no time|under no circumstances|in no way|nowhere)\\s+(?:${AUXQ})\\s+(?:i|you|he|she|it|we|they|the|this|anyone)\\b`, 3),
  R('inv_not_only', `\\bnot only\\s+(?:${AUXQ})\\s+(?:i|you|he|she|it|we|they|the|this)\\b|^\\s*only\\s+(?:then|when|after|if|by|now|later|once|in)\\b.*?\\b(?:${AUXQ})\\s+(?:i|you|he|she|we|they)\\b`, 3),
  R('inv_so_neither', `^\\s*(?:and\\s+)?(?:so|neither|nor)\\s+(?:${AUXQ})\\s+(?:i|you|he|she|it|we|they)\\b(?!\\s+\\w)`, 3),
  R('inv_conditional', '^\\s*(?:had|were|should)\\s+(?:i|you|he|she|it|we|they)\\s+(?!\\w+\\s*\\?)\\w+(?!.*\\?\\s*$)', 3),
  // 29 wishes
  R('wish_past', `\\bwish(?:es|ed)?\\s+(?:that\\s+)?(?:i|you|he|she|it|we|they)(?:\\s+had|'d)(?:\\s+(?:not|never|just|already))?\\s+${PPX}\\b|\\bwish(?:es|ed)?\\s+(?:i|you|he|she|it|we|they)\\s+hadn't\\b`, 3),
  R('wish_present', `\\bwish(?:es|ed)?\\s+(?:that\\s+)?(?:i|you|he|she|it|we|they)\\s+(?:were|was|had|could|would|knew|lived|didn't|weren't|wasn't|couldn't|${VED})\\b`, 3),
  R('if_only', '\\bif only\\b', 3),
  R('hypothetical_other', "\\b(?:would|'d) rather\\b|\\bit'?s (?:high |about )?time\\s+(?:i|you|we|they|he|she)\\b|\\bas if\\b|\\bas though\\b", 3),
  // 28 question tags
  R('tag_positive_negative', `(?:^|,)\\s*(?:${NEG_TAG})\\s+(?:${TAG_PRON})\\s*\\??\\s*$`, 3),
  R('tag_negative_positive', `,\\s*(?:${POS_TAG})\\s+(?:${TAG_PRON})\\s*\\?\\s*$`, 3),
  // 27 modal passive
  R('modal_passive_perfect', `\\b(?:could|should|must|may|might|would)(?:n't)?(?:\\s+not)?\\s+have\\s+been\\s+${PPX}\\b`, 3),
  R('modal_passive_present', `(?:\\b(?:can|could|should|must|may|might|will|would|won't|can't|cannot|shouldn't|mustn't|couldn't|wouldn't)|'ll)(?:\\s+not)?(?:\\s+\\w+ly)?\\s+be\\s+(?!(?:${ADJ_ED})\\b)${PPX}\\b`, 3),
  // 26 causative
  R('have_something_done', `\\b(?:have|has|had|having)\\s+(?:my|your|his|her|our|their|the|a|an|it|them|this|that)\\s+(?:\\w+\\s+)?(?!been\\b)${PPX}\\b`, 3),
  R('get_something_done', `\\b(?:get|gets|got|getting)\\s+(?:my|your|his|her|our|their|the|a|an|it|them|this|that|things)\\s+(?:\\w+\\s+)?(?!been\\b)(?:done|fixed|repaired|cut|cleaned|checked|finished|sorted|approved|delivered|paid|printed|signed|${VED})\\b`, 3),
  R('make_let', '\\b(?:make|makes|made|making|let|lets|letting)\\s+(?:me|you|him|her|us|them|it|people|everyone|someone|others)\\s+(?!to\\b|go\\b(?!\\s))[a-z]+', 3),
  // 25 purpose
  R('in_order_to', '\\bin order (?:not )?to\\b|\\bso as (?:not )?to\\b', 3),
  R('so_that', '\\bso that\\b', 3),
  R('to_purpose', '\\b(?:use|used|uses|using)\\s+(?:\\w+\\s+){1,3}?to\\s+(?!be\\b)[a-z]+|\\b(?:went|go|goes|came|come|called|calling|stopped|saved|save)\\s+(?:\\w+\\s+){0,2}?to\\s+(?:see|buy|get|ask|tell|find|learn|help|meet|visit|check|make|say|study|talk|pick|bring|watch)\\b', 3),
  // 22 reported speech (before noun clauses)
  R('reported_command', '\\b(?:told|asked|ordered|advised|warned|reminded|begged)\\s+(?:me|him|her|us|them|you|everyone|\\w+)\\s+(?:not\\s+)?to\\s+[a-z]+', 3),
  R('reported_question', '\\basked\\s+(?:\\w+\\s+)?(?:if|whether|what|where|when|why|how|who)\\b', 3),
  R('reported_statement', `\\b(?:said|says|told\\s+(?:me|him|her|us|them|you)|explained|mentioned|claimed|admitted|replied|announced|promised)\\s+(?:that\\b|${SUBJ}\\s+(?:was|were|had|would|could|did|is|will|'d|didn't|wasn't|wouldn't))`, 3),
  // 23 noun clauses
  R('if_whether_clause', "\\b(?:know|knew|wonder|wondering|wondered|decide|see|check|sure|doubt|tell)\\s+(?:if|whether)\\b|\\bwhether\\s+or\\s+not\\b", 3),
  R('that_clause', '\\b(?:think|thought|believe|believed|know|knew|realize|realized|realise|realised|hope|feel|felt|guess|suppose|understand|mean|means|admit|show|shows|showed|prove|proves|find|found|notice|noticed|sure|true|clear|fact|seems|seemed|means|is|was)\\s+that\\s+(?:i|you|he|she|it|we|they|the|this|there|people|everyone|nobody|someone|our|my|your|their)\\b', 3),
  R('wh_clause', `\\b(?:know|knew|understand|understood|remember|wonder|tell|explain|see|show|decide|imagine|learn|figure out|find out|care|matter|realize|realise|forget|forgot)s?\\s+(?:what|how|why|where|when|who|which)\\s+(?!(?:${AUXQ})\\s+(?:i|you|he|she|it|we|they)\\b)|^\\s*what\\s+(?:i|you|we|they|he|she|people)\\s+\\w+\\s+(?:is|was)\\b`, 3),
  // 21 relative clauses
  R('rel_whose', '\\b[a-z]+\\s+whose\\s+[a-z]+', 3),
  R('rel_where_when', '\\b(?:place|places|city|country|house|home|room|world|area|town|time|day|year|moment|days|point|period|age|era)\\s+(?:where|when)\\s+(?!(?:do|does|did)\\b)', 3),
  R('rel_who', '\\b(?:the|a|an|those|people|someone|anyone|everyone|somebody|anybody|person|one|man|woman|guy|friend|friends|students|kids|children|customers|users|ones)\\b(?:\\s+[a-z]+){0,2}\\s+who\\s+(?!(?:is|are|am)\\s*\\?)', 3),
  R('rel_which_that', '\\b(?:the|a|an|something|anything|everything|nothing|thing|things|one|stuff|ones|ideas?|way|ways)\\b(?:\\s+[a-z]+){0,2}\\s+(?:which|that)\\s+(?:is|are|was|were|has|have|had|can|could|will|would|i|you|we|they|he|she|makes|made|helps|keeps|gives|people)\\b|,\\s*which\\b', 3),
  // 15 conditionals (third/mixed before second before first before zero)
  R('third_conditional', `\\bif\\b.*?\\b(?:had|'d)(?:\\s+not|n't)?\\s+${PPX}\\b.*?\\b(?:would|could|might)(?:n't)?\\s+have\\b|\\bif\\b.*?\\bhad(?:n't)?\\s+${PPX}\\b|\\b(?:would|could|might)(?:n't)?\\s+have\\s+${PPX}\\b.*?\\bif\\b.*?\\bhad\\b`, 3),
  R('mixed_conditional', `\\bif\\b.*?\\bhad(?:n't)?\\s+${PPX}\\b.*?\\b(?:would|could|might)(?:n't)?\\s+(?!have\\b)[a-z]+\\s+(?:now|today)\\b`, 3),
  R('second_conditional', `\\bif\\s+(?:i|you|he|she|it|we|they)\\s+were\\b|\\bif\\b.*?\\b(?:${PASTX}|didn't|couldn't)\\b.*?\\b(?:would|could|might|'d)(?:n't)?\\s+(?!have\\b)[a-z]+|\\b(?:would|'d)(?:n't)?\\s+(?!have\\b|like\\b|love\\b|rather\\b)[a-z]+\\b.*?\\bif\\b.*?\\b(?:${PASTX}|were)\\b`, 3),
  R('first_conditional', `\\b(?:if|unless)\\b.*?(?:\\bwill\\b|'ll\\b|\\bwon't\\b|\\bgoing to\\b|\\bgonna\\b)|(?:\\bwill\\b|'ll\\b|\\bwon't\\b)\\s+[a-z]+\\b.*?\\b(?:if|unless)\\s+${SUBJ}\\s+(?!(?:would|could|had)\\b)[a-z]+`, 3),
  R('zero_conditional', `\\b(?:if|when)\\s+(?:you|we|they|people|it|i|water)\\s+(?!(?:would|could|had|were|was|did|will)\\b)[a-z]+\\s*,?\\s*(?:you|we|they|it|people|i)\\s+(?!(?:will|would|'ll)\\b)[a-z]+`, 3),
  // 16 passive (perfect first)
  R('perfect_passive', `\\b(?:have|has|had)(?:n't)?(?:\\s+(?:not|never|just|already|recently))?\\s+been\\s+(?!(?:${ADJ_ED})\\b)${PPX}\\b`, 3),
  R('past_passive', `\\b(?:was|were)(?:n't)?(?:\\s+(?:not|never|also|just|being))*\\s+(?!(?:${ADJ_ED}|going|${ING})\\b)${PPX}\\b`, 3),
  R('present_passive', `\\b(?:am|is|are|'m|'re)(?:n't)?(?:\\s+(?:not|never|also|being|often|usually|always))*\\s+(?!(?:${ADJ_ED})\\b)${PPX}\\b`, 3),
  // 13 comparison
  R('equality', '\\bas\\s+(?:much\\s+|many\\s+)?[a-z]+(?:ly)?\\s+as\\b(?!\\s+(?:well|soon|long|far|if|though)\\b)', 3),
  R('less_than', '\\b(?:less|fewer)\\s+(?:[a-z]+\\s+)?than\\b', 3),
  R('superlative', `\\bthe\\s+(?:most|least)\\s+[a-z]+|\\bthe\\s+(?:best|worst)\\b|\\bthe\\s+(?!(?:${NOT_EST})\\b)[a-z]{2,}est\\b|\\b(?:my|your|his|her|our|their)\\s+(?:best|worst|biggest|greatest)\\b`, 3),
  R('comparative', '\\bmore\\s+[a-z]+\\s+than\\b|\\b[a-z]+er\\s+than\\b|\\b(?:better|worse|more|less)\\s+than\\b|\\b(?:better|worse|bigger|smaller|faster|easier|harder|higher|lower|older|younger|stronger|longer|shorter|cheaper|richer|greater|larger|happier|healthier|smarter|closer|further|farther)\\b', 3),
  // 1 tenses (most specific first)
  R('future_perfect_continuous', `(?:\\bwill|\\bwon't|'ll)${G}have\\s+been\\s+${ING}\\b`, 2),
  R('future_perfect', `(?:\\bwill|\\bwon't|'ll)${G}have\\s+${PPX}\\b`, 2),
  R('future_continuous', `(?:\\bwill|\\bwon't|'ll)${G}be\\s+${ING}\\b`, 2),
  R('past_perfect_continuous', `(?:\\bhad|\\bhadn't|'d)${G}been\\s+${ING}\\b`, 2),
  R('present_perfect_continuous', `(?:\\bhave|\\bhas|'ve|\\bhaven't|\\bhasn't)${G}been\\s+${ING}\\b`, 2),
  R('past_perfect', `(?:\\bhad|\\bhadn't)${G}(?!to\\b|been\\b)${PPX}\\b|(?<=\\b(?:i|you|he|she|we|they))'d${G}(?:${VED}|been|gone|seen|done|known|had|got|made|taken|given|told|found|left|heard|thought)\\b`, 2),
  R('present_perfect', `(?<!(?:could|should|would|must|might|may|will|'ll|won't|to)\\s)(?:\\bhave|\\bhas|'ve|\\bhaven't|\\bhasn't)${G}(?!to\\b|got\\s+to\\b)${PPX}\\b|(?<=\\b(?:he|she|it|that|there))'s\\s+(?:been|got|gone|done|had|made|seen)\\b`, 2),
  R('past_continuous', `\\b(?:was|were)(?:n't)?${G}${ING}\\b`, 2),
  R('future_simple', `\\b(?:am|is|are|'m|'re|'s)(?:n't)?${G}(?:going to|gonna)\\s+[a-z]+|(?:\\bwill|\\bwon't|'ll)${G}(?!have\\b|be\\s+[a-z]+ing\\b)[a-z]+`, 2),
  R('present_continuous', `(?:\\b(?:am|is|are)(?:n't)?|'m|'re|(?<=\\b(?:he|she|it|that|what|who|there))'s)${G}(?!going\\s+to\\b)${ING}\\b`, 2),
  R('past_simple', `\\bdid(?:n't)?(?:\\s+not)?\\s+(?:${SUBJ}\\s+)?[a-z]+|\\b${SUBJ}(?:\\s+(?:just|really|never|also|actually|finally|even|then|once|first|only|already|suddenly))?\\s+(?:${PASTX})\\b(?!\\s+to\\s)`, 2),
  R('present_simple', `\\b(?:do|does|don't|doesn't)\\b|\\b(?:i|you|we|they)(?:\\s+(?:always|usually|often|sometimes|never|really|just|also|still|actually))?\\s+(?:${VERBS})\\b|\\b(?:he|she|it)(?:\\s+(?:always|usually|often|sometimes|never|really|just|also|still|actually))?\\s+(?:${VERB_S})\\b`, 2),
  // 3 modals
  R('can_could', "\\b(?:can|could|can't|cannot|couldn't)\\b", 2),
  R('should', "\\bshould(?:n't)?\\b", 2),
  R('must_have_to', "\\b(?:must|mustn't)\\b|\\b(?:have|has|had|having)\\s+(?:got\\s+)?to\\s+[a-z]+|\\bgotta\\b", 2),
  R('may_might', "\\b(?:may|might|mightn't)\\b", 2),
  R('would', "\\bwould(?:n't)?\\b|'d\\s+(?:like|love|rather|prefer|say|be|go|do|have)\\b", 2),
  R('shall', '\\bshall\\b', 2),
  // 4 questions
  R('indirect_question', '\\b(?:can|could)\\s+you\\s+tell\\s+me\\s+(?:what|where|how|when|why|if|who|whether)\\b|\\bdo\\s+you\\s+know\\s+(?:what|where|how|when|why|if|who|whether)\\b|\\bi\\s+wonder\\s+(?:what|where|how|when|why|who)\\b', 3),
  R('subject_question', '^\\s*(?:who|what)\\s+(?:happened|happens|made|makes|caused|causes|called|wants|knows|came|said|did\\s+(?:it|this|that))\\b', 2),
  R('wh_question', `^\\s*(?:what|where|when|why|who|how|which|whose)(?:\\s+[a-z]+){0,2}\\s+(?:${AUXQ}|'s|'re)\\s+(?:i|you|he|she|it|we|they|the|this|that|there|your|my|people)\\b|^\\s*(?:what|where|when|why|who|how|which)\\b.*\\?\\s*$`, 2),
  R('yes_no_question', `^\\s*(?:${AUXQ}|isn't|aren't|don't|doesn't|didn't|can't|won't)\\s+(?:i|you|he|she|it|we|they|there|this|that|the|your|my|anyone|anybody)\\b`, 2),
  // 17 infinitives & gerunds
  R('gerund_subject', `^\\s*${ING}\\s+(?:[a-z]+\\s+){0,2}?(?:is|was|can|will|makes|made|helps|takes|gives|means|isn't|wasn't)\\b`, 2),
  R('preposition_gerund', `\\b(?:about|of|for|without|before|after|by|instead of|at|from|into|on|in)\\s+${ING}\\b`, 2),
  R('verb_gerund', `\\b(?:enjoy|enjoys|enjoyed|finish|finished|avoid|avoided|avoids|keep|keeps|kept|mind|stop|stopped|stops|consider|considered|suggest|suggested|practice|practise|miss|missed|imagine|recommend|quit|can't help|spend|spent|spends|started|start|starts|began|love|loves|like|likes|hate|hates|feel like|risk|deny|admit)\\s+${ING}\\b`, 2),
  R('verb_to_infinitive', '\\b(?:want|wants|wanted|need|needs|needed|decide|decided|hope|hoped|hopes|plan|planned|plans|try|tried|tries|trying|learn|learned|learnt|agree|agreed|would like|\'d like|promise|promised|refuse|refused|seem|seems|seemed|choose|chose|manage|managed|forget|forgot|expect|expected|offer|offered|deserve|afford|wanna|ready|able|happy|easy|hard|difficult|important)\\s+(?:not\\s+)?to\\s+(?!the\\b|a\\b|my\\b|your\\b|me\\b|you\\b|him\\b|her\\b|them\\b|us\\b)[a-z]+', 2),
  // 24 adverbial clauses
  R('adv_contrast', '\\b(?:although|even though|though|whereas|even if|despite the fact that)\\b', 2),
  R('adv_result', '\\bso\\s+[a-z]+\\s+that\\b|\\bsuch\\s+(?:a|an\\s+)?\\s*[a-z]+(?:\\s+[a-z]+)?\\s+that\\b', 2),
  R('adv_reason', '\\b(?:because|since)\\s+(?:i|you|he|she|it|we|they|the|people|this|that|there|my|your|our|their)\\s+(?!(?:as)\\b)[a-z]+', 2),
  R('adv_time', '\\b(?:when|while|before|after|until|till|as soon as|once|whenever|by the time)\\s+(?:i|you|he|she|it|we|they|the|people|my|your|this|that|there|our|their)\\s+(?!(?:do|does|did)\\b)[a-z]+', 2),
  // 18 phrasal verbs
  ...PV.map(([forms, part, sep]) => R(sep ? 'phrasal_separable' : 'phrasal_inseparable', `\\b(?:${forms})\\s+${sep ? '(?:(?:it|them|him|her|me|us|this|that|the\\s+[a-z]+|a\\s+[a-z]+|my\\s+[a-z]+|your\\s+[a-z]+)\\s+)?' : ''}${part.replace(/ /g, '\\s+')}\\b`, 2)),
  // 14 correlative conjunctions
  R('correlative', '\\bboth\\b.+?\\band\\b|\\beither\\b.+?\\bor\\b|\\bnot only\\b.+?\\bbut\\b', 2),
  // 11 adjectives
  R('ed_ing_adjectives', '\\b(?:bored|boring|interested|interesting|excited|exciting|tired|tiring|confused|confusing|surprised|surprising|amazing|amazed|embarrassed|embarrassing|disappointed|disappointing|frightened|frightening|annoyed|annoying|relaxed|relaxing|shocked|shocking|satisfied|satisfying|exhausted|exhausting|fascinated|fascinating|terrified|terrifying)\\b', 2),
  // 6 pronouns
  R('reflexive_pronouns', '\\b(?:myself|yourself|himself|herself|itself|ourselves|yourselves|themselves)\\b', 2),
  R('possessive_pronouns', '\\b(?:mine|yours|hers|ours|theirs)\\b', 2),
  R('indefinite_pronouns', '\\b(?:someone|somebody|something|anyone|anybody|anything|everyone|everybody|everything|nobody|nothing|no one|nowhere|somewhere|anywhere|everywhere)\\b', 1),
  // 8 plural
  R('irregular_plural', '\\b(?:people|children|men|women|feet|teeth|mice|geese|knives|wives|lives|leaves|halves|criteria|phenomena)\\b', 1),
  // 9 possessives
  R('apostrophe_s', "\\b(?!(?:it|that|he|she|what|there|here|let|who|where|how|this|everything|nothing|something|everyone|someone|nobody|one|today)'s\\b)[a-z]+'s\\s+(?!(?:a|an|the|not|been|going|got|just|very|so|really|gonna|no|all|about|also|still|never|always|like|why|what|how|it|that|this)\\b)[a-z]+", 1),
  R('of_possessive', '\\bthe\\s+[a-z]+\\s+of\\s+(?:the|my|your|his|her|our|their|this|that)\\s+[a-z]+', 1),
  // 10 prepositions
  R('prep_time', '\\b(?:at|on|in)\\s+(?:\\d+|the\\s+(?:morning|evening|afternoon|weekend|beginning|end)|night|noon|midnight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december|summer|winter|spring|autumn|weekends)\\b|\\bsince\\s+\\d+|\\bfor\\s+(?:\\w+\\s+)?(?:years|months|weeks|days|hours|minutes)\\b', 1),
  R('prep_place', '\\b(?:next to|in front of|behind|between|opposite|above|below|under|among|near|inside|outside|on top of)\\b', 1),
  R('prep_movement', '\\b(?:into|onto|through|across|towards|toward|out of|along|up to|away from)\\b', 1),
  // 12 adverbs
  R('adverb_frequency', '\\b(?:always|usually|often|sometimes|rarely|seldom|never|occasionally|normally|frequently|generally|hardly ever)\\b', 1),
  R('adverb_degree', '\\b(?:very|too|extremely|quite|fairly|incredibly|absolutely|totally|completely|enough|rather|pretty)\\s+[a-z]+', 1),
  R('adverb_manner', '\\b(?!(?:only|early|family|really|likely|unlikely|daily|lovely|friendly|lonely|ugly|silly|holy|reply|supply|apply|fly|july|italy|belly|rely|ally|bully|jelly|elderly|weekly|monthly|yearly|costly|deadly|nearly|actually|basically|literally|probably|definitely|exactly|certainly|usually|finally|especially|obviously|totally|completely|absolutely|extremely|incredibly|fairly|hardly|generally|frequently|normally|occasionally|rarely|recently|currently|simply|truly|surely|mostly|clearly)\\b)[a-z]{3,}ly\\b', 1),
  // 19 determiners
  R('demonstratives', '\\b(?:these|those)\\s+(?!(?:are|were|is|was|who|which|that)\\b)[a-z]+', 1),
  R('some_any', '\\b(?:some|any)\\s+(?!(?:of|more|other|time)\\b)[a-z]+', 1),
  R('much_many', '\\b(?:much|many|a lot of|lots of|plenty of)\\b', 1),
  R('few_little', '\\b(?:a few|few|a little|little)\\s+(?!(?:bit)\\b)[a-z]+', 1),
  R('each_every_all', '\\b(?:each|every)\\s+(?!(?:other|one|day)\\b)[a-z]+|\\ball\\s+(?:of\\s+)?(?:the|my|your|our|their|these|those)\\s+[a-z]+', 1),
  // 20 countable / uncountable
  R('uncountable_nouns', `\\b(?:much|a little|little|some|any|a lot of|lots of|the|more|less|no)\\s+(?:[a-z]+\\s+)?(?:${UNCOUNT})\\b`, 1),
  R('countable_nouns', '\\b(?:a few|many|several|fewer|a number of|two|three|four|five|ten|hundreds of|thousands of)\\s+(?:[a-z]+\\s+)?[a-z]+s\\b', 1),
  // 5 negation
  R('neither_nor', '\\bneither\\b.*?\\bnor\\b|\\bnor\\b', 2),
  R('never_no', "\\b(?:never|nobody|nothing|no one|nowhere|none)\\b|\\bno\\s+(?!(?:problem|one|way|matter|longer|doubt|idea|wonder)\\b)[a-z]+", 1),
  R('not', "\\b[a-z]+n't\\b|\\bnot\\b|\\bcannot\\b", 1),
  // 2 auxiliaries
  R('aux_do', `\\b(?:do|does|did)\\s+(?:i|you|he|she|it|we|they)\\b|\\b(?:i|we|they|you)\\s+do\\s+(?:think|believe|like|love|want|need|hope|know|care|agree|mean)\\b`, 1),
  // 14 conjunctions (subordinating is shown by its adverbial clause) · coordinating everywhere
  R('coordinating', '\\b(?:but|so)\\s+(?:i|you|he|she|it|we|they)\\b', 0),
  // 7 articles / everywhere
  R('a_an', '\\ban\\s+[a-z]+', 0),
];

/** Family of a sub-rule (its category) — one hit per category per place in the line. */
let CAT_OF = null;
export function setCategories(catalog) {
  CAT_OF = new Map(catalog.flatMap((c) => c.subs.map((sub) => [sub.id, c.id])));
}

/**
 * All grammar hits in an English line, best first, without two hits of the same family
 * on the same words. { sub, start, end, p }
 */
export function detectGrammar(text) {
  const raw = String(text || '');
  const t = raw.replace(/[’‘`]/g, "'").toLowerCase();
  const hits = [];
  RULES.forEach((rule, order) => {
    rule.re.lastIndex = 0;
    let m;
    let guard = 0;
    while ((m = rule.re.exec(t)) && guard < 8) {
      guard += 1;
      if (!m[0].trim()) { rule.re.lastIndex += 1; continue; }
      const lead = m[0].length - m[0].trimStart().length;
      hits.push({ sub: rule.sub, start: m.index + lead, end: m.index + m[0].trimEnd().length, p: rule.p, order });
      if (m[0].length === 0) rule.re.lastIndex += 1;
    }
  });
  hits.sort((a, b) => b.p - a.p || a.order - b.order || a.start - b.start);
  const out = [];
  for (const h of hits) {
    const fam = CAT_OF?.get(h.sub) || h.sub;
    const clash = out.some((o) => (CAT_OF?.get(o.sub) || o.sub) === fam && o.start < h.end && h.start < o.end);
    const same = out.some((o) => o.sub === h.sub);
    if (clash || same) continue;
    out.push(h);
  }
  return out.map(({ sub, start, end, p }) => ({ sub, start, end, p }));
}

/** Where a phrase (from the AI) sits in the line, or null. */
export function findPhrase(text, phrase) {
  const t = String(text || '').replace(/[’‘`]/g, "'").toLowerCase();
  const ph = String(phrase || '').replace(/[’‘`]/g, "'").toLowerCase().trim();
  if (!ph) return null;
  const i = t.indexOf(ph);
  return i < 0 ? null : { start: i, end: i + ph.length };
}
