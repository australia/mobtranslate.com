import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  Button, Card, CTABanner, LangCard, LanguageSelector, Screen, SectionHeader, SpeakerButton, TopBar,
} from '../../components/kit';
import { Skeleton, SkeletonLines } from '../../components/Skeleton';
import { CorrectionModal } from '../../components/CorrectionModal';
import { ProvenancePanel } from '../../components/ProvenancePanel';
import { translate, type TranslationResult } from '../../lib/api';
import { useLang } from '../../lib/langContext';
import { useAccent, AccentWash } from '../../lib/accent';
import { langMeta } from '../../lib/langMeta';
import { getWordOfDay, type WordOfDay } from '../../lib/wotd';
import { C, F, S, radius, shadowStrong, LANG_ART } from '../../lib/theme';

const QUICK_PHRASES = ['Hello', 'Thank you', 'How are you?', 'Where is water?'];

export default function HomeScreen() {
  const { code, setCode, languages, lang } = useLang();
  const accent = useAccent();
  const router = useRouter();
  const [picker, setPicker] = useState(false);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wotd, setWotd] = useState<WordOfDay | null>(null);
  const [correct, setCorrect] = useState(false);

  useEffect(() => {
    let active = true;
    setWotd(null);
    getWordOfDay(code).then((word) => { if (active) setWotd(word); });
    return () => { active = false; };
  }, [code]);

  const langName = lang?.name ?? 'Kuku Yalanji';
  const meta = langMeta(code);
  const art = LANG_ART[code];

  function updateInput(text: string) {
    setInput(text);
    setResult(null);
    setError(null);
  }

  function chooseLanguage(nextCode: string) {
    setCode(nextCode);
    setResult(null);
    setError(null);
  }

  async function onTranslate() {
    const text = input.trim();
    if (!text) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const translated = await translate(code, text);
      if (!translated.translation.trim()) throw new Error('Empty translation');
      setResult(translated);
    } catch {
      setError("We couldn't translate that just now. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function shareTranslation() {
    if (!result) return;
    const status = result.kind === 'dictionary'
      ? `Direct Mob Translate dictionary match.${result.sourceUrl ? `\n${result.sourceUrl}` : ''}`
      : 'Machine suggestion — not community verified';
    await Share.share({
      message: `${input.trim()}\n${result.translation}\n\n${status}\n${langName} via Mob Translate`,
    });
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
            <Ionicons name="sparkles" size={13} color={C.cream} />
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
        </View>
      </Pressable>

      <Card style={{ ...styles.composer, borderColor: accent.accentLine }}>
        <View style={styles.composerHeading}>
          <View style={styles.composerTitleWrap}>
            <Text style={[styles.composerEyebrow, { color: accent.accent }]}>TRANSLATE</Text>
            <Text style={styles.composerTitle}>Say it in {langName}</Text>
          </View>
          <Pressable
            onPress={() => setPicker(true)}
            hitSlop={5}
            accessibilityRole="button"
            accessibilityLabel={`Translate from English to ${langName}. Change language`}
            style={({ pressed }) => [styles.languageRoute, { backgroundColor: accent.accentSoft }, pressed && { opacity: 0.7 }]}
          >
            <Text style={[styles.routeText, { color: accent.accentDeep }]}>EN</Text>
            <Ionicons name="arrow-forward" size={13} color={accent.accent} />
            <Text style={[styles.routeText, { color: accent.accentDeep }]}>{langName.slice(0, 3).toUpperCase()}</Text>
          </Pressable>
        </View>

        <View style={styles.inputWrap}>
          <TextInput
            value={input}
            onChangeText={updateInput}
            placeholder="What would you like to say?"
            placeholderTextColor={C.faint}
            multiline
            maxLength={240}
            style={styles.input}
            accessibilityLabel="English text to translate"
          />
          <Text style={styles.characterCount}>{input.length}/240</Text>
        </View>

        <View style={styles.quickBlock}>
          <Text style={styles.quickLabel}>QUICK PHRASES</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickScrollOuter}
            contentContainerStyle={styles.quickScroll}
          >
            {QUICK_PHRASES.map((phrase) => (
              <Pressable
                key={phrase}
                onPress={() => updateInput(phrase)}
                accessibilityRole="button"
                accessibilityLabel={`Use phrase ${phrase}`}
                style={({ pressed }) => [styles.quickPhrase, input === phrase && styles.quickPhraseActive, pressed && { opacity: 0.72 }]}
              >
                <Text style={[styles.quickPhraseText, input === phrase && styles.quickPhraseTextActive]}>{phrase}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <Button
          label={input.trim() ? `Translate to ${langName}` : 'Type something to translate'}
          icon="sparkles"
          onPress={onTranslate}
          loading={loading}
          disabled={!input.trim()}
          full
        />

        {error ? (
          <Animated.View entering={FadeInDown.springify().damping(18).mass(0.7)} style={styles.errorBox} accessibilityRole="alert">
            <View style={styles.errorIcon}><Ionicons name="cloud-offline-outline" size={20} color={C.clay} /></View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.errorTitle}>Translation paused</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
            <Pressable onPress={onTranslate} accessibilityRole="button" accessibilityLabel="Retry translation" style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {result ? (
          <Animated.View entering={FadeInDown.springify().damping(18).mass(0.7)} style={styles.resultArea}>
            <View style={styles.resultHeader}>
              <View style={styles.resultReady}>
                <Ionicons
                  name={result.kind === 'dictionary' ? 'book-outline' : 'sparkles-outline'}
                  size={16}
                  color={result.kind === 'dictionary' ? C.forest : C.clay}
                />
                <Text style={[styles.resultLabel, { color: result.kind === 'dictionary' ? C.forest : C.clay }]}>
                  {result.kind === 'dictionary' ? 'DICTIONARY MATCH' : 'MACHINE SUGGESTION'}
                </Text>
              </View>
              <Pressable
                onPress={shareTranslation}
                accessibilityRole="button"
                accessibilityLabel="Share translation"
                style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.65 }]}
              >
                <Ionicons name="share-outline" size={18} color={C.forest} />
                <Text style={styles.shareText}>Share</Text>
              </Pressable>
            </View>
            <View style={[styles.resultBox, { backgroundColor: accent.accentSoft }]}>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={[styles.resultText, { color: accent.accentDeep }]} selectable>{result.translation}</Text>
                {result.gloss ? <Text style={styles.resultGloss}>{result.gloss}</Text> : null}
              </View>
              <SpeakerButton code={code} text={result.translation} size="lg" />
            </View>
            {result.kind === 'dictionary' ? (
              <ProvenancePanel
                tone="dictionary"
                eyebrow="KNOWLEDGE TRAIL"
                title="From the working dictionary"
                body="This is a direct dictionary match, not a generated sentence. Open the entry to see its source and review status."
                actionLabel={result.sourceUrl ? 'Open dictionary entry' : undefined}
                onAction={result.sourceUrl ? () => Linking.openURL(result.sourceUrl!) : undefined}
              />
            ) : (
              <ProvenancePanel
                tone="machine"
                eyebrow="KNOWLEDGE TRAIL"
                title="A suggestion, not the final word"
                body="This suggestion was generated from dictionary evidence and has not been community verified. For important or sensitive use, check with a speaker or language keeper."
              />
            )}
            <Pressable
              onPress={() => setCorrect(true)}
              style={styles.suggestRow}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Suggest a better translation"
            >
              <Ionicons name="create-outline" size={15} color={accent.accent} />
              <Text style={[styles.suggestText, { color: accent.accent }]}>Help improve this translation</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </Card>

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
                  <Text style={styles.wotdWord} numberOfLines={1}>{wotd.word}</Text>
                  <SpeakerButton code={code} text={wotd.word} size="sm" />
                </View>
                {wotd.meaning ? <Text style={styles.wotdMeaning} numberOfLines={2}>{wotd.meaning}</Text> : null}
                {wotd.example ? <Text style={styles.wotdExample} numberOfLines={2}>{wotd.example}</Text> : null}
                <Pressable
                  onPress={() => router.push('/dictionary')}
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

      <CorrectionModal
        visible={correct}
        target={result ? { kind: 'translation', languageCode: code, sourceText: input, currentTranslation: result.translation } : null}
        onClose={() => setCorrect(false)}
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

  composer: { gap: 16, padding: 18, borderColor: C.sageLine },
  composerHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  composerTitleWrap: { flex: 1, gap: 3 },
  composerEyebrow: { fontFamily: F.bold, fontSize: 10, letterSpacing: 1.35, color: C.clay },
  composerTitle: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  languageRoute: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, borderRadius: radius.pill, backgroundColor: C.sageSoft, paddingHorizontal: 10 },
  routeText: { fontFamily: F.bold, fontSize: 11, color: C.forest },
  inputWrap: { minHeight: 116, borderRadius: radius.lg, borderWidth: 1.5, borderColor: C.sageLine, backgroundColor: C.surfaceAlt, overflow: 'hidden' },
  input: { minHeight: 88, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 8, fontFamily: F.body, fontSize: S.body, color: C.ink, textAlignVertical: 'top' },
  characterCount: { alignSelf: 'flex-end', paddingRight: 12, paddingBottom: 9, fontFamily: F.medium, fontSize: 10, color: C.faint },
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
  shareButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8 },
  shareText: { fontFamily: F.bold, fontSize: S.small, color: C.forest },
  resultBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.sageSoft, borderRadius: radius.lg, padding: 16 },
  resultText: { fontFamily: F.display, fontSize: S.title, color: C.forestDeep, lineHeight: 31 },
  resultGloss: { fontFamily: F.body, fontSize: S.label, color: C.muted, lineHeight: 21 },
  suggestRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  suggestText: { fontFamily: F.semibold, fontSize: S.small, color: C.sage },

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
