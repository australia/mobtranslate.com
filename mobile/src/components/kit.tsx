import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { C, S, radius } from '../lib/theme';
import { ttsUrl, type Language } from '../lib/api';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const inner = (
    <View style={{ padding: 20, paddingBottom: 40, gap: 18 }}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}
export function Sub({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sub}>{children}</Text>;
}

export function BigButton({
  label, onPress, icon, tone = 'primary', disabled, loading, style,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const bg = tone === 'primary' ? C.ochre : tone === 'danger' ? C.danger : C.surface;
  const fg = tone === 'ghost' ? C.ochre : C.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderWidth: tone === 'ghost' ? 2 : 0, borderColor: C.ochre },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={24} color={fg} />}
          <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Big tappable speaker — plays the neural/donor pronunciation for the text. */
export function SpeakerButton({ code, text, big }: { code: string; text: string; big?: boolean }) {
  const ref = useRef<AudioPlayer | null>(null);
  const [busy, setBusy] = useState(false);
  const sz = big ? 30 : 22;

  const play = useCallback(() => {
    if (!text?.trim() || !code) return;
    try {
      ref.current?.remove();
      const p = createAudioPlayer({ uri: ttsUrl(code, text) });
      ref.current = p;
      setBusy(true);
      p.play();
      // We don't depend on a status event; clear the spinner after a moment.
      setTimeout(() => setBusy(false), 5000);
    } catch {
      setBusy(false);
    }
  }, [code, text]);

  useEffect(() => () => { ref.current?.remove(); }, []);

  return (
    <Pressable
      onPress={play}
      hitSlop={10}
      style={({ pressed }) => [
        styles.speaker,
        { width: sz + 26, height: sz + 26, opacity: pressed ? 0.7 : 1 },
      ]}
      accessibilityLabel="Hear pronunciation"
    >
      {busy ? <ActivityIndicator color={C.ochre} /> : <Ionicons name="volume-high" size={sz} color={C.ochre} />}
    </Pressable>
  );
}

/** Horizontal language chooser (large pills). */
export function LangPicker({
  languages, value, onChange,
}: {
  languages: Language[];
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
      {languages.map((l) => {
        const active = l.code === value;
        return (
          <Pressable
            key={l.code}
            onPress={() => onChange(l.code)}
            style={[styles.pill, active ? styles.pillActive : styles.pillIdle]}
          >
            <Text style={[styles.pillText, { color: active ? C.white : C.ink }]}>{l.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: S.title, fontWeight: '800', color: C.ink },
  sub: { fontSize: S.label, color: C.muted, lineHeight: 24 },
  btn: {
    minHeight: 60, borderRadius: radius.md, flexDirection: 'row', gap: 10,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18,
  },
  btnText: { fontSize: S.button, fontWeight: '700' },
  card: {
    backgroundColor: C.surface, borderRadius: radius.lg, padding: 18,
    borderWidth: 1, borderColor: C.border,
  },
  speaker: {
    borderRadius: radius.pill, backgroundColor: C.ochreSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  pill: { paddingHorizontal: 18, height: 46, borderRadius: radius.pill, justifyContent: 'center', borderWidth: 1 },
  pillActive: { backgroundColor: C.ochre, borderColor: C.ochre },
  pillIdle: { backgroundColor: C.surface, borderColor: C.border },
  pillText: { fontSize: S.label, fontWeight: '700' },
});
