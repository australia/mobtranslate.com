import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { C, F, S, radius, shadow } from '../lib/theme';
import { ttsUrl, type Language } from '../lib/api';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const body = <View style={{ padding: 22, paddingBottom: 48, gap: 20 }}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{body}</ScrollView>
      ) : (
        <View style={{ flex: 1, padding: 22, paddingBottom: 0, gap: 18 }}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Editorial screen header: small kicker + serif title + sub. */
export function Header({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {!!kicker && <Text style={styles.kicker}>{kicker.toUpperCase()}</Text>}
      <Text style={styles.h1}>{title}</Text>
      {!!sub && <Text style={styles.sub}>{sub}</Text>}
    </View>
  );
}

export function Display({ children, color = C.ink, style }: { children: React.ReactNode; color?: string; style?: any }) {
  return <Text style={[styles.display, { color }, style]} selectable>{children}</Text>;
}

export function Card({ children, style, soft }: { children: React.ReactNode; style?: ViewStyle; soft?: boolean }) {
  return <View style={[styles.card, soft && shadow, style]}>{children}</View>;
}

export function BigButton({
  label, onPress, icon, tone = 'primary', disabled, loading, style,
}: {
  label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'primary' | 'ghost' | 'dark'; disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  const bg = tone === 'primary' ? C.ochre : tone === 'dark' ? C.ground : 'transparent';
  const fg = tone === 'ghost' ? C.ochre : C.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.86 : 1,
          borderWidth: tone === 'ghost' ? 1.5 : 0, borderColor: C.ochre },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Ionicons name={icon} size={20} color={fg} />}
          <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function SpeakerButton({ code, text, big }: { code: string; text: string; big?: boolean }) {
  const ref = useRef<AudioPlayer | null>(null);
  const [busy, setBusy] = useState(false);
  const sz = big ? 26 : 20;
  const box = big ? 56 : 44;
  const play = useCallback(() => {
    if (!text?.trim() || !code) return;
    try {
      ref.current?.remove();
      const p = createAudioPlayer({ uri: ttsUrl(code, text) });
      ref.current = p; setBusy(true); p.play();
      setTimeout(() => setBusy(false), 5000);
    } catch { setBusy(false); }
  }, [code, text]);
  useEffect(() => () => { ref.current?.remove(); }, []);
  return (
    <Pressable onPress={play} hitSlop={10}
      style={({ pressed }) => [styles.speaker, { width: box, height: box, opacity: pressed ? 0.7 : 1 }]}
      accessibilityLabel="Hear it">
      {busy ? <ActivityIndicator color={C.ochre} /> : <Ionicons name="volume-high" size={sz} color={C.ochre} />}
    </Pressable>
  );
}

export function LangPicker({ languages, value, onChange }: { languages: Language[]; value: string; onChange: (c: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingVertical: 2 }}>
      {languages.map((l) => {
        const active = l.code === value;
        return (
          <Pressable key={l.code} onPress={() => onChange(l.code)} style={[styles.pill, active ? styles.pillOn : styles.pillOff]}>
            <Text style={[styles.pillText, { color: active ? C.white : C.ink }]}>{l.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Small brand chip (the M icon) for headers. */
export function Brand({ size = 30 }: { size?: number }) {
  return (
    <Image source={require('../../assets/images/icon.png')}
      style={{ width: size, height: size, borderRadius: size * 0.23 }} />
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.ochre },
  h1: { fontFamily: F.display, fontSize: S.display, color: C.ink, lineHeight: S.display * 1.1 },
  sub: { fontFamily: F.body, fontSize: S.label, color: C.muted, lineHeight: 24 },
  display: { fontFamily: F.display, fontSize: S.hero, lineHeight: S.hero * 1.05 },
  card: { backgroundColor: C.surface, borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: C.hair },
  btn: { minHeight: 58, borderRadius: radius.md, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnText: { fontFamily: F.bold, fontSize: S.button },
  speaker: { borderRadius: radius.pill, backgroundColor: C.goldSoft, alignItems: 'center', justifyContent: 'center' },
  pill: { paddingHorizontal: 18, height: 46, borderRadius: radius.pill, justifyContent: 'center', borderWidth: 1 },
  pillOn: { backgroundColor: C.ochre, borderColor: C.ochre },
  pillOff: { backgroundColor: C.surface, borderColor: C.border },
  pillText: { fontFamily: F.semibold, fontSize: S.label },
});
