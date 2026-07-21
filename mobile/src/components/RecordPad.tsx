import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { C, F, S, radius, shadow } from '../lib/theme';
import type { Accent } from '../lib/accent';
import { Waveform } from './audioviz';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.max(0, Math.floor(s % 60)).toString().padStart(2, '0')}`;

/** The signature record moment (#4): a mic orb that breathes when idle and
 *  pulses to your actual voice level while recording (halo scales with `level`,
 *  a smoothed 0→1 mic amplitude), with a live waveform + timer beneath it. */
export function RecordOrb({
  recording, level, seconds, onToggle, hint, accent,
}: {
  recording: boolean; level: SharedValue<number>; seconds: number; onToggle: () => void; hint: string; accent: Accent;
}) {
  // Gentle idle breathing; while recording the halo does the work instead.
  const idle = useSharedValue(1);
  useEffect(() => {
    if (recording) { idle.value = withTiming(1, { duration: 200 }); }
    else { idle.value = withRepeat(withTiming(1.05, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true); }
  }, [recording]);

  const halo1 = useAnimatedStyle(() => ({ transform: [{ scale: 1 + level.value * 0.55 }], opacity: 0.28 + level.value * 0.3 }));
  const halo2 = useAnimatedStyle(() => ({ transform: [{ scale: 1 + level.value * 1.05 }], opacity: 0.12 + level.value * 0.22 }));
  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: recording ? 1 + level.value * 0.06 : idle.value }] }));

  // REC dot slow pulse
  const dot = useSharedValue(1);
  useEffect(() => {
    if (recording) dot.value = withRepeat(withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
    else dot.value = withTiming(1, { duration: 150 });
  }, [recording]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: dot.value }));

  return (
    <View style={{ alignItems: 'center', gap: 14, paddingVertical: 6 }}>
      <View style={{ width: 168, height: 168, alignItems: 'center', justifyContent: 'center' }}>
        {recording && (
          <>
            <Animated.View style={[styles.halo, { width: 168, height: 168, borderRadius: 84, backgroundColor: accent.accentSoft }, halo2]} />
            <Animated.View style={[styles.halo, { width: 128, height: 128, borderRadius: 64, backgroundColor: accent.accentSoft }, halo1]} />
          </>
        )}
        <Animated.View style={orbStyle}>
          <Pressable onPress={onToggle}>
            <View style={[styles.orb, shadow, { backgroundColor: recording ? accent.accentDeep : C.forest }]}>
              <Ionicons name={recording ? 'stop' : 'mic'} size={44} color={C.white} />
            </View>
          </Pressable>
        </Animated.View>
      </View>

      {recording ? (
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Waveform active color={accent.accent} level={level} bars={9} height={30} width={3.5} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Animated.View style={[styles.recDot, dotStyle]} />
            <Text style={styles.timer}>{fmt(seconds)}  ·  tap to stop</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.hint}>{hint}</Text>
      )}
    </View>
  );
}

/** Review a just-recorded clip: play/pause, a live waveform, and a scrub bar you
 *  can drag to seek (#4). Mount with `key={uri}` so a new take resets cleanly. */
export function ReviewBar({ uri, accent }: { uri: string; accent: Accent }) {
  const player = useAudioPlayer({ uri }, { updateInterval: 90 });
  const status = useAudioPlayerStatus(player);
  const dur = status.duration || 0;
  const [scrub, setScrub] = useState<number | null>(null);
  const [width, setWidth] = useState(1);
  const playing = status.playing;
  const frac = scrub ?? (dur ? clamp01(status.currentTime / dur) : 0);

  function toggle() {
    if (playing) { player.pause(); return; }
    if (status.didJustFinish || (dur && status.currentTime >= dur - 0.05)) player.seekTo(0);
    player.play();
  }
  function seekTo(f: number) { setScrub(null); if (dur) player.seekTo(clamp01(f) * dur); }

  const pan = Gesture.Pan()
    .onBegin((e) => { runOnJS(setScrub)(clamp01(e.x / width)); })
    .onUpdate((e) => { runOnJS(setScrub)(clamp01(e.x / width)); })
    .onEnd((e) => { runOnJS(seekTo)(clamp01(e.x / width)); });
  const tap = Gesture.Tap().onEnd((e) => { runOnJS(seekTo)(clamp01(e.x / width)); });
  const gesture = Gesture.Simultaneous(pan, tap);

  const remaining = Math.max(0, dur - (frac * dur));

  return (
    <View style={[styles.review, { borderColor: accent.accentLine }]}>
      <Pressable onPress={toggle} style={[styles.playBtn, { backgroundColor: accent.accent }]}>
        <Ionicons name={playing ? 'pause' : 'play'} size={22} color={C.white} style={playing ? undefined : { marginLeft: 2 }} />
      </Pressable>
      <View style={{ flex: 1, gap: 8 }}>
        <Waveform active={playing} color={accent.accent} bars={7} height={20} width={3} />
        <GestureDetector gesture={gesture}>
          <View style={styles.trackHit} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${frac * 100}%`, backgroundColor: accent.accent }]} />
              <View style={[styles.knob, { left: `${frac * 100}%`, borderColor: accent.accent }]} />
            </View>
          </View>
        </GestureDetector>
      </View>
      <Text style={styles.time}>{dur ? fmt(remaining) : '·'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { position: 'absolute' },
  orb: { width: 108, height: 108, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.danger },
  timer: { fontFamily: F.semibold, fontSize: S.label, color: C.muted },
  hint: { fontFamily: F.medium, fontSize: S.label, color: C.muted },

  review: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, padding: 12 },
  playBtn: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  trackHit: { paddingVertical: 8, justifyContent: 'center' },
  track: { height: 5, borderRadius: 3, backgroundColor: C.sageSoft, justifyContent: 'center' },
  fill: { height: 5, borderRadius: 3 },
  knob: { position: 'absolute', width: 15, height: 15, borderRadius: 8, backgroundColor: C.white, borderWidth: 3, marginLeft: -7, ...shadow },
  time: { fontFamily: F.body, fontSize: S.small, color: C.muted, minWidth: 34, textAlign: 'right' },
});
