export type CountryResource = {
  slug: string;
  title: string;
  group: string;
  scientificName: string;
  status: string;
  introduction: string;
  identification: string;
  habitat: string;
  biology: string[];
  foodAndUse: string;
  westernYalanjiRecord: string;
  otherCountryRecord?: string;
  otherCountryHeading?: string;
  partsAndMaterials?: string;
};

export const resources: CountryResource[] = [
  {
    slug: 'freshwater-crocodile',
    title: 'Freshwater crocodile',
    group: 'Reptile',
    scientificName: 'Crocodylus johnstoni',
    status: 'Named on the station page',
    introduction: 'The freshwater crocodile is a river-dwelling crocodile of northern Australia. Karma Waters Station names freshwater crocodiles in its Mitchell River camping information.',
    identification: 'The station uses the common name “freshwater crocodile”, which Queensland sources use for Crocodylus johnstoni. The station photograph and caption are not a surveyed animal record, so the species of the pictured crocodile has not been confirmed.',
    habitat: 'Freshwater crocodiles live in rivers, billabongs and lagoons across northern Australia, including Queensland. They may also occur in the freshwater reaches of rivers that run to the coast.',
    biology: [
      'They have a narrower snout and are generally smaller than estuarine crocodiles. Adults eat fish and other small animals; young crocodiles feed on small aquatic animals and insects.',
      'Females lay eggs in a nest on land. Nesting and hatching depend on seasonal conditions, so observations from another river should not be treated as a timing record for the Mitchell River.',
      'Freshwater crocodiles can bite when approached or handled. Give them space and follow local crocodile-safety advice around the river.',
    ],
    foodAndUse: 'The material gathered for this page does not document a Western Yalanji practice of hunting or eating freshwater crocodiles at Karma Waters. No such use is inferred from the species living in the river.',
    westernYalanjiRecord: 'No Western Yalanji name or locally attributed use has been entered. The page records the English station caption only.',
  },
  {
    slug: 'black-bream',
    title: 'Black Bream',
    group: 'Freshwater fish',
    scientificName: 'Hephaestus fuliginosus (sooty grunter; likely match)',
    status: 'Station name; likely species match, pictured fish unverified',
    introduction: '“Black Bream” is the name used for a fish on the Karma Waters Station page. In northern Australian rivers, that name is also used for the sooty grunter, Hephaestus fuliginosus. Queensland records list sooty grunter in the Mitchell River, making it a strong regional match for the station name.',
    identification: 'Black Bream is a common name, not a precise identification by itself. Sooty grunter are sturdy freshwater fish, usually dark grey to sooty brown, with darker edges to their scales; large fish may develop thick, fleshy lips. Queensland sources use “black bream” for this species and record sooty grunter in the Mitchell River. The station page gives no specimen, date or capture location, so the pictured fish cannot be confirmed from its caption alone.',
    habitat: 'Sooty grunter live in northern Australian freshwater rivers. The Mitchell is a year-round river with long, deep waterholes, channels and lagoons. Fish surveys in the Mitchell catchment record sooty grunter among its river fish. In other studied rivers, the species is often associated with rocky reaches and deep pools; local habitat varies along the Mitchell.',
    biology: [
      'They are omnivores. Recorded foods include frogs, aquatic invertebrates, algae, roots and fallen fruit. Their diet shifts with what is available in the river and season.',
      'They lay eggs on the river bottom. Research elsewhere in northern Australia associates spawning with summer rain and rising water; the exact timing and spawning places for fish around Karma Waters have not been established.',
      'A Queensland freshwater survey found sooty grunter among the fish commonly encountered by recreational fishers in the Mitchell River. This is a modern fisheries record, separate from accounts of Aboriginal fishing and food use.',
    ],
    foodAndUse: 'Sooty grunter is recorded as food in several Aboriginal knowledge sources, although the detailed practices documented so far come from other Countries. A Bilinarra dictionary describes it as a favoured fish because its flesh is tasty. Bilinarra people caught it on baited hand-lines in creeks and waterholes, then roasted it over hot coals or cooked it on a stove. A separate Djelk food inventory from Arnhem Land also lists sooty grunter as eaten. These records show that people fished for, valued and prepared this fish as food; they do not establish that Western Yalanji people used the same gear or cooking methods.',
    westernYalanjiRecord: 'The station’s English label and the Mitchell River species records do not tell us how Western Yalanji people named, caught, cooked or shared this fish. No Western Yalanji method has been supplied from another community’s account.',
    otherCountryHeading: 'How people related to it elsewhere',
    otherCountryRecord: 'The Bilinarra account gives unusually practical detail: the fish was common in creeks and waterholes, took bait readily, and was caught on hand-lines. The flesh was roasted on hot coals (a Bilinarra cooking term is recorded for that method) or cooked on a stove. That last detail shows food practice continuing with newer cooking equipment. In a Djelk Aboriginal food inventory, the same species is listed as food.\n\nThe fish also appears in Western Arnhem Land art. The National Gallery of Victoria describes a bark painting called Dunbuhman, made around 1948, as depicting this species. It identifies the image as a mayh: a food-animal image reflecting close knowledge of animals hunted, cut up and eaten. This is an Arnhem Land record and artwork, not a Western Yalanji painting or local account.',
  },
  {
    slug: 'mitchell-river-prawn-cherapin',
    title: 'Cherapin (cherabin)',
    group: 'Freshwater prawn',
    scientificName: 'Macrobrachium species; exact species unknown',
    status: 'Station name; species not identified',
    introduction: 'Karma Waters Station calls the animal in its photograph “Mitchell River Prawn or Cherapin”. Cherabin is a common name used for large freshwater prawns in the genus Macrobrachium. The spelling “Cherapin” is the station’s spelling; this page uses “cherabin” as the broader common-name form.',
    identification: 'Several prawns may be called cherabin. The native northern Australian giant river prawn Macrobrachium spinipes is one possibility, but Queensland fishing guidance also uses cherabin for M. lar and M. rosenbergii. The station caption and photograph do not show the details needed to choose between species.',
    habitat: 'Large Macrobrachium prawns live in rivers and other freshwater habitats. Some species need connected freshwater and estuarine habitat: their young develop in brackish water before growing in fresh water. A life-history study found wet-season breeding in M. spinipes in the Daly River; that timing has not been confirmed for the Mitchell River animal.',
    biology: [
      'Freshwater prawns have a hard outer covering and long pairs of claws. They moult as they grow, leaving the old outer covering behind.',
      'Macrobrachium prawns are opportunistic feeders and scavengers. Their food can include small animals and plant or animal material from the riverbed; the diet of the station animal has not been studied.',
      'In species with brackish-water larvae, river flows help connect adult freshwater habitat with the estuary. Changes to river flow can affect the movement and survival of prawns.',
    ],
    foodAndUse: 'Cherabin are eaten by First Nations peoples in northern Australia. A public account from Hope Vale describes catching cherabin and cooking them over a fire. It does not give a detailed catching technique, and Hope Vale is another Country; this is not evidence of a Western Yalanji recipe or method.',
    westernYalanjiRecord: 'The material gathered so far does not describe how Western Yalanji people at Karma Waters caught, prepared or shared cherabin. No local method has been filled in from another community’s account.',
    otherCountryRecord: 'Mitchell River Traditional Custodians describe how seasons shape hunting, food gathering, travel and the use of stored foods. Their seasonal account does not say how people caught or cooked cherabin, so no local method has been guessed here. The station says it closes recreation access from 1 December to 1 April to protect fish and prawn spawning; that is the station’s seasonal rule, not a study that identifies this prawn’s spawning dates.',
    partsAndMaterials: 'A prawn does not have a mollusc shell; it has a jointed outer covering. Cape York records describe people using large oyster and other mollusc shells as containers, tools and pigment palettes. At Bathurst Head, for example, a blacklip oyster shell was used as a palette for painting. That answers the shell-painting possibility for shellfish, but it is not evidence that cherabin outer coverings were used for painting at Karma Waters.',
  },
];
