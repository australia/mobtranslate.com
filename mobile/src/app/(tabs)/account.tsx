import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BigButton, Card, Screen, Sub, Title } from '../../components/kit';
import { useAuth } from '../../lib/auth';
import { C, S, radius } from '../../lib/theme';

export default function AccountScreen() {
  const { user, loading, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return <Screen><ActivityIndicator color={C.ochre} size="large" style={{ marginTop: 40 }} /></Screen>;
  }

  if (user) {
    return (
      <Screen>
        <Title>Account</Title>
        <Card>
          <View style={styles.userRow}>
            <View style={styles.avatar}><Ionicons name="person" size={28} color={C.ochre} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user.name || 'Signed in'}</Text>
              <Text style={styles.email}>{user.email}</Text>
            </View>
          </View>
        </Card>
        <Sub>You can record words and sentences in your language. They are saved to your account.</Sub>
        <BigButton label="Sign out" icon="log-out" tone="ghost" onPress={signOut} />
      </Screen>
    );
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      if (mode === 'up') await signUp(name.trim() || email.split('@')[0], email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (e: any) {
      setError(e?.message || 'Could not sign in. Check your details.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>{mode === 'up' ? 'Create account' : 'Sign in'}</Title>
      <Sub>{mode === 'up' ? 'Make an account to add and record words.' : 'Sign in to record your language.'}</Sub>

      {mode === 'up' && (
        <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.muted} style={styles.input} />
      )}
      <TextInput
        value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={C.muted}
        autoCapitalize="none" keyboardType="email-address" autoCorrect={false} style={styles.input}
      />
      <TextInput
        value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={C.muted}
        secureTextEntry style={styles.input}
      />

      <BigButton
        label={mode === 'up' ? 'Create account' : 'Sign in'}
        icon="arrow-forward"
        onPress={submit}
        loading={busy}
        disabled={!email.trim() || !password}
      />
      {error && <Text style={styles.error}>{error}</Text>}

      <BigButton
        label={mode === 'up' ? 'I already have an account' : 'Create a new account'}
        tone="ghost"
        onPress={() => { setMode(mode === 'up' ? 'in' : 'up'); setError(null); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 16, height: 58, fontSize: S.body, color: C.ink,
  },
  error: { fontSize: S.label, color: C.danger },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: C.ochreSoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: S.heading, fontWeight: '700', color: C.ink },
  email: { fontSize: S.label, color: C.muted, marginTop: 2 },
});
