import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, S, radius } from '../lib/theme';

type Tone = 'dictionary' | 'machine' | 'reviewed' | 'working' | 'cultural';
type IconName = ComponentProps<typeof Ionicons>['name'];

const TONES: Record<Tone, { accent: string; soft: string; icon: IconName }> = {
  dictionary: { accent: C.forest, soft: C.sageSoft, icon: 'book-outline' },
  machine: { accent: C.clay, soft: C.claySoft, icon: 'sparkles-outline' },
  reviewed: { accent: C.success, soft: C.sageSoft, icon: 'shield-checkmark-outline' },
  working: { accent: C.gold, soft: C.claySoft, icon: 'hourglass-outline' },
  cultural: { accent: C.clay, soft: C.claySoft, icon: 'hand-left-outline' },
};

interface ProvenancePanelProps {
  tone: Tone;
  eyebrow: string;
  title: string;
  body: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** A consistent, plain-language trail for where knowledge came from and how it
 * has been reviewed. This is part of the content hierarchy, not a disclaimer. */
export function ProvenancePanel({
  tone,
  eyebrow,
  title,
  body,
  detail,
  actionLabel,
  onAction,
}: ProvenancePanelProps) {
  const treatment = TONES[tone];

  return (
    <View style={[styles.panel, { borderColor: treatment.accent }]}>
      <View style={[styles.icon, { backgroundColor: treatment.soft }]}>
        <Ionicons name={treatment.icon} size={21} color={treatment.accent} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: treatment.accent }]}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            hitSlop={4}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.62 }]}
          >
            <Text style={[styles.actionText, { color: treatment.accent }]}>{actionLabel}</Text>
            <Ionicons name="arrow-forward" size={14} color={treatment.accent} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderLeftWidth: 3,
    borderRadius: radius.md,
    backgroundColor: C.surfaceAlt,
    padding: 14,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 4 },
  eyebrow: { fontFamily: F.bold, fontSize: 10, letterSpacing: 1.2 },
  title: { fontFamily: F.display, fontSize: S.body, color: C.ink, lineHeight: 23 },
  body: { fontFamily: F.body, fontSize: S.small, color: C.muted, lineHeight: 19 },
  detail: { fontFamily: F.medium, fontSize: 12, color: C.inkSoft, lineHeight: 18, marginTop: 2 },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, marginTop: 1 },
  actionText: { fontFamily: F.bold, fontSize: S.small },
});
