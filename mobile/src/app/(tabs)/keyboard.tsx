import { Linking, StyleSheet, Text, View } from 'react-native';
import { BigButton, Card, Header, Screen } from '../../components/kit';
import { C, F, S, radius } from '../../lib/theme';

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
    <Screen>
      <Header
        kicker="Keyboard"
        title="Language keyboard"
        sub="Type your language anywhere — messages, social, notes — with the special letters and word suggestions built in."
      />
      <Card soft>
        <Step n="1" text="Open keyboard settings and turn on “MobTranslate Keyboard”." />
        <View style={styles.divider} />
        <Step n="2" text="Tap any text box, then switch keyboards (the keyboard icon) to MobTranslate." />
        <View style={styles.divider} />
        <Step n="3" text="Type English and tap a suggestion to drop in the language word." />
      </Card>
      <BigButton label="Open keyboard settings" icon="settings" onPress={openSettings} />
      <Text style={styles.note}>It’s part of this app — nothing extra to install. What you type stays on your phone.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 4 },
  num: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: C.goldSoft, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: F.bold, fontSize: S.label, color: C.ochre },
  stepText: { flex: 1, fontFamily: F.body, fontSize: S.body, color: C.ink, lineHeight: 26 },
  divider: { height: 1, backgroundColor: C.hair, marginVertical: 12 },
  note: { fontFamily: F.body, fontSize: S.small, color: C.muted, lineHeight: 20 },
});
