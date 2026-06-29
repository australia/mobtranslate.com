/** MobTranslate design system — warm, editorial, matches mobtranslate.com.
 *  Serif display (Playfair) + Inter body. Large for older eyes, but crafted. */
export const C = {
  bg: '#F7F1E8',        // warm paper
  surface: '#FFFFFF',
  ink: '#241C16',       // deep warm ink
  muted: '#6E6155',
  faint: '#9C8E80',
  ochre: '#B45E2A',
  ochreDeep: '#8E481F',
  ground: '#2A1712',    // dark warm (logo ground)
  gold: '#D98A3C',
  goldSoft: '#F3E4D2',
  border: '#EADFD1',
  hair: '#F0E8DC',
  danger: '#B23A2A',
  success: '#2E7D32',
  white: '#FFFFFF',
};

/** Font families (loaded in app/_layout via expo-google-fonts). */
export const F = {
  display: 'PlayfairDisplay_700Bold',
  displayBlack: 'PlayfairDisplay_800ExtraBold',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

export const S = {
  hero: 44,
  display: 34,
  title: 27,
  heading: 22,
  body: 18,
  label: 16,
  small: 13,
  eyebrow: 12,
  button: 18,
};

export const radius = { sm: 10, md: 14, lg: 22, xl: 30, pill: 999 };

/** Soft warm elevation. */
export const shadow = {
  shadowColor: '#3A2415',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
};
