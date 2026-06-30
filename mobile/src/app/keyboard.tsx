import { Linking, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Screen, ScreenTitle } from '../components/kit';
import { C, F, S, radius } from '../lib/theme';

function Step({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.num}><Text style={styles.numText}>{n}</Text></View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

export default function KeyboardScreen() {
  const openSettings = () => {
    Linking.sendIntent('android.settings.INPUT_METHOD_SETTINGS').catch(() => Linking.openSettings().catch(() => {}));
  };
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Keyboard' }} />
      <View style={styles.markRow}>
        <View style={styles.mark}><Ionicons name="language" size={26} color={C.forest} /></View>
      </View>
      <ScreenTitle title="Type your language" sub="Use the special letters and word suggestions in any app — messages, social, notes." />
      <Card>
        <Step n="1" text="Open keyboard settings and turn on “MobTranslate Keyboard”." />
        <View style={styles.divider} />
        <Step n="2" text="Tap any text box, then switch keyboards (the keyboard icon) to MobTranslate." />
        <View style={styles.divider} />
        <Step n="3" text="Type English and tap a suggestion to drop in the language word." />
      </Card>
      <Button label="Open keyboard settings" icon="settings-outline" onPress={openSettings} full />
      <Text style={styles.note}>It’s part of this app — nothing extra to install. What you type stays on your phone.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  markRow: { alignItems: 'center', marginTop: 4 },
  mark: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: C.sageSoft, alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 4 },
  num: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: C.sageSoft, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: F.bold, fontSize: S.label, color: C.forest },
  stepText: { flex: 1, fontFamily: F.body, fontSize: S.body, color: C.ink, lineHeight: 26 },
  divider: { height: 1, backgroundColor: C.hair, marginVertical: 12 },
  note: { fontFamily: F.body, fontSize: S.small, color: C.muted, lineHeight: 20, textAlign: 'center' },
});
