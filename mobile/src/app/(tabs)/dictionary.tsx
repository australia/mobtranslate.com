import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { LanguageSelector, SpeakerButton } from '../../components/kit';
import { Skeleton } from '../../components/Skeleton';
import { KenBurns } from '../../components/KenBurns';
import { AZRail } from '../../components/AZRail';
import { browseWords, searchWords, getWordThumbs, type SearchHit } from '../../lib/api';
import { useLang } from '../../lib/langContext';
import { useAccent } from '../../lib/accent';
import { C, F, S, radius, shadow, LANG_ART } from '../../lib/theme';

type Row = { id: string; word: string; meaning: string; pos?: string };

/** Small square thumbnail with a gentle Ken-Burns drift: the word's own
 *  watercolour if it exists, else the language's art (cohesive + never blank),
 *  without ever triggering generation. */
function WordThumb({ uri, art, seed }: { uri?: string | null; art: any; seed: number }) {
  const [failed, setFailed] = useState(false);
  if (uri && !failed) {
    return (
      <View style={styles.thumb}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} onError={() => setFailed(true)} />
        <KenBurns source={{ uri }} style={StyleSheet.absoluteFill} seed={seed} />
      </View>
    );
  }
  if (art) return <KenBurns source={art} style={styles.thumb} seed={seed} opacity={0.92} />;
  return <View style={[styles.thumb, styles.thumbPlaceholder]}><Ionicons name="leaf-outline" size={20} color={C.sage} /></View>;
}

export default function DictionaryScreen() {
  const { code, setCode, languages, lang } = useLang();
  const accent = useAccent();
  const router = useRouter();
  const listRef = useRef<FlatList<Row>>(null);
  const [q, setQ] = useState('');
  const [browse, setBrowse] = useState<Row[]>([]);
  const [hits, setHits] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [letter, setLetter] = useState<string | null>(null);
  const [allLetters, setAllLetters] = useState<string[]>([]);
  const [posFilter, setPosFilter] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const thumbsRef = useRef(thumbs); thumbsRef.current = thumbs;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searching = q.trim().length >= 2;

  const loadBrowse = useCallback(async (p: number, ltr?: string | null) => {
    if (p === 1) setLoading(true); else setMore(true);
    const res = await browseWords(code, { page: p, letter: ltr ?? undefined });
    setBrowse((prev) => (p === 1 ? res.words : [...prev, ...res.words]));
    setHasNext(res.hasNext); setPage(res.page);
    if (res.letters.length) setAllLetters(res.letters);
    setLoading(false); setMore(false);
  }, [code]);

  useEffect(() => { setBrowse([]); setThumbs({}); setLetter(null); setPosFilter(null); loadBrowse(1, null); }, [code, loadBrowse]);

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

  function jumpToLetter(l: string) {
    setPosFilter(null);
    setLetter(l);
    setBrowse([]);
    loadBrowse(1, l);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }
  function clearLetter() { setLetter(null); setBrowse([]); loadBrowse(1, null); }

  const base: Row[] = searching ? hits : browse;
  // Data-driven part-of-speech chips (only what the loaded words actually carry).
  const posOptions = useMemo(() => {
    if (searching) return [];
    const seen = new Set<string>();
    for (const r of browse) if (r.pos) seen.add(r.pos);
    return Array.from(seen).sort();
  }, [browse, searching]);
  const data: Row[] = posFilter ? base.filter((r) => r.pos === posFilter) : base;

  // Fetch cached thumbnails for visible words (peek-only — never generates).
  useFocusEffect(useCallback(() => {
    const words = Array.from(new Set(data.map((d) => d.word)));
    const toCheck = words.filter((w) => !thumbsRef.current[w]);
    if (toCheck.length === 0) return;
    let on = true;
    getWordThumbs(code, toCheck).then((m) => { if (on) setThumbs((prev) => ({ ...prev, ...m })); });
    return () => { on = false; };
  }, [data, code]));

  const langName = lang?.name ?? 'language';
  const art = LANG_ART[code]?.art;
  const railActive = useMemo(() => new Set(allLetters.map((l) => l.toUpperCase())), [allLetters]);
  const showRail = !searching && railActive.size > 1;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Dictionary</Text>
          <Pressable style={[styles.langChip, { backgroundColor: accent.accentSoft }]} onPress={() => setPicker(true)}>
            <Text style={[styles.langChipText, { color: accent.accentDeep }]} numberOfLines={1}>{langName}</Text>
            <Ionicons name="chevron-down" size={14} color={accent.accent} />
          </Pressable>
        </View>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={20} color={C.faint} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search a word or meaning…"
            placeholderTextColor={C.muted} autoCorrect={false} autoCapitalize="none" style={styles.search} />
          {q.length > 0 && <Pressable onPress={() => setQ('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={C.faint} /></Pressable>}
        </View>

        {/* filter chips: letter (if jumped) + data-driven part-of-speech (#6) */}
        {!searching && (letter || posOptions.length > 1) && (
          <Animated.View entering={FadeIn.duration(220)} style={styles.chipRow}>
            {letter && (
              <Pressable onPress={clearLetter} style={[styles.chip, styles.chipOn, { backgroundColor: accent.accent, borderColor: accent.accent }]}>
                <Text style={[styles.chipText, { color: C.white }]}>{letter}</Text>
                <Ionicons name="close" size={13} color={C.white} />
              </Pressable>
            )}
            {posOptions.map((p, i) => {
              const on = posFilter === p;
              return (
                <Animated.View key={p} entering={FadeInDown.delay(i * 40).springify().damping(18)}>
                  <Pressable onPress={() => setPosFilter((v) => (v === p ? null : p))}
                    style={[styles.chip, on && { backgroundColor: accent.accentSoft, borderColor: accent.accentLine }]}>
                    <Text style={[styles.chipText, { color: on ? accent.accentDeep : C.muted }]}>{p}</Text>
                  </Pressable>
                </Animated.View>
              );
            })}
          </Animated.View>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={data} keyExtractor={(r) => r.id} keyboardShouldPersistTaps="handled"
          extraData={thumbs}
          refreshControl={!searching ? (
            <RefreshControl refreshing={refreshing} tintColor={accent.accent} colors={[accent.accent]}
              onRefresh={async () => { setRefreshing(true); await loadBrowse(1, letter); setRefreshing(false); }} />
          ) : undefined}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, paddingRight: showRail ? 30 : 20, gap: 10 }}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (!searching && hasNext && !more && !loading) loadBrowse(page + 1, letter); }}
          ListHeaderComponent={loading && data.length === 0 ? <SkeletonRows /> : null}
          ListEmptyComponent={!loading ? <Text style={styles.empty}>{searching ? `No words for “${q}”.` : 'No words yet.'}</Text> : null}
          ListFooterComponent={more ? <View style={{ marginTop: 4 }}><SkeletonRows count={2} /></View> : null}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeIn.duration(200)} layout={LinearTransition.springify().damping(20)}>
              <Pressable style={({ pressed }) => [styles.row, pressed && { transform: [{ scale: 0.99 }] }]}
                onPress={() => router.push({ pathname: '/word/[id]', params: { id: item.id, code, word: item.word, thumb: thumbs[item.word] ?? '' } })}>
                <WordThumb uri={thumbs[item.word]} art={art} seed={index} />
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
            </Animated.View>
          )}
        />
        {showRail && <AZRail active={railActive} onPick={jumpToLetter} accent={accent} />}
      </View>

      <LanguageSelector visible={picker} languages={languages} value={code} onSelect={setCode} onClose={() => setPicker(false)} />
    </SafeAreaView>
  );
}

function SkeletonRows({ count = 7 }: { count?: number }) {
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.row, { gap: 12 }]}>
          <Skeleton width={52} height={52} radius={radius.md} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="45%" height={18} />
            <Skeleton width="75%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  head: { paddingHorizontal: 20, paddingTop: 6, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: F.display, fontSize: S.display, color: C.ink },
  langChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 36, borderRadius: radius.pill, maxWidth: 170 },
  langChipText: { fontFamily: F.semibold, fontSize: S.label },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 52, ...shadow },
  search: { flex: 1, fontFamily: F.body, fontSize: S.body, color: C.ink },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  chipOn: {},
  chipText: { fontFamily: F.semibold, fontSize: S.small, textTransform: 'capitalize' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.hair, padding: 12, ...shadow },
  thumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: C.sageSoft, overflow: 'hidden' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  wordRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  word: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  pos: { fontFamily: F.serifItalic, fontSize: S.small, color: C.sage },
  meaning: { fontFamily: F.body, fontSize: S.label, color: C.muted, marginTop: 3 },
  empty: { fontFamily: F.body, fontSize: S.label, color: C.muted, textAlign: 'center', paddingVertical: 40, paddingHorizontal: 20, lineHeight: 24 },
});
