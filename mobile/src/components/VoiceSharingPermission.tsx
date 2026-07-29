import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Button, Card } from './kit';
import {
  getPublicVoiceConsent,
  setPublicVoiceConsent,
  type PublicVoiceConsent,
} from '../lib/api';
import { C, F, S, radius } from '../lib/theme';

const PRIVACY_URL = 'https://mobtranslate.com/privacy';

function Choice({
  checked, title, detail, onPress,
}: {
  checked: boolean;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[styles.choice, checked && styles.choiceOn]}
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={26} color={checked ? C.forest : C.faint} />
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

/** The ordinary dictionary recorder grants only public dictionary playback.
 * Model, cloning, provider-transfer, metrics, and commercial permissions remain
 * off. The server is the source of truth; this component never caches consent. */
export function VoiceSharingPermission({
  languageId,
  languageName,
  onGranted,
}: {
  languageId: string;
  languageName: string;
  onGranted: (consent: PublicVoiceConsent) => void;
}) {
  const callback = useRef(onGranted);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [speakerConfirmed, setSpeakerConfirmed] = useState(false);
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => { callback.current = onGranted; }, [onGranted]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getPublicVoiceConsent(languageId)
      .then((consent) => {
        if (!active) return;
        if (consent.granted && consent.consentRecordId) callback.current(consent);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not check your permission.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [languageId, reload]);

  async function grant() {
    if (!speakerConfirmed || !authorityConfirmed) return;
    setSaving(true);
    setError(null);
    try {
      const consent = await setPublicVoiceConsent(languageId, true, {
        speakerConfirmed: true,
        sharingAuthorityConfirmed: true,
      });
      if (!consent.granted || !consent.consentRecordId) throw new Error('Permission was not saved.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      callback.current(consent);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your permission.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card style={styles.loadingCard}>
        <ActivityIndicator color={C.forest} />
        <Text style={styles.loadingText}>Checking your voice sharing choice…</Text>
      </Card>
    );
  }

  if (error && !speakerConfirmed && !authorityConfirmed) {
    return (
      <Card style={styles.loadingCard}>
        <Ionicons name="cloud-offline-outline" size={26} color={C.clay} />
        <Text style={styles.error}>{error}</Text>
        <Button label="Try again" icon="refresh" variant="ghost" onPress={() => setReload((value) => value + 1)} />
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.icon}><Ionicons name="shield-checkmark" size={28} color={C.cream} /></View>
      <Text style={styles.eyebrow}>YOUR VOICE · YOUR CHOICE</Text>
      <Text style={styles.title}>Choose how your recording can be shared</Text>
      <Text style={styles.body}>
        Mob Translate may keep your recording and play it publicly beside its {languageName} word or sentence until you withdraw permission. Your account is shown publicly only as “Recorded contributor.”
      </Text>

      <View style={styles.boundary}>
        <View style={styles.boundaryRow}>
          <Ionicons name="checkmark-circle" size={19} color={C.success} />
          <Text style={styles.boundaryText}>Public dictionary listening and the matching word or sentence</Text>
        </View>
        <View style={styles.boundaryRow}>
          <Ionicons name="close-circle" size={19} color={C.clay} />
          <Text style={styles.boundaryText}>No AI training, speech recognition training, provider transfer, voice cloning, model weights, public metrics, or commercial reuse</Text>
        </View>
      </View>

      <Text style={styles.guidance}>
        If this language, word, story, or community requires permission from an Elder, family, language centre, or other authority, continue only after you have it.
      </Text>

      <Choice
        checked={speakerConfirmed}
        onPress={() => setSpeakerConfirmed((value) => !value)}
        title="This is my voice"
        detail="I am the person who will be recorded."
      />
      <Choice
        checked={authorityConfirmed}
        onPress={() => setAuthorityConfirmed((value) => !value)}
        title="I have permission to share it"
        detail="I may publicly share this recording and the language content it speaks."
      />

      <Button
        label="Allow public dictionary sharing"
        icon="mic-outline"
        onPress={grant}
        loading={saving}
        disabled={!speakerConfirmed || !authorityConfirmed}
        full
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.withdrawal}>
        You can withdraw in You → Voice sharing permission. Public playback then stops; copies someone already downloaded may remain outside Mob Translate’s control.
      </Text>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} hitSlop={8}>
        <Text style={styles.link}>Read the privacy policy</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  loadingCard: { alignItems: 'center', gap: 12, paddingVertical: 26 },
  loadingText: { fontFamily: F.medium, fontSize: S.label, color: C.muted, textAlign: 'center' },
  card: { gap: 14, borderColor: C.sageLine, borderWidth: 1.5, backgroundColor: C.surfaceAlt },
  icon: { width: 54, height: 54, borderRadius: radius.pill, backgroundColor: C.forest, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.sage },
  title: { fontFamily: F.displayBold, fontSize: S.title, lineHeight: 31, color: C.ink },
  body: { fontFamily: F.body, fontSize: S.label, lineHeight: 23, color: C.inkSoft },
  boundary: { gap: 10, backgroundColor: C.surface, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: C.hair },
  boundaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  boundaryText: { flex: 1, fontFamily: F.medium, fontSize: S.small, lineHeight: 19, color: C.inkSoft },
  guidance: { fontFamily: F.serifItalic, fontSize: S.label, lineHeight: 22, color: C.clay },
  choice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, padding: 14 },
  choiceOn: { borderColor: C.forest, backgroundColor: C.sageSoft },
  choiceTitle: { fontFamily: F.semibold, fontSize: S.label, color: C.ink },
  choiceDetail: { fontFamily: F.body, fontSize: S.small, lineHeight: 19, color: C.muted, marginTop: 2 },
  withdrawal: { fontFamily: F.body, fontSize: S.small, lineHeight: 19, color: C.muted },
  link: { fontFamily: F.semibold, fontSize: S.small, color: C.forest, textDecorationLine: 'underline' },
  error: { fontFamily: F.medium, fontSize: S.small, lineHeight: 19, color: C.danger, textAlign: 'center' },
});
