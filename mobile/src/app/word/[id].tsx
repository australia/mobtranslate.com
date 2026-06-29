import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Card, Screen, SpeakerButton, Sub } from '../../components/kit';
import { getWord, type WordDetail } from '../../lib/api';
import { C, S } from '../../lib/theme';

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
      <Stack.Screen options={{ title: headword }} />
      <View style={styles.headRow}>
        <Text style={styles.word}>{headword}</Text>
        {!!langCode && <SpeakerButton code={langCode} text={headword} big />}
      </View>

      {loading && <ActivityIndicator color={C.ochre} size="large" style={{ marginTop: 20 }} />}

      {!loading && detail && (
        <>
          {detail.definitions.length > 0 && (
            <Card>
              <Text style={styles.section}>Meaning</Text>
              {detail.definitions.map((d, i) => (
                <Text key={i} style={styles.def}>{`• ${d}`}</Text>
              ))}
            </Card>
          )}
          {detail.examples.length > 0 && (
            <Card>
              <Text style={styles.section}>Examples</Text>
              {detail.examples.map((ex, i) => (
                <View key={i} style={styles.exRow}>
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
            <Sub>No extra detail for this word yet.</Sub>
          )}
        </>
      )}
      {!loading && !detail && <Sub>Could not load this word.</Sub>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  word: { flex: 1, fontSize: S.display, fontWeight: '800', color: C.ink },
  section: { fontSize: S.small, fontWeight: '700', color: C.ochre, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  def: { fontSize: S.body, color: C.ink, lineHeight: 28, marginBottom: 4 },
  exRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border },
  exText: { fontSize: S.body, color: C.ink, lineHeight: 26 },
  exTrans: { fontSize: S.label, color: C.muted, marginTop: 2 },
});
