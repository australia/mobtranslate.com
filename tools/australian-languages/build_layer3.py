#!/usr/bin/env python3
"""
LAYER 3 — construction-level records (the primary-data layer).

Seed set: construction records for Kuku Yalanji (glottocode kuku1273), transcribed from the
program's own MEGA grammar cheat sheet
  research/translation-training/kuku-yalanji-runpod-2026-06-30/reports/
  kuku-yalanji-mega-grammar-cheatsheet-2026-07-02.md
whose numbered rules ARE construction records (each carries a Patz section/example citation).
This proves the layer's SHAPE end-to-end for one language; it is a seed, not a full population.

Each record:
  id, language (glottocode), domain, name (construction), description,
  example {form, gloss, translation}, source {work, section}, analyst_confidence,
  community_terminology (null — to be filled by community linguists), license.

Sources & rights:
  - Patz, Elisabeth. 1982/2002. A Grammar of the Kuku Yalanji Language of North Queensland.
    Canberra: Pacific Linguistics. COPYRIGHTED academic grammar. We record ANALYTICAL FACTS
    (grammatical rules — not copyrightable) with section/example citations, plus short cited
    illustrative examples (attribution / fair-dealing for research). We do NOT reproduce the grammar.
  - Community dictionary dictionaries/kuku_yalanji/dictionary.yaml (community-held) — lexeme source.
    Community terminology and rights review are LEFT OPEN (community_terminology = null) pending
    consultation; this is a research/education artifact, licensing is load-bearing.
"""
import json
from pathlib import Path

OUT = Path("/mnt/donto-data/donto-resources/research/australian-languages/typology")
GC = "kuku1273"
PATZ = "Patz (1982) A Grammar of the Kuku Yalanji Language of North Queensland"
CHEAT = ("mobtranslate KY mega grammar cheat-sheet 2026-07-02 (transcription of Patz with "
         "§/example citations)")
DICT = "Kuku Yalanji community dictionary (dictionaries/kuku_yalanji/dictionary.yaml)"

# helper to keep records terse
def R(id, domain, name, desc, form, gloss, trans, section, work=PATZ, conf="attested",
      via=CHEAT, lic="Analytical facts + cited example from Patz 1982 (copyrighted grammar); "
                    "facts not copyrightable, short example cited for research/education."):
    return {
        "id": id, "language": GC, "domain": domain, "construction_name": name,
        "description": desc,
        "example": {"form": form, "gloss": gloss, "translation": trans},
        "source": {"work": work, "section": section, "via": via},
        "analyst_confidence": conf,
        "community_terminology": None,
        "license": lic,
    }

RECORDS = [
    # ---------------- PHONOLOGY / MORPHOPHONOLOGY ----------------
    R("KY001","phonology","Consonant/vowel inventory",
      "13 consonants (b d j k m n ny ng l rr r w y; digraphs only ny ng rr; no voicing contrast, velar stop always k) and 3 vowels (a i u); no long vowels or diphthongs.",
      "bubu / bana / kuku","place / water / word","(minimal lexemes illustrating the inventory)","§2.1-2.2"),
    R("KY002","phonology","Root shape & phonotactic constraints",
      "Roots are minimally disyllabic C(VC)^nV(C). Word-initial only b d j k m n ny ng w y (never l rr r except loans); word-final only a vowel or n ny l rr r y (never a stop, m, ng or w).",
      "maral / marral","girl / dry","Illustrates a legal CVCVC root and a rr-cluster minimal pair.","§2.1-2.2"),
    R("KY003","morphophonology","Vowel harmony in suffixes",
      "Every suffix written with harmony vowel V takes u after a u-final stem, else a after an a/i-final stem (i never yields an i-vowel suffix).",
      "jalbu-ngku / bama-ngka / mayi-ka","woman-ERG / person-ERG / food-DAT","ERG/DAT harmony vowel is set by the stem's last vowel.","§2.5"),
    R("KY004","morphophonology","Catalytic -mun- insertion",
      "-mun- is inserted between the stem and any non-zero inflection on trisyllabic-plus stems and English loans.",
      "bulkiji-mun-ku / school-mun-bu","pipi-DAT / school-INST","Long native stems and loans take catalytic -mun- before case.","§3.2.3.1"),
    R("KY005","morphophonology","Word-final /y/ deletion after i",
      "After i, a word-final or preconsonantal y is not written or pronounced, so y-conjugation verbs in -i surface bare.",
      "badiy -> badi","cry.NONPAST -> cries","The underlying -y is kept in analysis but dropped on the surface.","§2.5.2"),
    R("KY006","morphophonology","Lexicalised partial reduplication (frequent verbs)",
      "Six frequent verbs use a fixed partial reduplication (surface solid), not full-root reduplication.",
      "bundanday / wunanay / wanarriy","keep sitting/stay / keep lying/sleep / keep running","Fixed partial-redup forms for high-frequency motion/posture verbs.","§2.5.3"),

    # ---------------- ALIGNMENT ----------------
    R("KY010","alignment","Split alignment: ergative nouns, nominative-accusative pronouns",
      "Nouns follow an ergative/absolutive pattern (A=ERG, S=O=ABS); pronouns follow a nominative/accusative pattern (S=A=NOM, O=ACC). This word-class-conditioned split is the #1 correctness rule.",
      "Dingkarangka kadar kunin. / Ngayu nganya ...","man-ERG wallaby(ABS) killed / I(NOM) me(ACC)","A transitive noun subject is ERG while the wallaby object is ABS; pronouns instead use NOM/ACC.","§3.2, §3.5, §4.1.4"),
    R("KY011","alignment","Mixed clause (pronoun A + noun O, and vice versa)",
      "A clause may freely combine a pronoun subject in NOM with a noun object in ABS, or a noun subject in ERG with a pronoun object in ACC.",
      "Dubungku nyunguny makunyajin.","ghost-ERG him-ACC met","Noun-ERG agent with pronoun-ACC object in one clause.","§4.1.4","attested"),
    R("KY012","alignment","Potent vs neutral case allomorphy",
      "ERG/DAT/LOC/ABL each have a NEUTRAL allomorph set (plants, food, tools, places, body parts, abstracts, quantifiers) and a POTENT set (humans, names, most kin, dogs, spirits, threatening animals, police). Mid-animacy animals may take either, meaningfully.",
      "Dingkar-angka vs Dingkar-abu","man-ERG.potent vs man-ERG.neutral","Potent ERG credits agency ('a man, I saw him'); neutral ERG downgrades it ('some man, I suppose').","§3.2.1-3.2.2, Table 3.1"),
    R("KY013","alignment","Reflexive/reciprocal subject is absolutive",
      "Because the reflexive -ji- and reciprocal -wa- intransitivise the verb, their subject takes ABSOLUTIVE (zero), never ERG — the classic learner error.",
      "Dingkar jambul nyaji-way.","man two see-RECIP.NONPAST","The two men see each other: subject is bare ABS, not ERG.","§3.8.5.4"),

    # ---------------- CASE ALLOMORPHY ----------------
    R("KY020","case","Ergative allomorphy (neutral set)",
      "Neutral ERG/INST: -bu after a vowel, -Vbu after retroflex r, -njV after y, -dV elsewhere.",
      "juku-bu / wungar-abu / jalun-du","stick-ERG / sun-ERG / sea-ERG","Neutral ergative allomorphs conditioned by the stem's final segment.","§3.2.1-3.2.2, Table 3.1"),
    R("KY021","case","Ergative allomorphy (potent set)",
      "Potent ERG: -ngkV after a vowel, -VngkV after a consonant, with harmony vowel.",
      "jalbu-ngku / dingkar-angka","woman-ERG / man-ERG","Potent ergative on a vowel-final vs consonant-final human noun.","§3.2.1-3.2.2, Table 3.1"),
    R("KY022","case","Locative allomorphy — trill vs retroflex rhotic split",
      "Trill /rr/ stems take -ba/-bu (the 'elsewhere' allomorph); single retroflex /r/ stems take the long-vowel allomorph -a/-u. The two rhotics behave OPPOSITELY.",
      "wujurr-bu vs wungar-a","dark-LOC vs sun-LOC","Trill-final wujurr -> -bu; retroflex-r-final wungar -> -a.","§2.5.1, §3.2.3.1"),
    R("KY023","case","Ablative -muny (uniform)",
      "The ablative 'from' is -muny on all neutral stems; potent stems build it on the potent LOC (-ndVmuny).",
      "bayan-muny / buliman-andamuny","camp-ABL / police-ABL.potent","'from the camp' (neutral) vs 'from the police' (potent).","§3.2.1-3.2.2"),
    R("KY024","case","Abessive -mundu ('from a fixed vantage, not leaving')",
      "The abessive -mundu marks a locational source acted from without leaving the place; uniform across stems.",
      "Mabel yirrkay bayan-mundu.","Mabel calls.out house-ABESS","Mabel calls out from the house (while staying in it).","§3.2.1-3.2.2, l.1550"),

    # ---------------- CASE FUNCTIONS ----------------
    R("KY030","case","Instrumental = neutral ergative form",
      "The instrumental (implement/body part, or an inanimate uncontrolled cause) is marked identically to the neutral ergative.",
      "Dingkarangka yawu daman yinbabu.","man-ERG stingray speared spear-INST","'The man speared the stingray with a three-pronged spear.'","§4.1.4","attested"),
    R("KY031","case","Dative for purpose, want, fear, cause, standard of comparison",
      "The dative marks purpose/beneficiary, the object of wawu 'want', yinil 'fear', binal 'know', the topic of ask/tell, and the standard of comparison.",
      "Karrkay yinil kijunku.","child afraid crab-DAT","'The child is afraid of crabs' — object of fear is DAT.","§4.1.4","attested"),
    R("KY032","case","Locative as goal-of-motion and as recipient/addressee",
      "The locative marks place, the GOAL of motion (there is no separate allative), and the recipient/addressee of give/show/tell/send.",
      "Nyulu marrkin dajin yabanda.","he gun gave elder.brother-LOC.potent","'He gave the gun to his elder brother' — recipient is potent LOC.","§4.1.4, §3.3","attested"),
    R("KY033","case","Comitative vs privative contrast",
      "Comitative -ji/-iji/-nji 'with, having' contrasts with privative -kari 'without, lacking'; both are productive on any nominal.",
      "bubu bana-ji vs bubu bana-kari","country water-COMIT vs country water-PRIV","'a country with water' vs 'a country without water'.","§3.2.3.3-4"),

    # ---------------- NP STRUCTURE ----------------
    R("KY040","np","Case agreement across the noun phrase",
      "All NP constituents (demonstrative, noun, adjective) agree in case; possessives are exempt within a continuous NP.",
      "Yinya-ngka kubarr-angka yalbay-ngka maral baykan.","that-ERG eel-ERG big-ERG girl bit","'That big eel bit the girl' — ERG marked on demonstrative + noun + adjective.","§4.1.1","attested"),
    R("KY041","np","Modifier order (adjective follows, quantifier precedes)",
      "The unmarked modifier follows its head; a quantifier precedes and an adjective follows when both occur; demonstratives may precede or follow; pronoun precedes noun.",
      "jambul kaya kuliji","two dog vicious","'two vicious dogs' — quantifier before, adjective after the head.","§4.1.1"),
    R("KY042","np","Generic + specific (classifier) apposition",
      "A generic classifier noun (mayi 'veg food', minya 'meat', juku 'tree/wood') is apposed to the specific noun.",
      "minya ngangkin","meat porcupine","'porcupine (as meat)' — generic minya classifies the specific.","§4.1.1"),

    # ---------------- NOMINAL DERIVATION ----------------
    R("KY050","nominal-derivation","Alienable possessive -mu",
      "Alienable adnominal possession is -mu / -Vmu; before a further case suffix the possessor takes -ndVmun- and always neutral onward inflection.",
      "dingkar-amu / dingkar-andamun-du","man-POSS / man-POSS-ERG","'the man's' and 'the man's (ERG-agreeing head)'.","§3.2.3"),
    R("KY051","nominal-derivation","Plural by reduplication; kin plural -karra",
      "General nominal plural is reduplication; kin terms instead take the derivational plural -karra (excluding kangkal 'own child').",
      "maral-maral / jawun-karra","girl-PL / relative-KPL","'girls' (reduplication) vs 'relatives/family' (kin plural).","§3.2.3.5"),
    R("KY052","nominal-derivation","Dual/pair -bulal",
      "-bulal derives 'a pair who belong together', distinct from the plain quantifier jambul 'two'.",
      "jalbu-bulal","woman-PAIR","'the two women (as a pair)'.","§3.2.3.5"),
    R("KY053","nominal-derivation","Comitative derivation -ji/-iji/-nji",
      "Comitative 'with/having' is -ji after a vowel, -iji after a rhotic, potent -nji; +rr before a further suffix.",
      "walarr-iji / kaya-nji","beard-COMIT / dog-COMIT.potent","'bearded' and 'with a dog'.","§3.2.3.3"),
    R("KY054","nominal-derivation","Privative -kari",
      "Privative 'without' is a uniform -kari on any stem.",
      "bayan-kari","house-PRIV","'homeless'.","§3.2.3.4"),
    R("KY055","nominal-derivation","'People of' -(w)arra",
      "-(w)arra derives a group/ethnonym 'people of X'.",
      "jalunji-warra","seaside-people","'seaside people'.","§3.2.3"),
    R("KY056","nominal-derivation","Degree: jarra- 'rather' and -baja-ku 'very'",
      "Degree is expressed by prefix jarra- 'rather/more' or the suffix chain -baja-ku 'very' (case goes before -ku).",
      "jarra-yalbay / yalbay-bajaku","rather-big / big-very","'rather big' vs 'very big'.","§3.2.3.8"),

    # ---------------- PRONOUNS ----------------
    R("KY060","pronoun","Personal pronoun case paradigm",
      "Pronouns inflect for NOM/ACC/DAT/LOC/ABL/COMIT/POSS across singular, dual (incl/excl), plural (incl/excl) persons.",
      "ngayu / nganya / ngayku","I(NOM) / me(ACC) / my(POSS)","1sg NOM vs ACC vs POSS forms.","§3.5, Tables 3.6-3.8"),
    R("KY061","pronoun","Inclusive/exclusive dual & plural",
      "1st non-singular distinguishes exclusive (me + him/her) from inclusive (me + you); the distinction is weakening, default exclusive.",
      "ngali vs ngaliny","1du.EXC vs 1du.INC","'the two of us (not you)' vs 'you and I'.","§3.5"),
    R("KY062","pronoun","Possessive stem agreeing with a case-marked head",
      "A possessive pronoun agrees with a case-marked head via -wun- (sg) / -ndamun- (non-sg).",
      "ngayku-wun-du kaya-ngka","my-POSS-ERG dog-ERG","'my dog (ERG)' — possessive agrees with the ergative head.","§4.1.1","attested"),

    # ---------------- DEMONSTRATIVES / INTERROGATIVES ----------------
    R("KY070","demonstrative","Demonstrative system (this/that/here/there)",
      "yanyu 'this', yinya 'that', yaluy 'here', yinyay 'there'; case forms of 'this' built on yalu-; human plural -rriny.",
      "Yalungku jalbungku nganya binal-bungan.","this-ERG woman-ERG me taught","'This woman taught me' — demonstrative + noun both ERG.","§3.6-3.7","attested"),
    R("KY071","interrogative","Content interrogatives (uninflected, clause-heading)",
      "Interrogative pronouns head the clause: wanya 'who', wanyu 'what', wanja 'where', wanjarrinya 'how many', wanja-wanja 'when', wanyurringku 'why'; 'why'/'when' are clause-initial.",
      "Wanyangka ngayku dambal wundin?","who-ERG my shoes took","'Who took my shoes?' — interrogative in the ERG A slot.","§3.6-3.7","attested"),

    # ---------------- VERBS: CONJUGATION & INFLECTION ----------------
    R("KY080","verb","Two conjugation classes (l vs y)",
      "Verbs fall into an l-conjugation (NONPAST -l, ~92% transitive) and a y-conjugation (NONPAST -y, all intransitive); membership is lexically fixed.",
      "nukal (eat) vs dungay (go)","eat.NONPAST vs go.NONPAST","l-class transitive vs y-class intransitive.","§3.8"),
    R("KY081","verb","Verb inflection paradigm",
      "Each stem inflects for NONPAST, PAST (surface -n), IMP, PURP -nkV, PRECAUT -nyji, SUCC -nyjiku, IRR -nyaku, SUB -nyV.",
      "kunil / kunin / kuni / kuninka","hit.NONPAST/PAST/IMP/PURP","One l-conjugation paradigm across the core inflections.","§3.8, Tables 3.16-3.17"),
    R("KY082","verb","Surface past -n (analysis -ny)",
      "The past tense is analysed -ny but surfaces as -n in the elder/DB orthography; both fields are stored.",
      "kada-ny -> kadan","come-PAST -> came","Analysis keeps -ny; the surface written form is -n.","§3.8, §0"),
    R("KY083","verb","Imperative: zero on disyllabic l-roots, -ka on longer/derived stems",
      "The imperative is zero on disyllabic l-conjugation roots and -ka on longer or derived stems (incl. -ji- stems); some imperatives are suppletive.",
      "nuka! vs julurri-ji-ka!","eat! vs wash.oneself-IMP","Zero-IMP on a short root vs -ka on a derived reflexive stem.","§3.8"),
    R("KY084","verb","Suppletive imperatives",
      "A few frequent verbs have suppletive imperatives that must be memorised.",
      "dajil -> daya! ; nyajil -> nyaka!","give -> give! ; see -> look!","Suppletive command forms for 'give' and 'see'.","§3.8"),

    # ---------------- VERBS: DERIVATION ----------------
    R("KY090","verb-derivation","State-causative -bunga-l 'make X'",
      "-bunga-l derives a transitive 'make/cause X' from an adjective/noun base; variant -kanga-l 'stir up' for emotion.",
      "binal-bungal","knowledge-CAUS","'teach' (lit. make-know).","§3.8.5"),
    R("KY091","verb-derivation","Action-causative -(y)-mani-l",
      "-(y)-mani-l turns an intransitive verb into a transitive causative.",
      "dara-y-manil","fall-CAUS","'drop' (make fall).","§3.8.5"),
    R("KY092","verb-derivation","Inchoative -ma-l 'become X'",
      "-ma-l derives an intransitive 'become X' (IMP -ka).",
      "binal-mal","knowledge-INCHO","'learn' (become-knowing).","§3.8.5"),
    R("KY093","verb-derivation","Reflexive/middle & passive/antipassive -ji-",
      "-ji- intransitivises a transitive verb (y-conjugation): reflexive 'V oneself', passive (agent -> optional LOC), and antipassive (O -> LOC, verb often reduplicated).",
      "Warru (yaburrundu) bayka-ji-n.","young.man (shark-LOC) bite-MID-PAST","'The young man was bitten (by a shark)' — passive use of -ji-.","§3.8.5","attested"),
    R("KY094","verb-derivation","Reciprocal -wa-y",
      "-wa-y derives a reciprocal 'V each other' (intransitive, ABS subject).",
      "kuni-wa-y","hit-RECIP-NONPAST","'fight (hit each other)'.","§3.8.5.4"),
    R("KY095","verb-derivation","Plural-subject -ri-",
      "Optional -ri- marks a plural subject; it needs an overtly plural subject (plural pronoun or reduplication), not merely a quantifier.",
      "Jana bama wandi-ri-ny.","they person rise-PL-PAST","'The people got up' — plural-subject -ri- licensed by a plural subject.","§3.8.5","attested"),
    R("KY096","verb-derivation","Reduplication 'keep V-ing'",
      "Verb reduplication (link -l- for l-conjugation, -n- for y-conjugation) gives 'keep V-ing'; derived stems reduplicate the root only.",
      "dungan-dungay","go.REDUP-go.NONPAST","'keep going'.","§3.8.5"),

    # ---------------- SENTENCE PATTERNS ----------------
    R("KY100","clause","Verbless (no copula) predication",
      "There is no copula; nominal, adjectival, locational, comitative, privative and numeral predicates are all juxtaposed with the subject.",
      "Nyungu kalka dudu.","his spear blunt","'His spear is blunt' — adjectival predicate, no verb.","§4.1.5-4.1.6","attested"),
    R("KY101","clause","Possession by juxtaposition + numeral / comitative predicate",
      "'Have' is expressed by a verbless clause: numeral predicate ('X three') or comitative predicate ('X having Y').",
      "Ngayku kangkal kulur.","my child three","'I have three children' (lit. my children three).","§4.1.5-4.1.6","attested"),
    R("KY102","clause","Unmarked constituent order (S V; A O V)",
      "Word order is free (case does the work) but the unmarked order is S V and A O V; peripheral NPs follow the verb; pronouns come early; temporals and 'why' are clause-initial.",
      "Warrungku ngawuya daman.","young.man-ERG sea.turtle speared","'The young man speared a sea turtle' — unmarked A O V.","§4.1.5","attested"),
    R("KY103","clause","Adjectival particle + DAT/PURP complement",
      "Adjectival particles binal 'know', wawu 'want', yinil 'fear', juburr, balu govern a DAT or PURP complement.",
      "Jalbu binal balji wukurrinka.","woman know dillybag weave.PURP","'The woman knows how to weave dillybags.'","§3.9.1, §4.1.6","attested"),

    # ---------------- NEGATION / IMPERATIVES / QUESTIONS ----------------
    R("KY110","negation","Standard negation with kari 'not'",
      "kari 'not' precedes the negated element; kari + NONPAST is declarative negation ('does not V').",
      "Ngayu jungkalu kari dumbarrin.","I billycan not broke","'I did not break the billycan.'","§3.9.2","attested"),
    R("KY111","negation","Prohibitive = kari + imperative",
      "A prohibition uses kari + the IMPERATIVE form, distinct from declarative kari + NONPAST.",
      "Mayi kari waju!","food not cook.IMP","'Don't cook the food!' — kari + IMP prohibitive.","§3.8.4.1","attested"),
    R("KY112","clause","Desiderative-negative balu 'desist'",
      "balu 'desist/let be' governs a DAT/PURP complement.",
      "Ngayu balu kuniwanka.","I desist fight.PURP","'I don't want to fight.'","§3.9.1","attested"),
    R("KY113","interrogative","Polar question by intonation",
      "A yes/no question is a statement with rising intonation (written with '?'); no particle or word-order change.",
      "Nyulu kadanbaja?","he came.back","'Did he come back?' — polar question by intonation only.","§4.8","attested"),

    # ---------------- SUBORDINATION ----------------
    R("KY120","subordination","Purposive -nkV ('in order to / must / want to')",
      "The purposive -nkV marks a purpose clause, a want-complement, or main-clause obligation.",
      "Warru dungan wawubajanga, kuyu damanka.","young.man went river-LOC fish spear.PURP","'The young man went to the river to spear fish.'","§4.4","attested"),
    R("KY121","subordination","Precautionary -nyji ('lest')",
      "The precautionary -nyji marks an undesirable event to be avoided, subordinate to a clause stating the precaution.",
      "Kari kaya kuliji karrba, baykanyji.","not dog vicious touch bite.PRECAUT","'Don't touch the vicious dog lest it bite.'","§3.8.4.5, §4.4","attested"),
    R("KY122","subordination","Successive -nyjiku ('just before / and then')",
      "The successive -nyjiku marks the later of two events with no causal link, in a subordinate clause.",
      "Jalbu mara julurrijiy, mayi damba dingkanyjiku.","woman hand wash.MID food damper knead.SUCC","'The woman washes her hands before kneading damper.'","§4.4","attested"),
    R("KY123","subordination","Simultaneous/causal -nyV ('while / from ...ing')",
      "The subordinator -nyV marks a simultaneous 'while ...ing' clause (verb often reduplicated) or a causal 'from ...ing' clause.",
      "Janjinya, nyulu bajaburray.","bathe.SUB he tired","'He is tired from bathing.'","§4.4","attested"),
    R("KY124","subordination","Prior wawu-...-nyV-muny ('after ...ing')",
      "The proclitic wawu- + a -nyV clause in the ablative marks a prior 'after ...ing' event.",
      "Wawu-janjinyamuny, jana wunanay.","after-bathe.SUB.ABL they rest","'After bathing, they rest.'","§4.4","attested"),
    R("KY125","subordination","Conditional particle kaki ('if / when') + NONPAST",
      "The clause-initial particle kaki marks a real conditional with a NONPAST condition clause; kari inside gives a negative conditional.",
      "Kaki yundu yinya kaya jukubu kunil, yununy baykal.","if you that dog stick-INST hit, you.ACC bite","'If you hit that dog with a stick, it will bite you.'","§4.4","attested"),
    R("KY126","verb","Irrealis -nyaku (counterfactual 'should/would have')",
      "The irrealis -nyaku attaches to the verb stem and marks an action that should/could/would have happened but did not; carries no tense; canonical regret frame.",
      "Ngayu nganjan wukurri-nyaku ...","I father follow-IRR","'I should have followed my father ...' (but did not).","§3.8.4.1(iv)","attested"),

    # ---------------- CLITICS / DISCOURSE ----------------
    R("KY130","discourse","Sequential narrative: final verb + TEMP1 -da 'and then'",
      "A connected event-chain is a string of plain PAST verbs whose FINAL verb carries the clitic -da 'and then' (surface V-n-da).",
      "Jana kadan, kuyu manin, wajun, nuka-ny-da.","they came, fish caught, cooked, eat-PAST-TEMP1","'They came, caught a fish, cooked it, and then ate it.'","§3.8.4.1(vii), §4.4.3","attested"),
    R("KY131","discourse","TEMP3 'first of all' -(ng)Vrr",
      "The clitic -(ng)Vrr 'first of all' marks the first in a sequence; attaches to vowel-final verbs/nouns/pronouns (harmony -ngarr/-ngurr; -arr after past -ny).",
      "Nyulu kuyu-ngurr manin, ngawuya damanda.","he fish-first caught, turtle speared.then","'He caught a fish first, then speared a turtle.'","§3.10.1","attested"),
    R("KY132","discourse","Totality/only clitic -rrku ('all / whole / only')",
      "The emphatic clitic -rrku (on verbs, pronouns, kari, yala) expresses 'all/whole/only'.",
      "Bayan kidarrku!","house sweep.all","'Sweep the whole house!'","§3.10","attested"),
    R("KY133","discourse","-baja: 'quite' on state verbs, 'again' on motion verbs",
      "The clitic -baja means 'quite' on a state verb and 'again/back' on an action/motion verb; surfaces as a separate word baja in the elder orthography.",
      "Ngayu wawu kadankabaja.","I want come.back.again","'I want to come back.'","§3.10","attested"),
    R("KY134","discourse","Urgency clitics -da 'now' / -ngVrr 'straight away' on imperatives",
      "Imperatives take urgency clitics -da 'now' and -ngVrr 'straight away, first'.",
      "Nukangarr!","eat.first","'Eat up first!'","§3.10, §4.7","attested"),

    # ---------------- KINSHIP / NUMBER / COMPARISON ----------------
    R("KY140","kinship","Seven neutral-inflecting kin terms",
      "Seven kin terms (kangkal, manyarr, babarr, jinkurr, biwul, ngalayan, kujiway) take NEUTRAL case despite being human; all other kin are potent-only.",
      "kangkal-da (vs *kangkal-angka)","own.child-ERG.neutral","'own child' takes neutral ERG -da, not potent -angka.","§3.2.4","attested"),
    R("KY141","kinship","Kin dyad -manda ('X and paired relative')",
      "The dyadic suffix -manda derives 'X and their paired relative'.",
      "ngamu-manda","mother-DYAD","'a mother and child (as a pair)'.","§3.2.4"),
    R("KY142","numerals","Restricted numeral system",
      "Cardinals are nyubun 1, jambul 2, kulur 3, and wubul 'many' (no higher cardinals); the 'one/two' set has a special case series (nyubuninja ERG, etc.).",
      "nyubun / jambul / kulur / wubul","one / two / three / many","The full cardinal inventory: 1, 2, 3, 'many'.","§3.2.3.5, §3.9.2"),
    R("KY143","comparison","Comparative = ablative standard + degree -baja",
      "Comparison of inequality has no 'than' verb: the standard takes ablative -muny and the property word takes the degree suffix -baja.",
      "ngaya-muny yalbay-baja","me-ABL big-more","'bigger than me'.","§3.2.3.8, §3.9.2"),
    R("KY144","comparison","Superlative = property + bajaku 'most'",
      "The superlative uses the property word + bajaku 'most', often with wubulmuny 'of all'.",
      "yalbay bajaku","big most","'biggest'.","§3.2.3.8"),
    R("KY145","comparison","Equality particle yala 'like/as'",
      "The particle yala expresses similarity/equality 'like, as'.",
      "Nyulu yala nyungu nganjan.","he like his father","'He is just like his father.'","§3.9.2","attested"),

    # ---------------- LOANS / DIRECTIONALS ----------------
    R("KY150","loans","English-loan integration",
      "Loan nouns optionally take catalytic -mun- before suffixes; many loans are already lexicalised in the dictionary. Loan verbs: intransitive -> -ma-l, transitive -> -im-bunga-l.",
      "car-mun-ji / fix-im-bungal","car-INST / fix-CAUS","A loan noun with instrumental and a transitive loan verb.","§2.3, §3.12"),
    R("KY151","directional","Locative doubles as allative (goal of motion)",
      "There is no dedicated 'to' case; the locative marks the goal of motion, contrasting with ablative -muny 'from'.",
      "wawubaja-nga dunga-y","river-LOC go-NONPAST","'go to the river' — LOC as allative goal.","§3.3","attested"),
    R("KY152","directional","Geographic cardinal + inchoative -ma-l",
      "Coastal cardinals kungkarr 'north', kuwa 'west', naka 'seaward/east' take the directional inchoative -ma-l 'move in X direction'.",
      "kuwa-ma-l","west-INCHO","'move westward'.","§3.3"),
]


def main():
    # sanity: unique ids, required fields
    ids = [r["id"] for r in RECORDS]
    assert len(ids) == len(set(ids)), "duplicate construction ids"
    by_domain = {}
    for r in RECORDS:
        by_domain.setdefault(r["domain"], 0)
        by_domain[r["domain"]] += 1

    out = {
        "_meta": {
            "layer": "L3-construction-records",
            "kind": "constructions",
            "language": GC,
            "language_name": "Kuku Yalanji",
            "note": "Seed demonstration set for ONE language, transcribed from the program's KY mega "
                    "grammar cheat-sheet (itself a cited study of Patz 1982). Proves the layer's shape "
                    "end-to-end; not a full population. community_terminology is null pending "
                    "consultation. Layer 3 is the PRIMARY descriptive-data layer that Layers 1-2 "
                    "compress.",
            "n_records": len(RECORDS),
            "domains": by_domain,
            "primary_source": PATZ,
            "transcription_via": CHEAT,
            "rights": "Analytical grammatical facts (not copyrightable) + short cited examples from Patz "
                      "1982 for research/education; the copyrighted grammar itself is not reproduced. "
                      "Community rights review pending (community_terminology left null).",
        },
        "constructions": RECORDS,
    }
    json.dump(out, open(OUT / "constructions.json", "w"), indent=1, ensure_ascii=False)
    print(f"LAYER 3 built: {len(RECORDS)} Kuku Yalanji construction records across {len(by_domain)} domains")
    for d, n in sorted(by_domain.items()):
        print(f"    {d}: {n}")


if __name__ == "__main__":
    main()
