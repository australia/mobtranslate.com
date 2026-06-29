import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BigButton, Card, Header, Screen } from '../../components/kit';
import { useAuth } from '../../lib/auth';
import { C, F, S, radius } from '../../lib/theme';

export default function AccountScreen() {
  const { user, loading, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <Screen><ActivityIndicator color={C.ochre} size="large" style={{ marginTop: 40 }} /></Screen>;

  if (user) {
    return (
      <Screen>
        <Header kicker="Account" title="Your account" />
        <Card soft>
          <View style={styles.userRow}>
            <View style={styles.avatar}><Ionicons name="person" size={26} color={C.ochre} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user.name || 'Signed in'}</Text>
              <Text style={styles.email}>{user.email}</Text>
            </View>
          </View>
        </Card>
        <Text style={styles.body}>You can record words and sentences in your language. They are saved to your account.</Text>
        <BigButton label="Sign out" icon="log-out" tone="ghost" onPress={signOut} />
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
      <Header kicker="Account" title={mode === 'up' ? 'Create account' : 'Sign in'}
        sub={mode === 'up' ? 'Make an account to add and record words.' : 'Sign in to record your language.'} />
      {mode === 'up' && <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.faint} style={styles.input} />}
      <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={C.faint}
        autoCapitalize="none" keyboardType="email-address" autoCorrect={false} style={styles.input} />
      <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={C.faint}
        secureTextEntry style={styles.input} />
      <BigButton label={mode === 'up' ? 'Create account' : 'Sign in'} icon="arrow-forward" onPress={submit} loading={busy} disabled={!email.trim() || !password} />
      {error && <Text style={styles.error}>{error}</Text>}
      <BigButton label={mode === 'up' ? 'I already have an account' : 'Create a new account'} tone="ghost"
        onPress={() => { setMode(mode === 'up' ? 'in' : 'up'); setError(null); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, height: 58, fontFamily: F.body, fontSize: S.body, color: C.ink },
  error: { fontFamily: F.medium, fontSize: S.label, color: C.danger },
  body: { fontFamily: F.body, fontSize: S.label, color: C.muted, lineHeight: 24 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: C.goldSoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  email: { fontFamily: F.body, fontSize: S.label, color: C.muted, marginTop: 2 },
});
