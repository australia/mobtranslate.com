import { useEffect } from 'react';
import { Pressable, View, type PressableProps, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

const APressable = Animated.createAnimatedComponent(Pressable);

/** A Pressable that springs down on press — the base feel for every tap target.
 *  Optional light haptic on press-in. */
export function PressableScale({
  children, style, scaleTo = 0.96, haptic = true, onPress, ...rest
}: PressableProps & { style?: ViewStyle | ViewStyle[]; scaleTo?: number; haptic?: boolean }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      onPressIn={() => { s.value = withSpring(scaleTo, { damping: 18, stiffness: 320 }); if (haptic) Haptics.selectionAsync().catch(() => {}); }}
      onPressOut={() => { s.value = withSpring(1, { damping: 15, stiffness: 260 }); }}
      onPress={onPress}
      style={[anim, style as any]}
      {...rest}
    >
      {children as any}
    </APressable>
  );
}

const ACircle = Animated.createAnimatedComponent(Circle);

/** A warm progress ring (0→1). Non-numeric encouragement lives around it; this
 *  just draws the arc filling. */
export function ProgressRing({
  progress, size = 64, stroke = 6, track = '#E7EEE3', color = '#324E3B', children,
}: {
  progress: number; size?: number; stroke?: number; track?: string; color?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = useSharedValue(0);
  useEffect(() => { p.value = withTiming(Math.max(0, Math.min(1, progress)), { duration: 720, easing: Easing.out(Easing.cubic) }); }, [progress]);
  const animProps = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - p.value) }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <ACircle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={circ} animatedProps={animProps}
        />
      </Svg>
      {children}
    </View>
  );
}
