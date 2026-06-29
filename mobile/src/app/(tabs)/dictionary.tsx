import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header, LangPicker, Screen, SpeakerButton } from '../../components/kit';
import { searchWords, type SearchHit } from '../../lib/api';
import { useLanguages } from '../../lib/useLanguages';
import { C, F, S, radius } from '../../lib/theme';

export default function DictionaryScreen() {
  const { languages } = useLanguages();
  const router = useRouter();
  const [code, setCode] = useState('kuku_yalanji');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (languages.length && !languages.some((l) => l.code === code)) setCode(languages[0].code); }, [languages]);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try { setHits(await searchWords(code, q.trim())); } catch { setHits([]); } finally { setLoading(false); }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, code]);

  return (
    <Screen scroll={false}>
      <Header kicker="Dictionary" title="Words" sub="Search words and meanings." />
      <LangPicker languages={languages} value={code} onChange={setCode} />
      <View style={styles.searchRow}>
        <Ionicons name="search" size={20} color={C.faint} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search a word or meaning…"
          placeholderTextColor={C.faint} autoCorrect={false} autoCapitalize="none" style={styles.search} />
        {loading && <ActivityIndicator color={C.ochre} />}
      </View>
      <FlatList
        data={hits} keyExtractor={(h) => h.wordId} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 28, gap: 10 }}
        ListEmptyComponent={!loading && q.trim().length >= 2 ? <Text style={styles.empty}>No words for “{q}”.</Text> : null}
        renderItem={({ item }) => (
          <Pressable style={styles.row}
            onPress={() => router.push({ pathname: '/word/[id]', params: { id: item.wordId, code, word: item.word } })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.word}>{item.word}</Text>
              {!!item.meaning && <Text style={styles.meaning} numberOfLines={2}>{item.meaning}</Text>}
            </View>
            <SpeakerButton code={code} text={item.word} />
            <Ionicons name="chevron-forward" size={20} color={C.faint} />
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 56 },
  search: { flex: 1, fontFamily: F.body, fontSize: S.body, color: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.hair, padding: 16 },
  word: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  meaning: { fontFamily: F.body, fontSize: S.label, color: C.muted, marginTop: 3 },
  empty: { fontFamily: F.body, fontSize: S.label, color: C.muted, textAlign: 'center', paddingVertical: 30 },
});
