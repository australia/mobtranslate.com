import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  AudioSourceBadge, Button, Card, CTABanner, LangCard, LanguageSelector, Screen, SectionHeader, SpeakerButton, TopBar,
} from '../../components/kit';
import { Skeleton, SkeletonLines } from '../../components/Skeleton';
import { ProvenancePanel } from '../../components/ProvenancePanel';
import { API_BASE, getWordRecordings, searchWords, type ExistingRecording, type SearchHit } from '../../lib/api';
import { useLang } from '../../lib/langContext';
import { useAccent, AccentWash } from '../../lib/accent';
import { fallbackGovernance, langMeta } from '../../lib/langMeta';
import { getWordOfDay, type WordOfDay } from '../../lib/wotd';
import { C, F, S, radius, shadowStrong, LANG_ART } from '../../lib/theme';

const QUICK_LOOKUPS: Record<string, string[]> = {
  kuku_yalanji: ['water', 'child', 'woman', 'country'],
  anindilyakwa: ['water', 'man', 'fish'],
  migmaq: ['water', 'child', 'woman', 'country'],
};

export default function HomeScreen() {
  const { code, setCode, languages, lang } = useLang();
  const accent = useAccent();
  const router = useRouter();
  const [picker, setPicker] = useState(false);
  const [input, setInput] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wotd, setWotd] = useState<WordOfDay | null>(null);
  const [wotdRecording, setWotdRecording] = useState<ExistingRecording | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setWotd(null);
    setWotdRecording(undefined);
    getWordOfDay(code).then(async (word) => {
      if (!active) return;
      setWotd(word);
      if (!word.id) { setWotdRecording(null); return; }
      const recordings = await getWordRecordings(word.id);
      if (active) setWotdRecording(recordings[0] ?? null);
    });
    return () => { active = false; };
  }, [code]);

  const langName = lang?.name ?? 'Kuku Yalanji';
  const meta = langMeta(code);
  const art = LANG_ART[code];
  const governance = lang?.governance ?? fallbackGovernance(code);
  const quickLookups = QUICK_LOOKUPS[code] ?? ['water', 'family', 'country'];

  function updateInput(text: string) {
    setInput(text);
    setHits([]);
    setSearchedQuery('');
    setError(null);
  }

  function chooseLanguage(nextCode: string) {
    setCode(nextCode);
    setHits([]);
    setSearchedQuery('');
    setError(null);
  }

  async function onLookup() {
    const text = input.trim();
    if (!text) return;
    setLoading(true);
    setHits([]);
    setSearchedQuery('');
    setError(null);
    try {
      const matches = await searchWords(code, text);
      setHits(matches.slice(0, 6));
      setSearchedQuery(text);
    } catch {
      setError("We couldn't reach the dictionary just now. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <AccentWash height={360} />
      <TopBar onSearch={() => router.push('/dictionary')} onProfile={() => router.push('/account')} />

      <Pressable
        onPress={() => setPicker(true)}
        accessibilityRole="button"
        accessibilityLabel={`Current language ${langName}. Change language`}
        style={({ pressed }) => [styles.hero, pressed && styles.heroPressed]}
      >
        {art?.map ? <Image source={art.map} style={styles.heroMap} resizeMode="cover" /> : null}
        <LinearGradient
          colors={['rgba(22,37,27,0.12)', 'rgba(25,43,31,0.70)', C.forestDeep]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroTopRow}>
          <View style={styles.heroPill}>
            <Ionicons name="language-outline" size={13} color={C.cream} />
            <Text style={styles.heroPillText}>CURRENT LANGUAGE</Text>
          </View>
          <View style={styles.heroChange}>
            <Text style={styles.heroChangeText}>Change</Text>
            <Ionicons name="chevron-down" size={15} color={C.cream} />
          </View>
        </View>
        <View style={styles.heroCopy}>
          <View style={styles.heroLocation}>
            <Ionicons name="location" size={13} color={C.clayBright} />
            <Text style={styles.heroRegion}>{meta.region}</Text>
          </View>
          <Text style={styles.heroName}>{langName}</Text>
          <Text style={styles.heroTagline}>{meta.tagline}</Text>
          <View style={styles.heroArtNote}>
            <Ionicons name="sparkles-outline" size={11} color="rgba(247,243,234,0.72)" />
            <Text style={styles.heroArtNoteText}>Illustrative landscape</Text>
          </View>
        </View>
      </Pressable>

      <ProvenancePanel
        tone={governance.sourceEvidence.status === 'documented' ? 'dictionary' : 'working'}
        eyebrow="ABOUT THIS COLLECTION"
        title={governance.collectionLabel}
        body="See what this collection is based on, which publication terms are documented, and whether a community stewardship relationship has been recorded."
        detail={`${governance.sourceEvidence.label} · ${governance.publicationBasis.label}`}
        actionLabel="View collection status"
        onAction={() => Linking.openURL(`${API_BASE}/dictionaries/${code}#collection-status`)}
      />

      <Card style={{ ...styles.composer, borderColor: accent.accentLine }}>
        <View style={styles.composerHeading}>
          <View style={styles.composerTitleWrap}>
            <Text style={[styles.composerEyebrow, { color: accent.accent }]}>DICTIONARY LOOKUP</Text>
            <Text style={styles.composerTitle}>Find a word in {langName}</Text>
          </View>
          <Pressable
            onPress={() => setPicker(true)}
            hitSlop={5}
            accessibilityRole="button"
            accessibilityLabel={`Search the ${langName} dictionary. Change language`}
            style={({ pressed }) => [styles.languageRoute, { backgroundColor: accent.accentSoft }, pressed && { opacity: 0.7 }]}
          >
            <Text style={[styles.routeText, { color: accent.accentDeep }]}>EN</Text>
            <Ionicons name="swap-horizontal" size={13} color={accent.accent} />
            <Text style={[styles.routeText, { color: accent.accentDeep }]}>{langName.slice(0, 3).toUpperCase()}</Text>
          </Pressable>
        </View>

        <View style={styles.inputWrap}>
          <Ionicons name="search" size={20} color={accent.accent} />
          <TextInput
            value={input}
            onChangeText={updateInput}
            onSubmitEditing={onLookup}
            placeholder="Search a word or English meaning"
            placeholderTextColor={C.faint}
            returnKeyType="search"
            maxLength={80}
            style={styles.input}
            accessibilityLabel={`Search the ${langName} dictionary`}
          />
        </View>

        <View style={styles.quickBlock}>
          <Text style={styles.quickLabel}>TRY A MEANING</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickScrollOuter}
            contentContainerStyle={styles.quickScroll}
          >
            {quickLookups.map((query) => (
              <Pressable
                key={query}
                onPress={() => updateInput(query)}
                accessibilityRole="button"
                accessibilityLabel={`Look up ${query}`}
                style={({ pressed }) => [styles.quickPhrase, input === query && styles.quickPhraseActive, pressed && { opacity: 0.72 }]}
              >
                <Text style={[styles.quickPhraseText, input === query && styles.quickPhraseTextActive]}>{query}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <Button
          label={input.trim() ? `Search ${langName}` : 'Type a word or meaning'}
          icon="search"
          onPress={onLookup}
          loading={loading}
          disabled={!input.trim()}
          full
        />

        {error ? (
          <Animated.View entering={FadeInDown.springify().damping(18).mass(0.7)} style={styles.errorBox} accessibilityRole="alert">
            <View style={styles.errorIcon}><Ionicons name="cloud-offline-outline" size={20} color={C.clay} /></View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.errorTitle}>Dictionary unavailable</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
            <Pressable onPress={onLookup} accessibilityRole="button" accessibilityLabel="Retry dictionary search" style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {searchedQuery && !loading ? (
          <Animated.View entering={FadeInDown.springify().damping(18).mass(0.7)} style={styles.resultArea}>
            <View style={styles.resultHeader}>
              <View style={styles.resultReady}>
                <Ionicons name="book-outline" size={16} color={C.forest} />
                <Text style={styles.resultLabel}>
                  {hits.length > 0 ? `${hits.length} DICTIONARY ${hits.length === 1 ? 'ENTRY' : 'ENTRIES'}` : 'NO ENTRY FOUND'}
                </Text>
              </View>
              <Text style={styles.sourceHint}>OPEN FOR SOURCES</Text>
            </View>
            {hits.length > 0 ? (
              <View style={styles.searchResults}>
                {hits.map((hit, index) => (
                  <Pressable
                    key={hit.wordId}
                    onPress={() => router.push({ pathname: '/word/[id]', params: { id: hit.wordId, code, word: hit.word } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${hit.word}, ${hit.meaning || 'open dictionary entry'}`}
                    style={({ pressed }) => [
                      styles.searchResult,
                      index > 0 && styles.searchResultBorder,
                      pressed && { backgroundColor: accent.accentSoft },
                    ]}
                  >
                    <View style={styles.searchResultCopy}>
                      <View style={styles.searchResultTitleRow}>
                        <Text style={styles.searchResultWord} accessibilityLanguage={meta.languageTag}>{hit.word}</Text>
                        {hit.wordClass ? <Text style={[styles.searchResultClass, { color: accent.accent }]}>{hit.wordClass}</Text> : null}
                      </View>
                      <Text style={styles.searchResultMeaning} numberOfLines={2}>
                        {hit.meaning || 'Meaning recorded on the dictionary entry'}
                      </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={17} color={accent.accent} />
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.emptyResult}>
                <View style={[styles.emptyResultIcon, { backgroundColor: accent.accentSoft }]}>
                  <Ionicons name="book-outline" size={22} color={accent.accent} />
                </View>
                <Text style={styles.emptyResultTitle}>No matching entry yet</Text>
                <Text style={styles.emptyResultBody}>
                  Try a shorter word or browse the collection. A missing result stays missing instead of being filled with a machine guess.
                </Text>
                <Pressable onPress={() => router.push('/dictionary')} style={styles.browseRow} accessibilityRole="button">
                  <Text style={[styles.browseText, { color: accent.accent }]}>Browse {langName}</Text>
                  <Ionicons name="arrow-forward" size={15} color={accent.accent} />
                </Pressable>
              </View>
            )}
            {hits.length > 0 ? (
              <ProvenancePanel
                tone="dictionary"
                eyebrow="KNOWLEDGE TRAIL"
                title="Recorded entries, not generated sentences"
                body="Open an entry to see its exact source, review status, usage notes, and whether a speaker recording is available."
              />
            ) : null}
          </Animated.View>
        ) : null}
      </Card>

      <Pressable
        onPress={() => router.push('/learn')}
        accessibilityRole="button"
        accessibilityLabel={`Start today's five-word ${langName} practice`}
        style={({ pressed }) => [
          styles.practiceCard,
          { borderColor: accent.accentLine, backgroundColor: accent.accentSoft },
          pressed && { transform: [{ scale: 0.992 }], opacity: 0.86 },
        ]}
      >
        <View style={[styles.practiceIcon, { backgroundColor: accent.accent }]}>
          <Ionicons name="leaf" size={21} color={C.white} />
        </View>
        <View style={styles.practiceCopy}>
          <Text style={[styles.practiceEyebrow, { color: accent.accent }]}>YOUR DAILY FIVE</Text>
          <Text style={styles.practiceTitle}>Carry five words forward</Text>
          <Text style={styles.practiceBody}>Listen, match the meaning, and keep the source close.</Text>
        </View>
        <View style={styles.practiceArrow}>
          <Ionicons name="arrow-forward" size={18} color={accent.accent} />
        </View>
      </Pressable>

      <View style={styles.sectionBlock}>
        <SectionHeader title="Explore languages" actionLabel="Open map" onAction={() => router.push('/map')} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={styles.langScroll}
        >
          {languages.map((language) => (
            <LangCard
              key={language.code}
              name={language.name}
              region={langMeta(language.code).region}
              art={LANG_ART[language.code]?.art}
              selected={language.code === code}
              onPress={() => chooseLanguage(language.code)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.wotdHeading}>
          <Text style={styles.eyebrow}>A WORD FOR TODAY</Text>
          <View style={[styles.dailyDot, { backgroundColor: accent.accent }]} />
        </View>
        {wotd ? (
          <Animated.View entering={FadeIn.duration(360)}>
          <Card padded={false} style={styles.wotdCard}>
            <View style={styles.wotdRow}>
              <View style={styles.wotdText}>
                <View style={styles.wotdWordRow}>
                  <Text style={styles.wotdWord} accessibilityLanguage={meta.languageTag} numberOfLines={1}>{wotd.word}</Text>
                  <SpeakerButton code={code} text={wotd.word} wordId={wotd.id} recording={wotdRecording} size="sm" />
                </View>
                {wotd.meaning ? <Text style={styles.wotdMeaning} numberOfLines={2}>{wotd.meaning}</Text> : null}
                {wotd.example ? <Text style={styles.wotdExample} numberOfLines={2}>{wotd.example}</Text> : null}
                <AudioSourceBadge recording={wotdRecording} loading={wotdRecording === undefined} compact />
                <Pressable
                  onPress={() => wotd.id
                    ? router.push({ pathname: '/word/[id]', params: { id: wotd.id, code, word: wotd.word } })
                    : router.push('/dictionary')}
                  accessibilityRole="button"
                  accessibilityLabel={`${wotd.word}, ${wotd.meaning}. Open dictionary`}
                  style={({ pressed }) => [styles.learnRow, pressed && { opacity: 0.65 }]}
                >
                  <Text style={styles.learnText}>Learn this word</Text>
                  <Ionicons name="arrow-forward" size={14} color={C.forest} />
                </Pressable>
              </View>
              {wotd.image ? <Image source={wotd.image} style={styles.wotdImg} resizeMode="cover" /> : null}
            </View>
          </Card>
          </Animated.View>
        ) : (
          <Card padded={false} style={styles.wotdCard}>
            <View style={styles.wotdRow}>
              <View style={[styles.wotdText, { gap: 10 }]}>
                <Skeleton width="55%" height={22} radius={8} />
                <SkeletonLines count={2} height={12} />
              </View>
              <Skeleton width={118} height={154} radius={0} />
            </View>
          </Card>
        )}
      </View>

      <CTABanner
        title="Your voice can carry this forward"
        sub={`Record a word and help keep ${langName} strong.`}
        cta="Add your voice"
        onPress={() => router.push('/record')}
      />

      <LanguageSelector
        visible={picker}
        languages={languages}
        value={code}
        onSelect={chooseLanguage}
        onClose={() => setPicker(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 238,
    borderRadius: radius.xl,
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: 18,
    backgroundColor: C.forestDeep,
    ...shadowStrong,
  },
  heroPressed: { transform: [{ scale: 0.992 }], opacity: 0.96 },
  heroMap: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(26,43,31,0.72)', borderRadius: radius.pill, paddingHorizontal: 10, height: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  heroPillText: { fontFamily: F.bold, fontSize: 10, letterSpacing: 1.15, color: C.cream },
  heroChange: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.pill, paddingHorizontal: 11, height: 32 },
  heroChangeText: { fontFamily: F.semibold, fontSize: S.small, color: C.cream },
  heroCopy: { gap: 4, maxWidth: '92%' },
  heroLocation: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 1 },
  heroRegion: { fontFamily: F.semibold, fontSize: S.small, color: 'rgba(247,243,234,0.82)' },
  heroName: { fontFamily: F.displayBold, fontSize: 38, color: C.white, lineHeight: 42 },
  heroTagline: { fontFamily: F.serifItalic, fontSize: S.body, color: C.cream, lineHeight: 23 },
  heroArtNote: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  heroArtNoteText: { fontFamily: F.medium, fontSize: 10, letterSpacing: 0.6, color: 'rgba(247,243,234,0.72)', textTransform: 'uppercase' },

  composer: { gap: 16, padding: 18, borderColor: C.sageLine },
  composerHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  composerTitleWrap: { flex: 1, gap: 3 },
  composerEyebrow: { fontFamily: F.bold, fontSize: 10, letterSpacing: 1.35, color: C.clay },
  composerTitle: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  languageRoute: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, borderRadius: radius.pill, backgroundColor: C.sageSoft, paddingHorizontal: 10 },
  routeText: { fontFamily: F.bold, fontSize: 11, color: C.forest },
  inputWrap: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, borderRadius: radius.lg, borderWidth: 1.5, borderColor: C.sageLine, backgroundColor: C.surfaceAlt, overflow: 'hidden' },
  input: { flex: 1, minHeight: 62, fontFamily: F.body, fontSize: S.body, color: C.ink },
  quickBlock: { gap: 7 },
  quickLabel: { fontFamily: F.bold, fontSize: 10, letterSpacing: 1.15, color: C.muted },
  quickScrollOuter: { marginHorizontal: -18 },
  quickScroll: { gap: 8, paddingHorizontal: 18 },
  quickPhrase: { height: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  quickPhraseActive: { backgroundColor: C.claySoft, borderColor: C.clay },
  quickPhraseText: { fontFamily: F.semibold, fontSize: S.small, color: C.inkSoft },
  quickPhraseTextActive: { color: C.clay },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md, padding: 12, backgroundColor: C.claySoft },
  errorIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: C.surface },
  errorTitle: { fontFamily: F.bold, fontSize: S.small, color: C.ink },
  errorText: { fontFamily: F.body, fontSize: 12, color: C.muted, lineHeight: 17 },
  retryButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 10 },
  retryText: { fontFamily: F.bold, fontSize: S.small, color: C.clay },

  resultArea: { borderTopWidth: 1, borderTopColor: C.hair, paddingTop: 15, gap: 11 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultReady: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  resultLabel: { fontFamily: F.bold, fontSize: 10, letterSpacing: 1.1, color: C.success },
  sourceHint: { fontFamily: F.bold, fontSize: 9, letterSpacing: 0.9, color: C.faint },
  searchResults: { borderWidth: 1, borderColor: C.sageLine, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: C.surface },
  searchResult: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 12 },
  searchResultBorder: { borderTopWidth: 1, borderTopColor: C.hair },
  searchResultCopy: { flex: 1, gap: 3 },
  searchResultTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  searchResultWord: { flexShrink: 1, fontFamily: F.displayBold, fontSize: S.heading, color: C.ink },
  searchResultClass: { fontFamily: F.semibold, fontSize: 10, color: C.sage },
  searchResultMeaning: { fontFamily: F.body, fontSize: S.small, lineHeight: 18, color: C.muted },
  emptyResult: { alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 8 },
  emptyResultIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: C.sageSoft },
  emptyResultTitle: { fontFamily: F.displayBold, fontSize: S.heading, color: C.ink, textAlign: 'center' },
  emptyResultBody: { fontFamily: F.body, fontSize: S.small, lineHeight: 19, color: C.muted, textAlign: 'center' },
  browseRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8 },
  browseText: { fontFamily: F.bold, fontSize: S.small, color: C.sage },

  practiceCard: { minHeight: 126, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, borderRadius: radius.xl, borderWidth: 1.5, ...shadowStrong },
  practiceIcon: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  practiceCopy: { flex: 1, gap: 3 },
  practiceEyebrow: { fontFamily: F.bold, fontSize: 9, letterSpacing: 1.25 },
  practiceTitle: { fontFamily: F.displayBold, fontSize: S.heading, color: C.ink },
  practiceBody: { fontFamily: F.body, fontSize: 12, lineHeight: 17, color: C.muted },
  practiceArrow: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.62)', alignItems: 'center', justifyContent: 'center' },

  sectionBlock: { gap: 12 },
  bleed: { marginHorizontal: -20 },
  langScroll: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingRight: 8 },

  wotdHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrow: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.sage },
  dailyDot: { width: 5, height: 5, borderRadius: radius.pill, backgroundColor: C.clay },
  wotdCard: { overflow: 'hidden', borderColor: C.sageLine },
  wotdRow: { flexDirection: 'row', minHeight: 154 },
  wotdText: { flex: 1, padding: 16, gap: 6, justifyContent: 'center' },
  wotdWordRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  wotdWord: { fontFamily: F.displayBold, fontSize: S.title, color: C.ink, flexShrink: 1 },
  wotdMeaning: { fontFamily: F.semibold, fontSize: S.small + 1, color: C.clay },
  wotdExample: { fontFamily: F.serifItalic, fontSize: S.small + 1, color: C.muted, lineHeight: 19 },
  learnRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  learnText: { fontFamily: F.bold, fontSize: 11, color: C.forest },
  wotdImg: { width: 118, minHeight: 154 },
});
