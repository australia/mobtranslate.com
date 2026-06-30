import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Button, Card, Chip, CTABanner, LangCard, LanguageSelector, Screen, SectionHeader, SpeakerButton, TopBar,
} from '../../components/kit';
import { CorrectionModal } from '../../components/CorrectionModal';
import { translate } from '../../lib/api';
import { useLang } from '../../lib/langContext';
import { langMeta } from '../../lib/langMeta';
import { getWordOfDay, type WordOfDay } from '../../lib/wotd';
import { C, F, S, radius, LANG_ART } from '../../lib/theme';

export default function HomeScreen() {
  const { code, setCode, languages, lang } = useLang();
  const router = useRouter();
  const [picker, setPicker] = useState(false);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<{ translation: string; gloss?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [wotd, setWotd] = useState<WordOfDay | null>(null);
  const [correct, setCorrect] = useState(false);

  useEffect(() => { let on = true; setWotd(null); getWordOfDay(code).then((w) => on && setWotd(w)); return () => { on = false; }; }, [code]);

  const langName = lang?.name ?? 'Kuku Yalanji';
  const meta = langMeta(code);
  const art = LANG_ART[code];

  async function onTranslate() {
    if (!input.trim()) return;
    setLoading(true); setResult(null);
    try { setResult(await translate(code, input.trim())); } catch { setResult(null); }
    finally { setLoading(false); }
  }

  return (
    <Screen>
      <TopBar onSearch={() => router.push('/dictionary')} onProfile={() => router.push('/account')} />

      {/* ── Hero (tap the name to change language) ── */}
      <Pressable onPress={() => setPicker(true)} style={styles.hero}>
        {art?.map && (
          <View style={styles.heroMapWrap} pointerEvents="none">
            <Image source={art.map} style={styles.heroMap} resizeMode="cover" />
            <LinearGradient
              colors={[C.bg, 'rgba(244,241,232,0.78)', 'rgba(244,241,232,0.15)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill}
            />
            <View style={styles.pin}><Ionicons name="location" size={16} color={C.white} /></View>
          </View>
        )}
        <View style={styles.heroNameRow}>
          <Text style={styles.heroName}>{langName}</Text>
          <Ionicons name="chevron-down" size={22} color={C.sage} style={{ marginTop: 6 }} />
        </View>
        <Text style={styles.heroRegion}>{meta.region}</Text>
        <Text style={styles.heroTagline}>{meta.tagline}</Text>
        {!!meta.place && <View style={{ marginTop: 12 }}><Chip label={meta.place} icon="location-outline" /></View>}
      </Pressable>

      {/* ── Translate widget ── */}
      <Card style={{ gap: 14 }}>
        <Text style={styles.fieldLabel}>Translate to {langName}</Text>
        <TextInput
          value={input} onChangeText={setInput}
          placeholder="Type in English…" placeholderTextColor={C.muted}
          multiline style={styles.input}
        />
        <View style={styles.dirRow}>
          <View style={styles.dirPill}><Text style={styles.dirText}>English</Text></View>
          <View style={styles.swap}><Ionicons name="arrow-forward" size={16} color={C.sage} /></View>
          <Pressable style={styles.dirPillBtn} onPress={() => setPicker(true)}>
            <Text style={styles.dirText} numberOfLines={1}>{langName}</Text>
            <Ionicons name="chevron-down" size={15} color={C.muted} />
          </Pressable>
        </View>
        <Button label="Translate" icon="arrow-forward" onPress={onTranslate} loading={loading} disabled={!input.trim()} full />

        {result && (
          <>
            <View style={styles.resultBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultText} selectable>{result.translation}</Text>
                {!!result.gloss && <Text style={styles.resultGloss}>{result.gloss}</Text>}
              </View>
              <SpeakerButton code={code} text={result.translation} size="md" />
            </View>
            <Pressable onPress={() => setCorrect(true)} style={styles.suggestRow} hitSlop={6}>
              <Ionicons name="create-outline" size={15} color={C.sage} />
              <Text style={styles.suggestText}>Suggest a better translation</Text>
            </Pressable>
          </>
        )}
      </Card>

      {/* ── Explore other languages ── */}
      <View style={{ gap: 12 }}>
        <SectionHeader title="Explore other languages" actionLabel="See all" onAction={() => router.push('/map')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -20 }} contentContainerStyle={styles.langScroll}>
          {languages.map((l) => (
            <LangCard
              key={l.code} name={l.name} region={langMeta(l.code).region}
              art={LANG_ART[l.code]?.art} selected={l.code === code}
              onPress={() => { setCode(l.code); setResult(null); }}
            />
          ))}
        </ScrollView>
      </View>

      {/* ── Word of the day (per tribe) ── */}
      {wotd && (
        <View style={{ gap: 10 }}>
          <Text style={styles.eyebrow}>WORD OF THE DAY</Text>
          <Pressable onPress={() => router.push('/dictionary')}>
            <Card padded={false} style={{ overflow: 'hidden' }}>
              <View style={styles.wotdRow}>
                <View style={styles.wotdText}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={styles.wotdWord} numberOfLines={1}>{wotd.word}</Text>
                    <SpeakerButton code={code} text={wotd.word} size="sm" />
                  </View>
                  {!!wotd.meaning && <Text style={styles.wotdMeaning} numberOfLines={2}>{wotd.meaning}</Text>}
                  {!!wotd.example && <Text style={styles.wotdExample} numberOfLines={2}>{wotd.example}</Text>}
                </View>
                {!!wotd.image && <Image source={wotd.image} style={styles.wotdImg} resizeMode="cover" />}
              </View>
            </Card>
          </Pressable>
        </View>
      )}

      {/* ── CTA ── */}
      <CTABanner
        title={`Ready to learn ${langName}?`}
        sub="Build vocabulary, hear stories, and learn together."
        cta="Start learning"
        onPress={() => router.push('/dictionary')}
      />

      <LanguageSelector visible={picker} languages={languages} value={code}
        onSelect={(c) => { setCode(c); setResult(null); }} onClose={() => setPicker(false)} />

      <CorrectionModal
        visible={correct}
        target={result ? { kind: 'translation', languageCode: code, sourceText: input, currentTranslation: result.translation } : null}
        onClose={() => setCorrect(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingTop: 6, minHeight: 150, justifyContent: 'center' },
  heroMapWrap: { position: 'absolute', right: -20, top: -6, bottom: -6, width: 230, overflow: 'hidden' },
  heroMap: { width: '100%', height: '100%', opacity: 0.7 },
  pin: { position: 'absolute', right: 70, top: '42%', width: 30, height: 30, borderRadius: radius.pill, backgroundColor: C.clay, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white },
  heroNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  heroName: { fontFamily: F.displayBold, fontSize: S.hero, color: C.ink, lineHeight: S.hero * 1.02 },
  heroRegion: { fontFamily: F.serifMedItalic, fontSize: S.title, color: C.sage, marginTop: 2 },
  heroTagline: { fontFamily: F.serifItalic, fontSize: S.body, color: C.muted, marginTop: 8 },

  fieldLabel: { fontFamily: F.medium, fontSize: S.small, color: C.muted },
  input: { backgroundColor: C.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, padding: 15, fontFamily: F.body, fontSize: S.body, color: C.ink, minHeight: 92, textAlignVertical: 'top' },

  dirRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dirPill: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  dirPillBtn: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: C.sageLine, backgroundColor: C.sageSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dirText: { fontFamily: F.semibold, fontSize: S.label, color: C.ink },
  swap: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: C.sageSoft, alignItems: 'center', justifyContent: 'center' },

  resultBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.sageSoft, borderRadius: radius.md, padding: 14 },
  resultText: { fontFamily: F.display, fontSize: S.heading, color: C.forestDeep },
  resultGloss: { fontFamily: F.body, fontSize: S.label, color: C.muted, marginTop: 3 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: 4 },
  suggestText: { fontFamily: F.semibold, fontSize: S.small, color: C.sage },

  langScroll: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingRight: 8 },

  eyebrow: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.sage },
  wotdRow: { flexDirection: 'row', height: 132 },
  wotdText: { flex: 1, padding: 16, gap: 5, justifyContent: 'center' },
  wotdWord: { fontFamily: F.displayBold, fontSize: S.title, color: C.ink, flexShrink: 1 },
  wotdMeaning: { fontFamily: F.semibold, fontSize: S.small + 1, color: C.clay },
  wotdExample: { fontFamily: F.serifItalic, fontSize: S.small + 1, color: C.muted, lineHeight: 19 },
  wotdImg: { width: 116, height: 132 },
});
