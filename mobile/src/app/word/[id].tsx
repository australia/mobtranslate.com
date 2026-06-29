import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Card, Display, Screen, SpeakerButton } from '../../components/kit';
import { getWord, type WordDetail } from '../../lib/api';
import { C, F, S } from '../../lib/theme';

export default function WordScreen() {
  const { id, code, word } = useLocalSearchParams<{ id: string; code?: string; word?: string }>();
  const [detail, setDetail] = useState<WordDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getWord(String(id)).then((d) => { if (alive) { setDetail(d); setLoading(false); } });
    return () => { alive = false; };
  }, [id]);

  const langCode = detail?.languageCode || (code as string) || '';
  const headword = detail?.word || (word as string) || 'Word';

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <View style={styles.headRow}>
        <Display style={{ flex: 1 }}>{headword}</Display>
        {!!langCode && <SpeakerButton code={langCode} text={headword} big />}
      </View>

      {loading && <ActivityIndicator color={C.ochre} size="large" style={{ marginTop: 20 }} />}

      {!loading && detail && (
        <>
          {detail.definitions.length > 0 && (
            <Card soft>
              <Text style={styles.section}>Meaning</Text>
              {detail.definitions.map((d, i) => <Text key={i} style={styles.def}>{`•  ${d}`}</Text>)}
            </Card>
          )}
          {detail.examples.length > 0 && (
            <Card soft>
              <Text style={styles.section}>Examples</Text>
              {detail.examples.map((ex, i) => (
                <View key={i} style={[styles.exRow, i > 0 && styles.exBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exText}>{ex.text}</Text>
                    {!!ex.translation && <Text style={styles.exTrans}>{ex.translation}</Text>}
                  </View>
                  <SpeakerButton code={langCode} text={ex.text} />
                </View>
              ))}
            </Card>
          )}
          {detail.definitions.length === 0 && detail.examples.length === 0 && (
            <Text style={styles.muted}>No extra detail for this word yet.</Text>
          )}
        </>
      )}
      {!loading && !detail && <Text style={styles.muted}>Could not load this word.</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  section: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.ochre, marginBottom: 10 },
  def: { fontFamily: F.body, fontSize: S.body, color: C.ink, lineHeight: 28, marginBottom: 4 },
  exRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  exBorder: { borderTopWidth: 1, borderTopColor: C.hair },
  exText: { fontFamily: F.body, fontSize: S.body, color: C.ink, lineHeight: 26 },
  exTrans: { fontFamily: F.body, fontSize: S.label, color: C.muted, marginTop: 2 },
  muted: { fontFamily: F.body, fontSize: S.label, color: C.muted },
});
