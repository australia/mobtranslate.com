#!/usr/bin/env python3
"""
LAYER 2 — Australia extension catalog.

An initial ~50-variable set of finer Australianist distinctions that Grambank compresses
(split-ergativity conditioning, bound-pronoun host, case on nouns vs pronouns, dual/paucal/trial
number per word class, comitative/instrumental syncretism, associated motion, avoidance register,
kinship dyads, initial-dropping, ignorative/interrogative syncretism, ...).

Each entry: id (AUX###), name, plain-English gloss, coding_question, value_space, domain,
derivation (source + method). VALUES ARE CODED ONLY where derivable from already-acquired open
data (WALS chapters + Grambank + Glottolog); everything else stays '?'. This catalog is
INFRASTRUCTURE for future grammar-mining — coverage is honestly LOW and reported as such.

The crosswalk from a specific WALS/Grambank code to an AUX value is authored per-feature
metadata (a fixed published-feature crosswalk), not data-varying semantic logic.

Sources (CC-BY-4.0): WALS v2020.4 CLDF, Grambank v1.0.3 CLDF, Glottolog 5.3 CLDF.
"""
import csv, json, collections
from pathlib import Path

ROOT = Path("/mnt/donto-data/donto-resources/research/australian-languages")
OUT = ROOT / "typology"
csv.field_size_limit(10_000_000)


def load_csv(p):
    with open(p, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ---------- The AUX feature catalog + derivation specs ----------
# derive: (source_kind, source_id, mapping)  OR  None (manual / not derivable from open data)
#   source_kind 'wals'  -> mapping: wals_code_id -> aux value  (dict; keys may be code_id like '98A-4')
#   source_kind 'gb'    -> mapping: grambank value string -> aux value (dict)
#   source_kind 'derived' -> handled specially in code (id-based)
CATALOG = [
  # ---- Alignment / ergativity (the signature Australianist domain) ----
  dict(id="AUX001", domain="alignment", name="Nominal case alignment",
       gloss="Case-marking alignment of full (non-pronominal) noun phrases.",
       q="How are S, A and P of full NPs aligned by case?",
       vs=["ergative","accusative","neutral","tripartite","active","marked-nominative"],
       derive=("wals","98A",{"98A-1":"neutral","98A-2":"accusative","98A-3":"marked-nominative",
                              "98A-4":"ergative","98A-5":"tripartite","98A-6":"active"})),
  dict(id="AUX002", domain="alignment", name="Pronominal case alignment",
       gloss="Case-marking alignment of independent personal pronouns.",
       q="How are S, A and P of pronouns aligned by case?",
       vs=["ergative","accusative","neutral","tripartite","active","none","marked-nominative"],
       derive=("wals","99A",{"99A-1":"neutral","99A-2":"accusative","99A-3":"marked-nominative",
                              "99A-4":"ergative","99A-5":"tripartite","99A-6":"active","99A-7":"none"})),
  dict(id="AUX003", domain="alignment", name="Verbal person-marking alignment",
       gloss="Alignment of person marking (agreement/bound pronouns) on the verb.",
       q="How is verbal person marking aligned?",
       vs=["accusative","ergative","neutral","active","hierarchical","split"],
       derive=("wals","100A",{"100A-1":"neutral","100A-2":"accusative","100A-3":"ergative",
                              "100A-4":"active","100A-5":"hierarchical","100A-6":"split"})),
  dict(id="AUX004", domain="alignment", name="Case-marking split between nouns and pronouns",
       gloss="Whether full nouns and pronouns use DIFFERENT case alignments (e.g. nouns ergative but "
             "pronouns nominative-accusative) — the classic Australian split.",
       q="Do nouns and pronouns have different case alignment?",
       vs=["yes","no"],
       derive=("derived","AUX004",None)),  # compare WALS 98A vs 99A
  dict(id="AUX005", domain="alignment", name="Person/NP-type conditioned split ergativity",
       gloss="Whether ergativity is conditioned by the person/NP-type hierarchy (ergative on nouns/3rd, "
             "accusative on speech-act pronouns) — a hierarchy-based split.",
       q="Is there hierarchy (person/NP-type) conditioned split ergativity?",
       vs=["yes","no"],
       derive=("derived","AUX005",None)),  # 98A ergative-ish AND 99A accusative-ish
  # ---- Case system ----
  dict(id="AUX006", domain="case", name="Number of morphological cases",
       gloss="Size of the morphological case inventory on nouns.",
       q="How many morphological cases does the language have?",
       vs=["none","2","3","4","5","6-7","8-9","10+","borderline"],
       derive=("wals","49A",{"49A-1":"none","49A-2":"2","49A-3":"3","49A-4":"4","49A-5":"5",
                              "49A-6":"6-7","49A-7":"8-9","49A-8":"10+","49A-9":"borderline"})),
  dict(id="AUX007", domain="case", name="Position of case affixes",
       gloss="Where case marking sits: suffix, prefix, clitic, tone, stem change.",
       q="What is the position/type of case affixes?",
       vs=["suffix","prefix","tone","stem-change","mixed","postpositional-clitic",
           "prepositional-clitic","inpositional-clitic","none"],
       derive=("wals","51A",{"51A-1":"suffix","51A-2":"prefix","51A-3":"tone","51A-4":"stem-change",
                              "51A-5":"mixed","51A-6":"postpositional-clitic","51A-7":"prepositional-clitic",
                              "51A-8":"inpositional-clitic","51A-9":"none"})),
  dict(id="AUX008", domain="case", name="Case marked separately on pronouns vs nouns",
       gloss="Whether both non-pronominal core arguments and pronominal core arguments carry case "
             "(so case can differ by word class).",
       q="Do nouns and pronouns each carry core-argument case?",
       vs=["both","nouns-only","pronouns-only","neither"],
       derive=("derived","AUX008",None)),  # GB070 (noun case) x GB071 (pronoun case)
  dict(id="AUX009", domain="case", name="Comitative vs instrumental syncretism",
       gloss="Whether 'with (accompaniment)' and 'with (instrument)' use the same or different marking "
             "— a much-discussed Australianist parameter.",
       q="Are comitative and instrumental marked identically?",
       vs=["identical","differentiated","mixed"],
       derive=("wals","52A",{"52A-1":"identical","52A-2":"differentiated","52A-3":"mixed"})),
  # ---- Bound pronouns / person marking host ----
  dict(id="AUX010", domain="pronoun-marking", name="Bound-pronoun / pronominal-subject host",
       gloss="How pronominal subjects are expressed: obligatory free pronoun, subject affix on the "
             "verb, clitic on a variable host (e.g. second position / auxiliary), etc.",
       q="How are pronominal subjects expressed / where do bound pronouns attach?",
       vs=["obligatory-free","subject-affix-on-verb","clitic-variable-host","free-different-position",
           "optional-free","mixed"],
       derive=("wals","101A",{"101A-1":"obligatory-free","101A-2":"subject-affix-on-verb",
                              "101A-3":"clitic-variable-host","101A-4":"free-different-position",
                              "101A-5":"optional-free","101A-6":"mixed"})),
  dict(id="AUX011", domain="pronoun-marking", name="Second-position pronominal clitic cluster",
       gloss="Whether bound pronouns form a clitic cluster on a variable (typically second-position/"
             "auxiliary) host rather than being fixed to the verb.",
       q="Are pronominal clitics hosted in a variable (2nd-position) slot?",
       vs=["yes","no"],
       derive=("derived","AUX011",None)),  # WALS 101A-3
  dict(id="AUX012", domain="pronoun-marking", name="A argument indexed on the verb",
       gloss="Whether the transitive subject (A) is cross-referenced by a bound marker on the verb.",
       q="Is A indexed on the verb (prefix or suffix)?",
       vs=["yes","no"],
       derive=("derived","AUX012",None)),  # GB091 or GB092
  dict(id="AUX013", domain="pronoun-marking", name="P argument indexed on the verb",
       gloss="Whether the transitive object (P) is cross-referenced by a bound marker on the verb.",
       q="Is P indexed on the verb (prefix or suffix)?",
       vs=["yes","no"],
       derive=("derived","AUX013",None)),  # GB093 or GB094
  # ---- Number values per word class ----
  dict(id="AUX014", domain="number", name="Nominal dual number",
       gloss="Productive morphological dual on nouns.",
       q="Is there productive dual marking on nouns?", vs=["yes","no"],
       derive=("gb","GB043",{"1":"yes","0":"no"})),
  dict(id="AUX015", domain="number", name="Nominal paucal number",
       gloss="Productive morphological paucal ('a few') on nouns.",
       q="Is there productive paucal marking on nouns?", vs=["yes","no"],
       derive=("gb","GB166",{"1":"yes","0":"no"})),
  dict(id="AUX016", domain="number", name="Nominal trial number",
       gloss="Productive morphological trial (exactly three) on nouns.",
       q="Is there productive trial marking on nouns?", vs=["yes","no"],
       derive=("gb","GB165",{"1":"yes","0":"no"})),
  dict(id="AUX017", domain="number", name="Coding of nominal plurality",
       gloss="How nominal plural is coded: suffix, prefix, reduplication, plural word, clitic, none.",
       q="How is nominal plurality coded?",
       vs=["prefix","suffix","stem-change","tone","reduplication","mixed","plural-word","clitic","none"],
       derive=("wals","33A",{"33A-1":"prefix","33A-2":"suffix","33A-3":"stem-change","33A-4":"tone",
                              "33A-5":"reduplication","33A-6":"mixed","33A-7":"plural-word",
                              "33A-8":"clitic","33A-9":"none"})),
  dict(id="AUX018", domain="number", name="Plurality in independent pronouns",
       gloss="How number is built into independent personal pronouns.",
       q="How is plurality expressed in independent pronouns?",
       vs=["no-independent","number-indifferent","person-number-affix","person-number-stem",
           "person-number-stem+pron-plural","person-number-stem+nom-plural","person-stem+pron-plural",
           "person-stem+nom-plural"],
       derive=("wals","35A",{"35A-1":"no-independent","35A-2":"number-indifferent","35A-3":"person-number-affix",
                              "35A-4":"person-number-stem","35A-5":"person-number-stem+pron-plural",
                              "35A-6":"person-number-stem+nom-plural","35A-7":"person-stem+pron-plural",
                              "35A-8":"person-stem+nom-plural"})),
  # ---- Clusivity ----
  dict(id="AUX019", domain="pronoun", name="Inclusive/exclusive distinction",
       gloss="Whether 1st-person non-singular distinguishes inclusive ('we incl. you') from exclusive.",
       q="Is there an inclusive/exclusive distinction in pronouns?",
       vs=["yes","no","no-we","we=I"],
       derive=("wals","39A",{"39A-1":"no-we","39A-2":"we=I","39A-3":"no","39A-4":"yes","39A-5":"yes"})),
  dict(id="AUX020", domain="pronoun", name="Inclusive/exclusive in verbal inflection",
       gloss="Whether the inclusive/exclusive distinction also appears in verbal person marking.",
       q="Is inclusive/exclusive marked on the verb?",
       vs=["yes","no","no-marking"],
       derive=("wals","40A",{"40A-1":"no-marking","40A-2":"no","40A-3":"yes","40A-4":"yes","40A-5":"yes"})),
  # ---- Gender / noun class ----
  dict(id="AUX021", domain="gender", name="Number of genders / noun classes",
       gloss="Count of gender / noun-class categories.",
       q="How many genders/noun classes are there?",
       vs=["none","two","three","four","five+"],
       derive=("wals","30A",{"30A-1":"none","30A-2":"two","30A-3":"three","30A-4":"four","30A-5":"five+"})),
  dict(id="AUX022", domain="gender", name="Sex-based vs non-sex-based gender",
       gloss="Whether the gender system is sex-based or non-sex-based (or absent).",
       q="Is the gender system sex-based?",
       vs=["none","sex-based","non-sex-based"],
       derive=("wals","31A",{"31A-1":"none","31A-2":"sex-based","31A-3":"non-sex-based"})),
  # ---- Demonstratives / pronouns ----
  dict(id="AUX023", domain="demonstrative", name="Distance contrasts in demonstratives",
       gloss="Number of distance contrasts (2, 3+ deictic terms).",
       q="How many distance contrasts do demonstratives make?",
       vs=["two","three-plus"],
       derive=("gb","GB035",{"1":"three-plus","0":"two"})),
  dict(id="AUX024", domain="pronoun", name="Gender in independent 3rd-person pronouns",
       gloss="Whether independent 3rd-person pronouns mark gender (he/she).",
       q="Do 3rd-person pronouns mark gender?", vs=["yes","no"],
       derive=("gb","GB030",{"1":"yes","0":"no"})),
  # ---- Verb morphology ----
  dict(id="AUX025", domain="verb", name="Verb conjugation classes",
       gloss="Whether verbs fall into conjugation classes (as in most Pama-Nyungan languages).",
       q="Are there verb conjugation classes?", vs=["yes","no"],
       derive=("gb","GB111",{"1":"yes","0":"no"})),
  dict(id="AUX026", domain="verb", name="Position of tense-aspect affixes",
       gloss="Where TAM inflection sits on the verb: prefix, suffix, tone, mixed, none.",
       q="What is the position of tense-aspect affixes?",
       vs=["prefix","suffix","tone","mixed","none"],
       derive=("wals","69A",{"69A-1":"prefix","69A-2":"suffix","69A-3":"tone","69A-4":"mixed","69A-5":"none"})),
  dict(id="AUX027", domain="verb", name="Multiple (distance) past/future tenses",
       gloss="Whether there are multiple past or future tenses distinguishing temporal distance "
             "(e.g. recent vs remote past) — common in Australian languages.",
       q="Are there multiple distance-graded past/future tenses?", vs=["yes","no"],
       derive=("gb","GB309",{"1":"yes","0":"no"})),
  dict(id="AUX028", domain="verb", name="Associated motion / verbal directional marking",
       gloss="Directional or locative morphology on the verb. NOTE: true associated-motion systems "
             "(coming/going while V-ing) are a fine Australianist category that open datasets do not "
             "isolate; this uses Grambank's broader directional/locative-on-verb feature as a proxy.",
       q="Does the verb carry directional/locative (associated-motion-type) morphology?",
       vs=["yes","no"],
       derive=("gb","GB108",{"1":"yes","0":"no"})),
  dict(id="AUX029", domain="verb", name="Verb suppletion for participant number",
       gloss="Whether a verb uses a different root for singular vs plural participant (e.g. 'go.sg' vs 'go.pl').",
       q="Is there verb suppletion for participant number?", vs=["yes","no"],
       derive=("gb","GB109",{"1":"yes","0":"no"})),
  dict(id="AUX030", domain="verb", name="Reduplication productivity",
       gloss="Whether reduplication is productive and of what kind (full/partial).",
       q="What kind of productive reduplication is there?",
       vs=["full-and-partial","full-only","none"],
       derive=("wals","27A",{"27A-1":"full-and-partial","27A-2":"full-only","27A-3":"none"})),
  # ---- Valency / voice ----
  dict(id="AUX031", domain="valency", name="Bound reflexive marker on verb",
       gloss="A phonologically bound reflexive marker on the verb (e.g. Kuku Yalanji -ji-).",
       q="Is there a bound reflexive on the verb?", vs=["yes","no"],
       derive=("gb","GB114",{"1":"yes","0":"no"})),
  dict(id="AUX032", domain="valency", name="Bound reciprocal marker on verb",
       gloss="A phonologically bound reciprocal marker on the verb (e.g. Kuku Yalanji -wa-).",
       q="Is there a bound reciprocal on the verb?", vs=["yes","no"],
       derive=("gb","GB115",{"1":"yes","0":"no"})),
  dict(id="AUX033", domain="valency", name="Reflexive/reciprocal identity",
       gloss="Whether reciprocal marking is identical to, or distinct from, reflexive marking.",
       q="Is the reciprocal identical to the reflexive?",
       vs=["none","distinct","mixed","identical"],
       derive=("wals","106A",{"106A-1":"none","106A-2":"distinct","106A-3":"mixed","106A-4":"identical"})),
  dict(id="AUX034", domain="valency", name="Morphological antipassive",
       gloss="A morphological antipassive on the lexical verb (demotes P; salient in ergative languages).",
       q="Is there a morphological antipassive?", vs=["yes","no"],
       derive=("gb","GB148",{"1":"yes","0":"no"})),
  dict(id="AUX035", domain="valency", name="Causative by affix/clitic",
       gloss="Whether causatives are formed by an affix/clitic on the verb.",
       q="Are causatives formed by verbal affix/clitic?", vs=["yes","no"],
       derive=("gb","GB155",{"1":"yes","0":"no"})),
  # ---- Negation ----
  dict(id="AUX036", domain="negation", name="Standard negation strategy",
       gloss="How declarative clauses are negated: affix, particle, negative auxiliary, etc.",
       q="What is the standard negation strategy?",
       vs=["affix","particle","auxiliary-verb","word-unclear","word~affix-variation","double"],
       derive=("wals","112A",{"112A-1":"affix","112A-2":"particle","112A-3":"auxiliary-verb",
                              "112A-4":"word-unclear","112A-5":"word~affix-variation","112A-6":"double"})),
  dict(id="AUX037", domain="negation", name="Prohibitive vs declarative negation",
       gloss="Whether the prohibitive (negative imperative) uses a different construction from "
             "declarative negation.",
       q="Is the prohibitive construction special (vs declarative negation)?",
       vs=["yes","no"],
       derive=("gb","GB139",{"1":"yes","0":"no"})),
  # ---- Clause / syntax ----
  dict(id="AUX038", domain="syntax", name="Dominant constituent order",
       gloss="Dominant order of subject, object and verb (often 'no dominant order' in free-word-order "
             "Australian languages).",
       q="What is the dominant SOV order?",
       vs=["SOV","SVO","VSO","VOS","OVS","OSV","no-dominant-order"],
       derive=("wals","81A",{"81A-1":"SOV","81A-2":"SVO","81A-3":"VSO","81A-4":"VOS","81A-5":"OVS",
                              "81A-6":"OSV","81A-7":"no-dominant-order"})),
  dict(id="AUX039", domain="syntax", name="Adposition type",
       gloss="Prepositions vs postpositions vs no dominant adpositions.",
       q="Are adpositions pre- or postposed?",
       vs=["postpositions","prepositions","inpositions","no-dominant-order","no-adpositions"],
       derive=("wals","85A",{"85A-1":"postpositions","85A-2":"prepositions","85A-3":"inpositions",
                              "85A-4":"no-dominant-order","85A-5":"no-adpositions"})),
  dict(id="AUX040", domain="syntax", name="Switch-reference",
       gloss="A verb marker signalling same/different subject across clauses.",
       q="Is there switch-reference marking?", vs=["yes","no"],
       derive=("gb","GB151",{"1":"yes","0":"no"})),
  dict(id="AUX041", domain="syntax", name="Clause chaining",
       gloss="Chains of dependent (medial) clauses closed by one finite verb.",
       q="Is there clause chaining?", vs=["yes","no"],
       derive=("gb","GB150",{"1":"yes","0":"no"})),
  dict(id="AUX042", domain="syntax", name="Pro-drop (null core arguments)",
       gloss="Whether S/A can be omitted when inferrable — pervasive in bound-pronoun Australian languages.",
       q="Can core arguments be dropped (pro-drop)?", vs=["yes","no"],
       derive=("gb","GB522",{"1":"yes","0":"no"})),
  # ---- Numerals ----
  dict(id="AUX043", domain="numerals", name="Numeral base system",
       gloss="Base of the numeral system: decimal, quinary, vigesimal, body-part tally, or restricted "
             "(many Australian languages have very small numeral systems).",
       q="What numeral base system is used?",
       vs=["decimal","quinary","vigesimal","body-part","restricted/none"],
       derive=("derived","AUX043",None)),  # from GB333/334/335/336
  dict(id="AUX044", domain="numerals", name="Numeral classifiers",
       gloss="Whether counting requires a sortal numeral classifier.",
       q="Are numeral classifiers present?",
       vs=["absent","optional","obligatory"],
       derive=("wals","55A",{"55A-1":"absent","55A-2":"optional","55A-3":"obligatory"})),
  # ---- Predication / comparison / evidentiality ----
  dict(id="AUX045", domain="clause", name="Predicative possession strategy",
       gloss="How 'X has Y' is expressed: locational, genitive, topic, conjunctional, or a 'have' verb.",
       q="What predicative possession strategy is used?",
       vs=["locational","genitive","topic","conjunctional","have-verb"],
       derive=("wals","117A",{"117A-1":"locational","117A-2":"genitive","117A-3":"topic",
                              "117A-4":"conjunctional","117A-5":"have-verb"})),
  dict(id="AUX046", domain="clause", name="Comparative construction type",
       gloss="How comparison of inequality is expressed: locational standard, 'exceed', conjoined, particle.",
       q="What comparative construction is used?",
       vs=["locational","exceed","conjoined","particle"],
       derive=("wals","121A",{"121A-1":"locational","121A-2":"exceed","121A-3":"conjoined","121A-4":"particle"})),
  dict(id="AUX047", domain="verb", name="Evidentiality coding",
       gloss="Whether grammatical evidentiality is marked, and its scope (direct/indirect).",
       q="Is evidentiality grammatically coded?",
       vs=["none","indirect-only","direct-and-indirect"],
       derive=("wals","77A",{"77A-1":"none","77A-2":"indirect-only","77A-3":"direct-and-indirect"})),
  # ---- Australianist categories NOT isolable from current open data (honest '?') ----
  dict(id="AUX048", domain="register", name="Avoidance / mother-in-law register attested",
       gloss="Whether a special avoidance ('mother-in-law') speech register is attested. NOT derivable "
             "from WALS/Grambank/Glottolog — requires descriptive-grammar mining (Layer 3).",
       q="Is an avoidance / mother-in-law register attested?", vs=["yes","no"],
       derive=None),
  dict(id="AUX049", domain="register", name="Kinship dyadic morphology",
       gloss="Dyadic kin terms ('the two who are in relation R', e.g. father-and-child pair). NOT in "
             "open typological datasets; requires grammar mining.",
       q="Is there dedicated kinship-dyad morphology?", vs=["yes","no"],
       derive=None),
  dict(id="AUX050", domain="phonology-morphology", name="Initial dropping / initial consonant loss",
       gloss="Historical loss of word-initial consonants/syllables (a Northern-Australian areal trait). "
             "NOT derivable from these open datasets.",
       q="Does the language show initial dropping?", vs=["yes","no"],
       derive=None),
  dict(id="AUX051", domain="pronoun", name="Ignorative / interrogative-indefinite syncretism",
       gloss="Whether interrogatives ('who/what') double as indefinites ('someone/something') — an "
             "'ignorative' series. Partially derivable from WALS Indefinite Pronouns (interrogative-based).",
       q="Are interrogatives and indefinites syncretic (ignorative series)?", vs=["yes","no"],
       derive=("wals","46A",{"46A-1":"yes"})),  # 46A-1 = interrogative-based indefinites
  dict(id="AUX052", domain="verb", name="Verb–adjunct (coverb / light-verb) constructions",
       gloss="Whether predicates are built from an uninflecting coverb + a small closed class of "
             "inflecting light verbs (widespread in non-Pama-Nyungan Australia).",
       q="Are there verb-adjunct (coverb + light-verb) constructions?", vs=["yes","no"],
       derive=("gb","GB123",{"1":"yes","0":"no"})),
  dict(id="AUX053", domain="verb", name="Noun incorporation (intransitivizing)",
       gloss="Whether noun incorporation into the verb is a productive intransitivizing process.",
       q="Is productive intransitivizing noun incorporation present?", vs=["yes","no"],
       derive=("gb","GB124",{"1":"yes","0":"no"})),
]


def main():
    # Grambank values (from L1 matrix)
    l1 = json.load(open(OUT / "language-features-matrix.json"))
    gb_by_lang = {}
    for row in l1["languages"]:
        gb_by_lang[row["glottocode"]] = {fid: c["value"] for fid, c in row["cells"].items()}
    au_glotto = set(gb_by_lang.keys())

    # WALS values keyed (glottocode, param) -> code_id (reuse the supplement matrix)
    wm = json.load(open(OUT / "wals-supplement-matrix.json"))
    wals_by_lang = {}
    for row in wm["languages"]:
        au_glotto.add(row["glottocode"])
        wals_by_lang[row["glottocode"]] = {pid: c["code"] for pid, c in row["cells"].items()}

    # registry meta
    reg = json.load(open(ROOT / "registry/australian_languages_registry.json"))
    meta_by = {l["glottocode"]: l for l in reg["languoids"] if l.get("glottocode")}

    UNKNOWN = "?"

    def gbval(g, fid):
        v = gb_by_lang.get(g, {}).get(fid)
        if v in (None, "?", "", "N/A"):
            return None
        return v

    def derive_one(feat, g):
        d = feat["derive"]
        if d is None:
            return UNKNOWN, "manual"
        kind, sid, mapping = d
        if kind == "wals":
            code = wals_by_lang.get(g, {}).get(sid)
            if not code:
                return UNKNOWN, f"WALS {sid} (no value)"
            return mapping.get(code, UNKNOWN), f"WALS {sid}={code}"
        if kind == "gb":
            v = gbval(g, sid)
            if v is None:
                return UNKNOWN, f"Grambank {sid} (unknown)"
            return mapping.get(v, UNKNOWN), f"Grambank {sid}={v}"
        if kind == "derived":
            return derive_special(feat["id"], g)
        return UNKNOWN, "manual"

    def derive_special(aux_id, g):
        if aux_id == "AUX004":  # nouns vs pronouns different alignment
            n = wals_by_lang.get(g, {}).get("98A")
            p = wals_by_lang.get(g, {}).get("99A")
            if not n or not p:
                return UNKNOWN, "derived from WALS 98A/99A (missing)"
            same = (n[-1] == p[-1])  # crude: same numeric code = same alignment class
            return ("no" if same else "yes"), f"derived: WALS 98A={n} vs 99A={p}"
        if aux_id == "AUX005":  # hierarchy split: nouns ergative & pronouns accusative
            n = wals_by_lang.get(g, {}).get("98A")
            p = wals_by_lang.get(g, {}).get("99A")
            if not n or not p:
                return UNKNOWN, "derived from WALS 98A/99A (missing)"
            yes = (n == "98A-4" and p in ("99A-2", "99A-3", "99A-1"))
            return ("yes" if yes else "no"), f"derived: WALS 98A={n},99A={p}"
        if aux_id == "AUX008":  # case on nouns x pronouns
            nn = gbval(g, "GB070")   # noun core case
            pp = gbval(g, "GB071")   # pronoun core case
            if nn is None and pp is None:
                return UNKNOWN, "derived from Grambank GB070/GB071 (unknown)"
            nn = (nn == "1")
            pp = (pp == "1")
            if nn and pp:
                r = "both"
            elif nn:
                r = "nouns-only"
            elif pp:
                r = "pronouns-only"
            else:
                r = "neither"
            return r, f"derived: GB070={gb_by_lang[g].get('GB070')},GB071={gb_by_lang[g].get('GB071')}"
        if aux_id == "AUX011":  # 2nd-position clitic
            code = wals_by_lang.get(g, {}).get("101A")
            if not code:
                return UNKNOWN, "derived from WALS 101A (missing)"
            return ("yes" if code == "101A-3" else "no"), f"derived: WALS 101A={code}"
        if aux_id == "AUX012":  # A indexed on verb
            a1, a2 = gbval(g, "GB091"), gbval(g, "GB092")
            if a1 is None and a2 is None:
                return UNKNOWN, "derived from GB091/GB092 (unknown)"
            return ("yes" if (a1 == "1" or a2 == "1") else "no"), "derived: GB091/GB092"
        if aux_id == "AUX013":  # P indexed on verb
            p1, p2 = gbval(g, "GB093"), gbval(g, "GB094")
            if p1 is None and p2 is None:
                return UNKNOWN, "derived from GB093/GB094 (unknown)"
            return ("yes" if (p1 == "1" or p2 == "1") else "no"), "derived: GB093/GB094"
        if aux_id == "AUX043":  # numeral base
            dec, quin, vig, bp = (gbval(g, "GB333"), gbval(g, "GB334"),
                                  gbval(g, "GB335"), gbval(g, "GB336"))
            if all(x is None for x in (dec, quin, vig, bp)):
                return UNKNOWN, "derived from GB333-336 (unknown)"
            if bp == "1":
                return "body-part", "derived: GB336=1"
            if vig == "1":
                return "vigesimal", "derived: GB335=1"
            if quin == "1":
                return "quinary", "derived: GB334=1"
            if dec == "1":
                return "decimal", "derived: GB333=1"
            return "restricted/none", "derived: GB333-336 all 0"
        return UNKNOWN, "manual"

    # Build catalog (definitions) + per-language values
    catalog_out = []
    for f in CATALOG:
        d = f["derive"]
        if d is None:
            src = "manual (not derivable from current open data)"
        elif d[0] == "derived":
            src = "derived (see derivation_notes)"
        elif d[0] == "wals":
            src = f"WALS {d[1]}"
        else:
            src = f"Grambank {d[1]}"
        catalog_out.append({
            "id": f["id"],
            "name": f["name"],
            "gloss": f["gloss"],
            "coding_question": f["q"],
            "value_space": f["vs"],
            "domain": f["domain"],
            "derivation_source": src,
        })

    values_rows = []
    coded_per_feat = collections.Counter()
    langs = sorted(au_glotto)
    for g in langs:
        cells = {}
        coded = 0
        for f in CATALOG:
            val, note = derive_one(f, g)
            cells[f["id"]] = {"value": val, "derivation": note}
            if val != UNKNOWN:
                coded += 1
                coded_per_feat[f["id"]] += 1
        values_rows.append({
            "glottocode": g,
            "name": meta_by.get(g, {}).get("canonical_name"),
            "coded": coded,
            "total_features": len(CATALOG),
            "cells": cells,
        })

    # coverage per feature
    for c in catalog_out:
        c["coded_languages"] = coded_per_feat.get(c["id"], 0)
        c["coverage_pct"] = round(100 * coded_per_feat.get(c["id"], 0) / max(len(langs), 1), 1)

    catalog = {
        "_meta": {
            "layer": "L2-australia-extension",
            "kind": "aus-extension-catalog",
            "note": "Finer Australianist distinctions that Grambank compresses. INFRASTRUCTURE for "
                    "future grammar-mining. Values coded ONLY where derivable from already-acquired "
                    "open data (WALS + Grambank + Glottolog); coverage is honestly LOW. Undeciderable "
                    "categories (avoidance register, kinship dyads, initial dropping, ...) stay '?'.",
            "n_features": len(catalog_out),
            "n_languages": len(langs),
            "derivable_features": sum(1 for f in CATALOG if f["derive"] is not None),
            "manual_only_features": sum(1 for f in CATALOG if f["derive"] is None),
        },
        "features": catalog_out,
    }
    json.dump(catalog, open(OUT / "aus-extension-catalog.json", "w"), indent=1, ensure_ascii=False)

    values = {
        "_meta": {
            "layer": "L2-australia-extension",
            "kind": "aus-extension-values",
            "n_languages": len(langs),
            "n_features": len(CATALOG),
            "unknown_symbol": UNKNOWN,
        },
        "languages": values_rows,
    }
    json.dump(values, open(OUT / "aus-extension-values.json", "w"), indent=1, ensure_ascii=False)

    # honest coverage stats
    total_cells = len(langs) * len(CATALOG)
    coded_cells = sum(r["coded"] for r in values_rows)
    stats = {
        "n_features": len(CATALOG),
        "n_languages": len(langs),
        "derivable_features": catalog["_meta"]["derivable_features"],
        "manual_only_features": catalog["_meta"]["manual_only_features"],
        "total_cells": total_cells,
        "coded_cells": coded_cells,
        "overall_coded_pct": round(100 * coded_cells / total_cells, 1),
        "per_feature_coverage": {c["id"]: c["coverage_pct"] for c in catalog_out},
    }
    json.dump(stats, open(OUT / "layer2-stats.json", "w"), indent=1)
    print("LAYER 2 built:")
    print(f"  features: {len(CATALOG)} ({stats['derivable_features']} derivable, "
          f"{stats['manual_only_features']} manual-only)")
    print(f"  languages: {len(langs)}")
    print(f"  overall coded coverage: {stats['overall_coded_pct']}%  ({coded_cells}/{total_cells} cells)")
    print("  (coverage is expected to be LOW — this catalog is infrastructure for future mining)")


if __name__ == "__main__":
    main()
