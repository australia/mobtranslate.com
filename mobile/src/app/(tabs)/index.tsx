import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BigButton, Brand, Card, Display, Header, LangPicker, Screen, SpeakerButton } from '../../components/kit';
import { translate } from '../../lib/api';
import { useLanguages } from '../../lib/useLanguages';
import { C, F, S, radius } from '../../lib/theme';

export default function TranslateScreen() {
  const { languages } = useLanguages();
  const [code, setCode] = useState('kuku_yalanji');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<{ translation: string; gloss?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (languages.length && !languages.some((l) => l.code === code)) setCode(languages[0].code); }, [languages]);
  const langName = languages.find((l) => l.code === code)?.name ?? 'language';

  async function onTranslate() {
    if (!input.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try { setResult(await translate(code, input.trim())); }
    catch (e: any) { setError(e?.message || 'Could not translate. Try again.'); }
    finally { setLoading(false); }
  }

  return (
    <Screen>
      <View style={styles.brandRow}>
        <Brand size={30} />
        <Text style={styles.brandWord}>Mob Translate</Text>
      </View>

      <Header kicker="Translate" title="Translate" sub={`English into ${langName}.`} />
      <LangPicker languages={languages} value={code} onChange={(c) => { setCode(c); setResult(null); }} />

      <TextInput
        value={input} onChangeText={setInput}
        placeholder="Type English here…" placeholderTextColor={C.faint}
        multiline style={styles.input}
      />
      <BigButton label="Translate" icon="arrow-forward" onPress={onTranslate} loading={loading} disabled={!input.trim()} />

      {error && <Text style={styles.error}>{error}</Text>}

      {result && (
        <Card soft>
          <Text style={styles.kicker}>{langName.toUpperCase()}</Text>
          <View style={styles.resultRow}>
            <Display style={{ flex: 1 }}>{result.translation}</Display>
            <SpeakerButton code={code} text={result.translation} big />
          </View>
          {!!result.gloss && <Text style={styles.gloss}>{result.gloss}</Text>}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  brandWord: { fontFamily: F.bold, fontSize: 18, color: C.ink },
  input: {
    backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border,
    padding: 16, fontFamily: F.body, fontSize: S.body, color: C.ink, minHeight: 120, textAlignVertical: 'top',
  },
  kicker: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.ochre, marginBottom: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  gloss: { fontFamily: F.body, fontSize: S.label, color: C.muted, marginTop: 12, lineHeight: 24 },
  error: { fontFamily: F.medium, fontSize: S.label, color: C.danger },
});
