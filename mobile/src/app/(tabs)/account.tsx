import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Screen, ScreenTitle } from '../../components/kit';
import { useAuth } from '../../lib/auth';
import { C, F, S, radius } from '../../lib/theme';

const PRIVACY_URL = 'https://mobtranslate.com/privacy';
const DELETION_URL = 'https://mobtranslate.com/account-deletion';

function openExternal(url: string) {
  Linking.openURL(url).catch(() => {});
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
  const router = useRouter();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <Screen><ScreenTitle title="Your account" /><ActivityIndicator color={C.forest} size="large" style={{ marginTop: 20 }} /></Screen>;

  if (user) {
    return (
      <Screen>
        <ScreenTitle title="Your account" />
        <Card>
          <View style={styles.userRow}>
            <View style={styles.avatar}><Ionicons name="person" size={26} color={C.forest} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user.name || 'Signed in'}</Text>
              <Text style={styles.email}>{user.email}</Text>
            </View>
          </View>
        </Card>
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
        <Text style={styles.body}>Recordings you upload may be shared as community language resources. You can request removal at any time.</Text>
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
});
