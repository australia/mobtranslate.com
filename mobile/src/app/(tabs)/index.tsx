import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BigButton, Card, LangPicker, Screen, SpeakerButton, Sub, Title } from '../../components/kit';
import { translate } from '../../lib/api';
import { useLanguages } from '../../lib/useLanguages';
import { C, S, radius } from '../../lib/theme';

export default function TranslateScreen() {
  const { languages } = useLanguages();
  const [code, setCode] = useState('kuku_yalanji');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<{ translation: string; gloss?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (languages.length && !languages.some((l) => l.code === code)) setCode(languages[0].code);
  }, [languages]);

  const langName = languages.find((l) => l.code === code)?.name ?? 'language';

  async function onTranslate() {
    if (!input.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      setResult(await translate(code, input.trim()));
    } catch (e: any) {
      setError(e?.message || 'Could not translate. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Title>Translate</Title>
      <Sub>Type English, get {langName}.</Sub>

      <LangPicker languages={languages} value={code} onChange={(c) => { setCode(c); setResult(null); }} />

      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="Type English here…"
        placeholderTextColor={C.muted}
        multiline
        style={styles.input}
      />

      <BigButton label="Translate" icon="arrow-forward" onPress={onTranslate} loading={loading} disabled={!input.trim()} />

      {error && <Text style={styles.error}>{error}</Text>}

      {result && (
        <Card>
          <Text style={styles.label}>{langName}</Text>
          <View style={styles.resultRow}>
            <Text style={styles.result} selectable>{result.translation}</Text>
            <SpeakerButton code={code} text={result.translation} big />
          </View>
          {!!result.gloss && <Text style={styles.gloss}>{result.gloss}</Text>}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border,
    padding: 16, fontSize: S.body, color: C.ink, minHeight: 110, textAlignVertical: 'top',
  },
  label: { fontSize: S.small, fontWeight: '700', color: C.ochre, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  resultRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  result: { flex: 1, fontSize: S.title, fontWeight: '700', color: C.ink, lineHeight: 36 },
  gloss: { fontSize: S.label, color: C.muted, marginTop: 10 },
  error: { fontSize: S.label, color: C.danger },
});
