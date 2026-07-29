import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { BrandLockup } from './brand';
import { Button } from './kit';
import { useLang } from '../lib/langContext';
import { useAccent } from '../lib/accent';
import { fallbackGovernance, langMeta } from '../lib/langMeta';
import { C, F, LANG_ART, S, radius, shadowStrong } from '../lib/theme';

function PromiseRow({ icon, title, body }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.promiseRow}>
      <View style={styles.promiseIcon}><Ionicons name={icon} size={19} color={C.forest} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.promiseTitle}>{title}</Text>
        <Text style={styles.promiseBody}>{body}</Text>
      </View>
    </View>
  );
}

export function FirstRunWelcome({ onDone }: { onDone: () => void }) {
  const { code, setCode, languages, lang } = useLang();
  const accent = useAccent();
  const meta = langMeta(code);
  const art = LANG_ART[code]?.map;
  const governance = lang?.governance ?? fallbackGovernance(code);
  const languageName = lang?.name ?? 'Kuku Yalanji';

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onDone}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.topbar}>
          <BrandLockup />
          <Pressable
            onPress={onDone}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Skip introduction"
            style={({ pressed }) => [styles.skip, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.skipText}>Skip intro</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            {art ? <Image source={art} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} /> : null}
            <LinearGradient
              colors={['rgba(24,39,29,0.05)', 'rgba(27,45,33,0.72)', C.forestDeep]}
              locations={[0, 0.54, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroBadge}>
              <Ionicons name="book-outline" size={13} color={C.cream} />
              <Text style={styles.heroBadgeText}>SOURCE-BACKED LANGUAGE LEARNING</Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>Find words. Hear voices. Follow the source.</Text>
              <Text style={styles.heroBody}>Mob Translate brings dictionary records, recordings and place names into one calm place—without pretending a machine guess is language knowledge.</Text>
            </View>
          </View>

          <View style={styles.promiseCard}>
            <PromiseRow icon="library-outline" title="A trail, not a black box" body="Open an entry to see its named source, review state and the gaps that still need documenting." />
            <PromiseRow icon="mic-outline" title="Recorded voices come first" body="When a human recording exists, it plays before any clearly marked computer pronunciation guide." />
            <PromiseRow icon="shield-checkmark-outline" title="Useful without borrowed authority" body="Every collection separates source evidence, publication terms and community stewardship. A link never implies endorsement." />
          </View>

          <View style={styles.chooseBlock}>
            <Text style={styles.eyebrow}>CHOOSE WHERE TO BEGIN</Text>
            <Text style={styles.chooseTitle}>Start with a language</Text>
            <Text style={styles.chooseBody}>You can change this from any main screen later.</Text>
            <View style={styles.languageList}>
              {languages.map((language) => {
                const selected = language.code === code;
                const languageMeta = langMeta(language.code);
                return (
                  <Pressable
                    key={language.code}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setCode(language.code);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Begin with ${language.name}, ${languageMeta.region}`}
                    style={({ pressed }) => [
                      styles.languageRow,
                      selected && { borderColor: accent.accent, backgroundColor: accent.accentSoft },
                      pressed && { transform: [{ scale: 0.99 }] },
                    ]}
                  >
                    <View style={[styles.languageDot, { backgroundColor: selected ? accent.accent : C.sageLine }]}>
                      {selected ? <Ionicons name="checkmark" size={15} color={C.white} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.languageName}>{language.name}</Text>
                      <Text style={styles.languageRegion}>{languageMeta.region || 'Language collection'}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.statusCard}>
            <Ionicons name="information-circle-outline" size={20} color={C.clay} />
            <Text style={styles.statusText}>
              <Text style={styles.statusStrong}>{governance.collectionLabel}. </Text>
              {governance.sourceEvidence.label}; {governance.publicationBasis.label.toLowerCase()}; {governance.communityRelationship.label.toLowerCase()}.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button label={`Explore ${languageName}`} icon="arrow-forward" onPress={onDone} full />
          <Text style={styles.footerNote}>{meta.region || 'Your selected language'} · no account needed to learn</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 5, paddingBottom: 12 },
  skip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  skipText: { fontFamily: F.semibold, fontSize: S.small, color: C.muted },
  content: { paddingHorizontal: 20, paddingBottom: 20, gap: 18 },
  hero: { minHeight: 300, justifyContent: 'space-between', overflow: 'hidden', borderRadius: radius.xl, padding: 20, ...shadowStrong },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: 'rgba(27,45,33,0.70)', paddingHorizontal: 10, paddingVertical: 7 },
  heroBadgeText: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.05, color: C.cream },
  heroCopy: { gap: 9 },
  heroTitle: { fontFamily: F.displayBold, fontSize: 34, lineHeight: 39, color: C.cream },
  heroBody: { fontFamily: F.body, fontSize: S.label, lineHeight: 22, color: 'rgba(247,243,234,0.88)' },
  promiseCard: { gap: 15, borderRadius: radius.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.hair, padding: 17 },
  promiseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  promiseIcon: { width: 39, height: 39, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: C.sageSoft },
  promiseTitle: { fontFamily: F.display, fontSize: S.body, color: C.ink },
  promiseBody: { fontFamily: F.body, fontSize: S.small, lineHeight: 19, color: C.muted, marginTop: 2 },
  chooseBlock: { gap: 5 },
  eyebrow: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.3, color: C.sage },
  chooseTitle: { fontFamily: F.displayBold, fontSize: S.title, color: C.ink },
  chooseBody: { fontFamily: F.body, fontSize: S.small, color: C.muted, marginBottom: 7 },
  languageList: { gap: 8 },
  languageRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: C.border, borderRadius: radius.md, paddingHorizontal: 14, backgroundColor: C.surface },
  languageDot: { width: 27, height: 27, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  languageName: { fontFamily: F.display, fontSize: S.body, color: C.ink },
  languageRegion: { fontFamily: F.body, fontSize: S.small, color: C.muted, marginTop: 2 },
  statusCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.md, backgroundColor: C.claySoft, padding: 14 },
  statusText: { flex: 1, fontFamily: F.body, fontSize: S.small, lineHeight: 19, color: C.inkSoft },
  statusStrong: { fontFamily: F.bold, color: C.ink },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderTopWidth: 1, borderTopColor: C.hair, backgroundColor: C.bg, gap: 7 },
  footerNote: { fontFamily: F.medium, fontSize: S.small, color: C.muted, textAlign: 'center' },
});
