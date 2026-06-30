import { Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { C, F } from '../lib/theme';

/** Concentric "Country" mark — topographic rings on a cream disc. */
export function CountryMark({ size = 34 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="disc" cx="50%" cy="42%" r="65%">
          <Stop offset="0" stopColor="#FBF8F0" />
          <Stop offset="1" stopColor="#EAF0E4" />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="48" fill="url(#disc)" stroke={C.sageLine} strokeWidth="1.5" />
      {/* topographic contour rings, gently offset to feel hand-drawn */}
      <Circle cx="48" cy="53" r="38" fill="none" stroke={C.sageSoft} strokeWidth="3" />
      <Circle cx="49" cy="52" r="29" fill="none" stroke={C.sage} strokeWidth="3" />
      <Circle cx="50" cy="51" r="20" fill="none" stroke="#4E7156" strokeWidth="3" />
      <Circle cx="51" cy="50" r="11" fill="none" stroke={C.forest} strokeWidth="3" />
      <Circle cx="51" cy="50" r="4.5" fill={C.forest} />
    </Svg>
  );
}

/** Header lockup: mark + name + tagline. */
export function BrandLockup({ compact }: { compact?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <CountryMark size={compact ? 30 : 36} />
      <View>
        <Text style={{ fontFamily: F.bold, fontSize: compact ? 16 : 18, color: C.ink, letterSpacing: 0.1 }}>
          Mob Translate
        </Text>
        {!compact && (
          <Text style={{ fontFamily: F.medium, fontSize: 11.5, color: C.muted, marginTop: 1 }}>
            Community-built. Country-owned.
          </Text>
        )}
      </View>
    </View>
  );
}
