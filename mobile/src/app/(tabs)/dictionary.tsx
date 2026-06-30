import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LanguageSelector, SpeakerButton } from '../../components/kit';
import { browseWords, searchWords, getWordThumbs, type SearchHit } from '../../lib/api';
import { useLang } from '../../lib/langContext';
import { C, F, S, radius, shadow, LANG_ART } from '../../lib/theme';

type Row = { id: string; word: string; meaning: string; pos?: string };

/** Small square thumbnail: the word's own watercolour if it exists, else the
 *  language's art (cohesive + never blank), without ever triggering generation. */
function WordThumb({ uri, art }: { uri?: string | null; art: any }) {
  const [failed, setFailed] = useState(false);
  if (uri && !failed) return <Image source={{ uri }} style={styles.thumb} onError={() => setFailed(true)} />;
  if (art) return <Image source={art} style={[styles.thumb, { opacity: 0.92 }]} />;
  return <View style={[styles.thumb, styles.thumbPlaceholder]}><Ionicons name="leaf-outline" size={20} color={C.sage} /></View>;
}

export default function DictionaryScreen() {
  const { code, setCode, languages, lang } = useLang();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [browse, setBrowse] = useState<Row[]>([]);
  const [hits, setHits] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [picker, setPicker] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const thumbsRef = useRef(thumbs); thumbsRef.current = thumbs;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searching = q.trim().length >= 2;

  const loadBrowse = useCallback(async (p: number) => {
    if (p === 1) setLoading(true); else setMore(true);
    const res = await browseWords(code, { page: p });
    setBrowse((prev) => (p === 1 ? res.words : [...prev, ...res.words]));
    setHasNext(res.hasNext); setPage(res.page);
    setLoading(false); setMore(false);
  }, [code]);

  useEffect(() => { setBrowse([]); setThumbs({}); loadBrowse(1); }, [code, loadBrowse]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!searching) { setHits([]); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try { const r = await searchWords(code, q.trim()); setHits(r.map((h: SearchHit) => ({ id: h.wordId, word: h.word, meaning: h.meaning }))); }
      catch { setHits([]); } finally { setLoading(false); }
    }, 320);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, code, searching]);

  const data: Row[] = searching ? hits : browse;

  // Fetch cached thumbnails for visible words (peek-only — never generates).
  // Runs on focus too, so words generated while viewing a detail show their
  // image when you return (and after re-opening the app).
  useFocusEffect(useCallback(() => {
    const words = Array.from(new Set(data.map((d) => d.word)));
    // re-check any word without a resolved image yet (null/undefined)
    const toCheck = words.filter((w) => !thumbsRef.current[w]);
    if (toCheck.length === 0) return;
    let on = true;
    getWordThumbs(code, toCheck).then((m) => { if (on) setThumbs((prev) => ({ ...prev, ...m })); });
    return () => { on = false; };
  }, [data, code]));

  const langName = lang?.name ?? 'language';
  const art = LANG_ART[code]?.art;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Dictionary</Text>
          <Pressable style={styles.langChip} onPress={() => setPicker(true)}>
            <Text style={styles.langChipText} numberOfLines={1}>{langName}</Text>
            <Ionicons name="chevron-down" size={14} color={C.forest} />
          </Pressable>
        </View>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={20} color={C.faint} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search a word or meaning…"
            placeholderTextColor={C.muted} autoCorrect={false} autoCapitalize="none" style={styles.search} />
          {q.length > 0 && <Pressable onPress={() => setQ('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={C.faint} /></Pressable>}
        </View>
      </View>

      <FlatList
        data={data} keyExtractor={(r) => r.id} keyboardShouldPersistTaps="handled"
        extraData={thumbs}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, gap: 10 }}
        onEndReachedThreshold={0.5}
        onEndReached={() => { if (!searching && hasNext && !more && !loading) loadBrowse(page + 1); }}
        ListHeaderComponent={loading && data.length === 0 ? <ActivityIndicator color={C.forest} style={{ marginTop: 24 }} /> : null}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>{searching ? `No words for “${q}”.` : 'No words yet.'}</Text> : null}
        ListFooterComponent={more ? <ActivityIndicator color={C.forest} style={{ marginVertical: 16 }} /> : null}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [styles.row, pressed && { transform: [{ scale: 0.99 }] }]}
            onPress={() => router.push({ pathname: '/word/[id]', params: { id: item.id, code, word: item.word } })}>
            <WordThumb uri={thumbs[item.word]} art={art} />
            <View style={{ flex: 1 }}>
              <View style={styles.wordRow}>
                <Text style={styles.word}>{item.word}</Text>
                {!!item.pos && <Text style={styles.pos}>{item.pos}</Text>}
              </View>
              {!!item.meaning && <Text style={styles.meaning} numberOfLines={2}>{item.meaning}</Text>}
            </View>
            <SpeakerButton code={code} text={item.word} size="sm" />
            <Ionicons name="chevron-forward" size={18} color={C.faint} />
          </Pressable>
        )}
      />

      <LanguageSelector visible={picker} languages={languages} value={code} onSelect={setCode} onClose={() => setPicker(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  head: { paddingHorizontal: 20, paddingTop: 6, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: F.display, fontSize: S.display, color: C.ink },
  langChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.sageSoft, paddingHorizontal: 12, height: 36, borderRadius: radius.pill, maxWidth: 170 },
  langChipText: { fontFamily: F.semibold, fontSize: S.label, color: C.forest },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 52, ...shadow },
  search: { flex: 1, fontFamily: F.body, fontSize: S.body, color: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.hair, padding: 12, ...shadow },
  thumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: C.sageSoft },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  wordRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  word: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  pos: { fontFamily: F.serifItalic, fontSize: S.small, color: C.sage },
  meaning: { fontFamily: F.body, fontSize: S.label, color: C.muted, marginTop: 3 },
  empty: { fontFamily: F.body, fontSize: S.label, color: C.muted, textAlign: 'center', paddingVertical: 40, paddingHorizontal: 20, lineHeight: 24 },
});
