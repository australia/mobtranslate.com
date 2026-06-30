import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { C, F, S, radius, shadow, LANG_ART } from '../lib/theme';
import { ttsUrl, type Language } from '../lib/api';
import { langMeta } from '../lib/langMeta';
import { BrandLockup } from './brand';

const tap = () => { Haptics.selectionAsync().catch(() => {}); };
const tapHeavy = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

/* ───────────────────────── layout ───────────────────────── */

export function Screen({
  children, scroll = true, edges = ['top'], pad = true,
}: { children: React.ReactNode; scroll?: boolean; edges?: Edge[]; pad?: boolean }) {
  const inner = <View style={[pad && styles.pad, { gap: 18 }]}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll
        ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}>{inner}</ScrollView>
        : inner}
    </SafeAreaView>
  );
}

/** Brand top bar — mark + name + tagline, optional search / profile actions. */
export function TopBar({ onSearch, onProfile, compact }: { onSearch?: () => void; onProfile?: () => void; compact?: boolean }) {
  return (
    <View style={styles.topbar}>
      <BrandLockup compact={compact} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {onSearch && <RoundIcon name="search" onPress={onSearch} />}
        {onProfile && <RoundIcon name="person-outline" onPress={onProfile} />}
      </View>
    </View>
  );
}

function RoundIcon({ name, onPress }: { name: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => [styles.roundIcon, pressed && { backgroundColor: C.sageSoft }]}>
      <Ionicons name={name} size={19} color={C.ink} />
    </Pressable>
  );
}

/* ───────────────────────── surfaces ───────────────────────── */

export function Card({
  children, style, soft = true, tint, padded = true,
}: { children: React.ReactNode; style?: ViewStyle; soft?: boolean; tint?: string; padded?: boolean }) {
  return (
    <View style={[styles.card, padded && { padding: 18 }, tint ? { backgroundColor: tint } : null, soft && shadow, style]}>
      {children}
    </View>
  );
}

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && (
        <Pressable onPress={() => { tap(); onAction?.(); }} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={C.sage} />
        </Pressable>
      )}
    </View>
  );
}

/* ───────────────────────── text ───────────────────────── */

export function Display({ children, color = C.ink, style }: { children: React.ReactNode; color?: string; style?: any }) {
  return <Text style={[styles.display, { color }, style]} selectable>{children}</Text>;
}

export function ScreenTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.h1}>{title}</Text>
      {!!sub && <Text style={styles.sub}>{sub}</Text>}
    </View>
  );
}

/* ───────────────────────── chips & pills ───────────────────────── */

export function Chip({ label, icon, tone = 'sage' }: { label: string; icon?: keyof typeof Ionicons.glyphMap; tone?: 'sage' | 'clay' | 'plain' }) {
  const bg = tone === 'clay' ? C.claySoft : tone === 'plain' ? C.surface : C.sageSoft;
  const fg = tone === 'clay' ? C.clay : C.forest;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={13} color={fg} />}
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function LangPicker({ languages, value, onChange, onDark }: { languages: Language[]; value: string; onChange: (c: string) => void; onDark?: boolean }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {languages.map((l) => {
        const active = l.code === value;
        const idleBg = onDark ? 'rgba(255,255,255,0.12)' : C.surface;
        const idleText = onDark ? C.cream : C.ink;
        const idleBorder = onDark ? 'rgba(255,255,255,0.2)' : C.border;
        return (
          <Pressable key={l.code} onPress={() => { tap(); onChange(l.code); }}
            style={[styles.pill, active ? { backgroundColor: C.forest, borderColor: C.forest } : { backgroundColor: idleBg, borderColor: idleBorder }]}>
            <Text style={[styles.pillText, { color: active ? C.white : idleText }]}>{l.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ───────────────────────── buttons ───────────────────────── */

type Variant = 'primary' | 'ghost' | 'soft' | 'dark' | 'cream';
export function Button({
  label, onPress, icon, variant = 'primary', disabled, loading, style, full,
}: {
  label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap;
  variant?: Variant; disabled?: boolean; loading?: boolean; style?: ViewStyle; full?: boolean;
}) {
  const map: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: C.forest, fg: C.white },
    dark: { bg: C.forestDeep, fg: C.cream },
    soft: { bg: C.sageSoft, fg: C.forest },
    cream: { bg: C.cream, fg: C.forest },
    ghost: { bg: 'transparent', fg: C.forest, border: C.sageLine },
  };
  const v = map[variant];
  const bg = disabled ? C.border : v.bg;
  const fg = disabled ? C.muted : v.fg;
  const elevated = (variant === 'primary' || variant === 'dark') && !disabled;
  return (
    <Pressable
      onPress={() => { if (!disabled && !loading) { tapHeavy(); onPress(); } }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn, elevated && shadow, full && { alignSelf: 'stretch' },
        { backgroundColor: bg, transform: [{ scale: pressed ? 0.98 : 1 }],
          borderWidth: v.border ? 1.5 : 0, borderColor: disabled ? C.border : v.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function SpeakerButton({ code, text, size = 'md' }: { code: string; text: string; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<AudioPlayer | null>(null);
  const [busy, setBusy] = useState(false);
  const box = size === 'lg' ? 52 : size === 'sm' ? 36 : 44;
  const icon = size === 'lg' ? 24 : size === 'sm' ? 17 : 20;
  const play = useCallback(() => {
    if (!text?.trim() || !code) return;
    tap();
    try {
      ref.current?.remove();
      const p = createAudioPlayer({ uri: ttsUrl(code, text) });
      ref.current = p; setBusy(true); p.play();
      setTimeout(() => setBusy(false), 5000);
    } catch { setBusy(false); }
  }, [code, text]);
  useEffect(() => () => { ref.current?.remove(); }, []);
  return (
    <Pressable onPress={play} hitSlop={8}
      style={({ pressed }) => [styles.speaker, { width: box, height: box, transform: [{ scale: pressed ? 0.9 : 1 }] }]}
      accessibilityLabel="Hear it">
      {busy ? <ActivityIndicator color={C.clay} size="small" /> : <Ionicons name="volume-medium" size={icon} color={C.clay} />}
    </Pressable>
  );
}

/* ───────────────────────── composite cards ───────────────────────── */

/** Explore-language card: artwork + name + region. */
export function LangCard({
  name, region, art, selected, onPress, style,
}: { name: string; region?: string; art?: any; selected?: boolean; onPress: () => void; style?: ViewStyle }) {
  return (
    <Pressable onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => [
        styles.langCard, selected && { borderColor: C.sage, borderWidth: 2 },
        pressed && { transform: [{ scale: 0.98 }] }, style,
      ]}>
      <View style={styles.langArtWrap}>
        {art ? <Image source={art} style={styles.langArt} /> : <View style={[styles.langArt, { backgroundColor: C.sageSoft }]} />}
      </View>
      <View style={{ padding: 12, gap: 2 }}>
        <Text style={styles.langName} numberOfLines={1}>{name}</Text>
        {!!region && <Text style={styles.langRegion} numberOfLines={1}>{region}</Text>}
      </View>
    </Pressable>
  );
}

/** Dark green call-to-action banner. */
export function CTABanner({ title, sub, cta, onPress }: { title: string; sub?: string; cta: string; onPress: () => void }) {
  return (
    <View style={styles.cta}>
      <View style={styles.ctaLeaf}><Ionicons name="leaf" size={18} color={C.cream} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.ctaTitle}>{title}</Text>
        {!!sub && <Text style={styles.ctaSub}>{sub}</Text>}
      </View>
      <Pressable onPress={() => { tapHeavy(); onPress(); }}
        style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}>
        <Text style={styles.ctaBtnText}>{cta}</Text>
      </Pressable>
    </View>
  );
}

/** Bottom-sheet language ("tribe") selector — sets the app-wide language. */
export function LanguageSelector({
  visible, languages, value, onSelect, onClose,
}: { visible: boolean; languages: Language[]; value: string; onSelect: (c: string) => void; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetGrip} />
          <Text style={styles.sheetTitle}>Choose a language</Text>
          <Text style={styles.sheetSub}>This sets the language across the whole app.</Text>
          <ScrollView style={{ marginTop: 8 }} showsVerticalScrollIndicator={false}>
            {languages.map((l) => {
              const active = l.code === value;
              const m = langMeta(l.code);
              const art = LANG_ART[l.code]?.art;
              return (
                <Pressable key={l.code} onPress={() => { tapHeavy(); onSelect(l.code); onClose(); }}
                  style={({ pressed }) => [styles.sheetRow, active && { backgroundColor: C.sageSoft }, pressed && { opacity: 0.7 }]}>
                  {art ? <Image source={art} style={styles.sheetArt} /> : <View style={[styles.sheetArt, { backgroundColor: C.sageSoft }]} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetName}>{l.name}</Text>
                    {!!m.region && <Text style={styles.sheetRegion}>{m.region}</Text>}
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={22} color={C.forest} />}
                </Pressable>
              );
            })}
            <View style={{ height: 12 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ───────────────────────── styles ───────────────────────── */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { paddingHorizontal: 20, paddingTop: 6 },

  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundIcon: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },

  card: { backgroundColor: C.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: C.hair },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  sectionAction: { fontFamily: F.semibold, fontSize: S.label, color: C.sage },

  display: { fontFamily: F.display, fontSize: S.hero, lineHeight: S.hero * 1.06 },
  h1: { fontFamily: F.display, fontSize: S.display, color: C.ink, lineHeight: S.display * 1.1 },
  sub: { fontFamily: F.serifItalic, fontSize: S.body, color: C.sage, lineHeight: 24 },

  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 30, borderRadius: radius.pill, alignSelf: 'flex-start' },
  chipText: { fontFamily: F.semibold, fontSize: S.small },

  pill: { paddingHorizontal: 16, height: 40, borderRadius: radius.pill, justifyContent: 'center', borderWidth: 1 },
  pillText: { fontFamily: F.semibold, fontSize: S.label },

  btn: { minHeight: 54, borderRadius: radius.md, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnText: { fontFamily: F.bold, fontSize: S.button },

  speaker: { borderRadius: radius.pill, backgroundColor: C.claySoft, alignItems: 'center', justifyContent: 'center' },

  langCard: { width: 150, backgroundColor: C.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: C.hair, overflow: 'hidden', ...shadow },
  langArtWrap: { height: 92, backgroundColor: C.sageSoft },
  langArt: { width: '100%', height: '100%' },
  langName: { fontFamily: F.display, fontSize: S.label + 2, color: C.ink },
  langRegion: { fontFamily: F.medium, fontSize: S.small, color: C.muted },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(20,28,22,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, maxHeight: '78%' },
  sheetGrip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.sageLine, marginBottom: 14 },
  sheetTitle: { fontFamily: F.display, fontSize: S.title, color: C.ink },
  sheetSub: { fontFamily: F.body, fontSize: S.small, color: C.muted, marginTop: 2 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, borderRadius: radius.md, marginTop: 4 },
  sheetArt: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: C.sageSoft },
  sheetName: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  sheetRegion: { fontFamily: F.medium, fontSize: S.small, color: C.muted, marginTop: 1 },

  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.forest, borderRadius: radius.lg, padding: 16 },
  ctaLeaf: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { fontFamily: F.semibold, fontSize: S.label + 1, color: C.cream },
  ctaSub: { fontFamily: F.body, fontSize: S.small, color: 'rgba(247,243,234,0.78)', marginTop: 2, lineHeight: 18 },
  ctaBtn: { backgroundColor: C.cream, paddingHorizontal: 16, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  ctaBtnText: { fontFamily: F.bold, fontSize: S.small + 1, color: C.forest },
});
