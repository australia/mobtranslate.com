/** MobTranslate design system — "Country & language", warm + airy.
 *  Sage-eucalyptus greens on cream paper, watercolour imagery, warm ochre accents.
 *  Fraunces (soft editorial serif) for display + Inter for UI. Generous, calm, for all ages. */
export const C = {
  bg: '#F4F1E8',        // warm paper
  surface: '#FFFFFF',
  surfaceAlt: '#FBF9F2', // faint warm panel
  ink: '#26302A',        // deep green-charcoal
  muted: '#5F6B62',      // secondary text (AA on white) + placeholders
  faint: '#9AA39A',      // decorative icons / dividers only

  // greens — the primary identity
  forest: '#324E3B',     // deep eucalyptus — primary, CTA, active tab
  forestDeep: '#22382A', // darkest green (hero text, CTA ground top)
  sage: '#6F8C73',       // mid sage — secondary serif accents
  sageSoft: '#E7EEE3',   // pale green wash — chips, active pills, highlights
  sageLine: '#D2DECE',   // green hairline / selected card border

  // warm accents
  clay: '#B0673B',       // ochre-terracotta — "speak", small accents
  claySoft: '#F0E4D5',
  gold: '#C68A4A',
  sky: '#7E9DAE',        // muted blue accent

  // lines
  border: '#E5DFD2',
  hair: '#EFEADD',

  // status
  danger: '#B2483A',
  success: '#3E7D52',
  white: '#FFFFFF',
  cream: '#F7F3EA',
};

/** Font families (loaded in app/_layout via @expo-google-fonts). */
export const F = {
  display: 'Fraunces_600SemiBold',         // headings
  displayBold: 'Fraunces_700Bold',
  serif: 'Fraunces_400Regular',
  serifItalic: 'Fraunces_400Regular_Italic',
  serifMedItalic: 'Fraunces_500Medium_Italic',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

export const S = {
  hero: 40,
  display: 30,
  title: 25,
  heading: 21,
  body: 17,
  label: 15,
  small: 13,
  eyebrow: 11,
  button: 17,
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

/** Soft, low warm elevation — cards barely lift off the paper. */
export const shadow = {
  shadowColor: '#2A3A2A',
  shadowOpacity: 0.07,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
};

/** Per-language accent + generated artwork, for cards/maps. */
export const LANG_ART: Record<string, { art: any; map: any; tint: string }> = {
  kuku_yalanji: { art: require('../../assets/images/gen/lang-kuku_yalanji.jpg'), map: require('../../assets/images/gen/map-kuku_yalanji.jpg'), tint: '#E7EEE3' },
  anindilyakwa: { art: require('../../assets/images/gen/lang-anindilyakwa.jpg'), map: require('../../assets/images/gen/map-anindilyakwa.jpg'), tint: '#E6EDEE' },
  migmaq:       { art: require('../../assets/images/gen/lang-migmaq.jpg'),       map: require('../../assets/images/gen/map-migmaq.jpg'),       tint: '#E8EBEE' },
  wbv:          { art: require('../../assets/images/gen/lang-wajarri.jpg'),      map: require('../../assets/images/gen/map-wajarri.jpg'),      tint: '#F0E7DA' },
};
