import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Button, Card, Screen, ScreenTitle } from '../../components/kit';
import { ContributionWeave } from '../../components/ContributionWeave';
import {
  getPublicVoiceConsent, getVoiceTotals, setPublicVoiceConsent,
  type PublicVoiceConsent, type VoiceTotals,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAccent } from '../../lib/accent';
import { useLang } from '../../lib/langContext';
import { C, F, S, radius } from '../../lib/theme';

const PRIVACY_URL = 'https://mobtranslate.com/privacy';
const DELETION_URL = 'https://mobtranslate.com/account-deletion';

function openExternal(url: string) {
  Linking.openURL(url).catch(() => {});
}

function Thread({ n, label, accent }: { n: number; label: string; accent: string }) {
  return (
    <View style={styles.thread}>
      <Text style={[styles.threadN, { color: accent }]}>{n}</Text>
      <Text style={styles.threadL}>{label}</Text>
    </View>
  );
}

function LinkRow({ icon, label, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: C.surfaceAlt }]}>
      <View style={styles.linkIcon}><Ionicons name={icon} size={20} color={C.forest} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.linkLabel}>{label}</Text>
        {!!sub && <Text style={styles.linkSub}>{sub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color={C.faint} />
    </Pressable>
  );
}

export default function AccountScreen() {
  const { user, loading, signIn, signUp, signOut } = useAuth();
  const { lang } = useLang();
  const accent = useAccent();
  const router = useRouter();
  const [totals, setTotals] = useState<VoiceTotals | null>(null);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceConsent, setVoiceConsent] = useState<PublicVoiceConsent | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setTotals(null); return; }
    let on = true;
    getVoiceTotals().then((t) => { if (on) setTotals(t); }).catch(() => {});
    return () => { on = false; };
  }, [user]);

  useFocusEffect(useCallback(() => {
    if (!user || !lang?.id) {
      setVoiceConsent(null);
      setConsentChecked(false);
      return undefined;
    }
    let active = true;
    setConsentChecked(false);
    setConsentError(null);
    getPublicVoiceConsent(lang.id)
      .then((consent) => { if (active) setVoiceConsent(consent); })
      .catch((reason) => { if (active) setConsentError(reason instanceof Error ? reason.message : 'Could not check permission.'); })
      .finally(() => { if (active) setConsentChecked(true); });
    return () => { active = false; };
  }, [user, lang?.id]));

  function confirmWithdrawal() {
    if (!lang?.id || !voiceConsent?.granted) return;
    Alert.alert(
      'Stop public voice sharing?',
      `Mob Translate will stop publicly listing and playing your ${lang.name} recordings. This does not delete your account or contribution history.`,
      [
        { text: 'Keep sharing', style: 'cancel' },
        {
          text: 'Stop sharing',
          style: 'destructive',
          onPress: async () => {
            setWithdrawing(true);
            setConsentError(null);
            try {
              setVoiceConsent(await setPublicVoiceConsent(lang.id, false));
            } catch (reason) {
              setConsentError(reason instanceof Error ? reason.message : 'Could not withdraw permission.');
            } finally {
              setWithdrawing(false);
            }
          },
        },
      ],
    );
  }

  if (loading) return <Screen><ScreenTitle title="Your account" /><ActivityIndicator color={C.forest} size="large" style={{ marginTop: 20 }} /></Screen>;

  if (user) {
    return (
      <Screen>
        <ScreenTitle title="Your account" />
        <Card>
          <View style={styles.userRow}>
            <View style={[styles.avatar, { backgroundColor: accent.accentSoft }]}><Ionicons name="person" size={26} color={accent.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user.name || 'Signed in'}</Text>
              <Text style={styles.email}>{user.email}</Text>
            </View>
          </View>
        </Card>

        {/* Contribution, visualised — a woven river that grows as you record (#9) */}
        <Animated.View entering={FadeIn.duration(400)}>
          <ContributionWeave
            progress={totals ? 1 - Math.exp(-((totals.words + totals.sentences)) / 12) : 0}
            accent={accent}
          />
          {!!totals && (totals.words + totals.sentences) > 0 && (
            <View style={styles.threads}>
              <Thread label={totals.words === 1 ? 'word' : 'words'} n={totals.words} accent={accent.accent} />
              <Thread label={totals.sentences === 1 ? 'sentence' : 'sentences'} n={totals.sentences} accent={accent.accent} />
              <Thread label={totals.minutes === 1 ? 'minute' : 'minutes'} n={totals.minutes} accent={accent.accent} />
            </View>
          )}
        </Animated.View>

        <Card padded={false} style={{ overflow: 'hidden' }}>
          <LinkRow icon="mic-outline" label="Record your voice" sub="Add words and sentences" onPress={() => router.push('/record')} />
          <View style={styles.sep} />
          <LinkRow icon="language" label="Language keyboard" sub="Type your language anywhere" onPress={() => router.push('/keyboard')} />
        </Card>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <LinkRow icon="shield-checkmark-outline" label="Privacy policy" sub="How Mob Translate handles your data" onPress={() => openExternal(PRIVACY_URL)} />
          <View style={styles.sep} />
          <LinkRow icon="trash-outline" label="Delete account and data" sub="Open the deletion request page" onPress={() => openExternal(DELETION_URL)} />
        </Card>
        {lang?.id && (
          <Card style={styles.permissionCard}>
            <View style={styles.permissionHead}>
              <View style={[styles.permissionIcon, voiceConsent?.granted ? styles.permissionIconOn : null]}>
                <Ionicons name={voiceConsent?.granted ? 'volume-high' : 'volume-mute-outline'} size={22} color={voiceConsent?.granted ? C.white : C.forest} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permissionEyebrow}>VOICE SHARING · {lang.name.toUpperCase()}</Text>
                <Text style={styles.permissionTitle}>{voiceConsent?.granted ? 'Public dictionary playback is on' : 'No active public voice permission'}</Text>
              </View>
            </View>
            {!consentChecked ? (
              <ActivityIndicator color={C.forest} />
            ) : voiceConsent?.granted ? (
              <>
                <Text style={styles.permissionBody}>Your recordings may be played beside public dictionary entries. AI training, provider transfer, voice cloning, model creation, public metrics, and commercial reuse are not allowed.</Text>
                <Button label="Withdraw public playback" icon="hand-left-outline" variant="ghost" onPress={confirmWithdrawal} loading={withdrawing} full />
              </>
            ) : (
              <Text style={styles.permissionBody}>Mob Translate is not authorised to publicly play your recordings for this language. You can make a new choice when you open the recorder.</Text>
            )}
            {consentError && <Text style={styles.permissionError}>{consentError}</Text>}
          </Card>
        )}
        <Text style={styles.body}>Your voice stays attached to a clear purpose. You can withdraw public playback here or request deletion at any time.</Text>
        <Button label="Sign out" icon="log-out-outline" variant="ghost" onPress={signOut} full />
      </Screen>
    );
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      if (mode === 'up') await signUp(name.trim() || email.split('@')[0], email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (e: any) { setError(e?.message || 'Could not sign in. Check your details.'); }
    finally { setBusy(false); }
  }

  return (
    <Screen>
      <ScreenTitle title={mode === 'up' ? 'Create account' : 'Welcome back'}
        sub={mode === 'up' ? 'Make an account to add and record words.' : 'Sign in to record your language.'} />
      <Card style={{ gap: 12 }}>
        {mode === 'up' && <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.muted} style={styles.input} />}
        <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={C.muted}
          autoCapitalize="none" keyboardType="email-address" autoCorrect={false} style={styles.input} />
        <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={C.muted}
          secureTextEntry style={styles.input} />
        <Button label={mode === 'up' ? 'Create account' : 'Sign in'} icon="arrow-forward" onPress={submit} loading={busy} disabled={!email.trim() || !password} full />
        {error && <Text style={styles.error}>{error}</Text>}
      </Card>
      <Button label={mode === 'up' ? 'I already have an account' : 'Create a new account'} variant="ghost"
        onPress={() => { setMode(mode === 'up' ? 'in' : 'up'); setError(null); }} full />
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <LinkRow icon="shield-checkmark-outline" label="Privacy policy" onPress={() => openExternal(PRIVACY_URL)} />
        <View style={styles.sep} />
        <LinkRow icon="trash-outline" label="Account and data deletion" onPress={() => openExternal(DELETION_URL)} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: C.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, height: 56, fontFamily: F.body, fontSize: S.body, color: C.ink },
  error: { fontFamily: F.medium, fontSize: S.label, color: C.danger },
  body: { fontFamily: F.body, fontSize: S.label, color: C.muted, lineHeight: 24, textAlign: 'center' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: C.sageSoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  email: { fontFamily: F.body, fontSize: S.label, color: C.muted, marginTop: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  linkIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: C.sageSoft, alignItems: 'center', justifyContent: 'center' },
  linkLabel: { fontFamily: F.semibold, fontSize: S.body, color: C.ink },
  linkSub: { fontFamily: F.body, fontSize: S.small, color: C.muted, marginTop: 1 },
  sep: { height: 1, backgroundColor: C.hair, marginLeft: 72 },
  threads: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
  thread: { alignItems: 'center' },
  threadN: { fontFamily: F.displayBold, fontSize: S.title },
  threadL: { fontFamily: F.medium, fontSize: S.small, color: C.muted, marginTop: 1 },
  permissionCard: { gap: 13, borderWidth: 1.5, borderColor: C.sageLine, backgroundColor: C.surfaceAlt },
  permissionHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  permissionIcon: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: C.sageSoft, alignItems: 'center', justifyContent: 'center' },
  permissionIconOn: { backgroundColor: C.forest },
  permissionEyebrow: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.1, color: C.sage },
  permissionTitle: { fontFamily: F.display, fontSize: S.body, color: C.ink, marginTop: 2 },
  permissionBody: { fontFamily: F.body, fontSize: S.small, lineHeight: 20, color: C.muted },
  permissionError: { fontFamily: F.medium, fontSize: S.small, lineHeight: 19, color: C.danger },
});
