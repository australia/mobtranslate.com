import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BigButton, Card, Screen, Sub, Title } from '../../components/kit';
import { C, S, radius } from '../../lib/theme';

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
    Linking.sendIntent('android.settings.INPUT_METHOD_SETTINGS').catch(() => {
      Linking.openSettings().catch(() => {});
    });
  };

  return (
    <Screen>
      <Title>Language keyboard</Title>
      <Sub>
        Type your language anywhere — messages, Facebook, notes — with the special letters
        (ng, ngw, nj, rr, rd…) and word suggestions built in.
      </Sub>

      <Card>
        <Step n="1" text="Open keyboard settings and turn on “MobTranslate Keyboard”." />
        <Step n="2" text="Tap any text box, then switch keyboards (the keyboard icon at the bottom) to MobTranslate." />
        <Step n="3" text="Type English and tap a suggestion to drop in the language word." />
      </Card>

      <BigButton label="Open keyboard settings" icon="settings" onPress={openSettings} />

      <Text style={styles.note}>
        Your keyboard is part of this app — nothing extra to install. What you type stays on your phone.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  num: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: C.ochreSoft, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: S.label, fontWeight: '800', color: C.ochre },
  stepText: { flex: 1, fontSize: S.body, color: C.ink, lineHeight: 26 },
  note: { fontSize: S.small, color: C.muted, lineHeight: 20 },
});
