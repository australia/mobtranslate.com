import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  AudioSourceBadge, Button, Card, LanguageSelector, Screen, SpeakerButton, TopBar,
} from '../../components/kit';
import { Skeleton, SkeletonLines } from '../../components/Skeleton';
import {
  browseWords, getWordRecordings, trackEvent, type ExistingRecording,
} from '../../lib/api';
import { useLang } from '../../lib/langContext';
import { AccentWash, useAccent } from '../../lib/accent';
import { langMeta } from '../../lib/langMeta';
import {
  buildPracticeSession, completedProgress, dailyPage, localDateKey,
  readPracticeProgress, savePracticeProgress,
  type PracticeProgress, type PracticeQuestion,
} from '../../lib/learning';
import { C, F, S, radius, shadowStrong, LANG_ART } from '../../lib/theme';

export default function LearnScreen() {
  const { code, setCode, languages, lang } = useLang();
  const accent = useAccent();
  const router = useRouter();
  const today = localDateKey();
  const [picker, setPicker] = useState(false);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [progress, setProgress] = useState<PracticeProgress>({ streak: 0, totalWords: 0 });
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [recording, setRecording] = useState<ExistingRecording | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setQuestions([]);
    setIndex(0);
    setSelected(null);
    setCorrectCount(0);
    setDone(false);
    setReplaying(false);

    Promise.all([readPracticeProgress(code), browseWords(code, { page: 1 })])
      .then(async ([saved, first]) => {
        if (!active) return;
        setProgress(saved);
        if (!first.ok) {
          setError("We couldn't reach the dictionary just now. Check your connection and try again.");
          return;
        }
        const target = dailyPage(code, today, first.totalPages);
        const daily = target === 1 ? first : await browseWords(code, { page: target });
        if (!active) return;
        if (!daily.ok) {
          setError("We couldn't reach today's dictionary entries. Check your connection and try again.");
          return;
        }
        let session = buildPracticeSession(daily.words, code, today);
        if (session.length < 5 && target !== 1) {
          session = buildPracticeSession([...daily.words, ...first.words], code, today);
        }
        if (session.length < 5) {
          setError('This collection does not have enough distinct meanings for a practice set yet.');
        } else {
          setQuestions(session);
        }
      })
      .catch(() => {
        if (active) setError("We couldn't reach the dictionary just now.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [code, today, retry]);

  const current = questions[index];
  useEffect(() => {
    let active = true;
    setRecording(undefined);
    if (!current?.entry.id) return () => { active = false; };
    getWordRecordings(current.entry.id).then((items) => {
      if (active) setRecording(items[0] ?? null);
    });
    return () => { active = false; };
  }, [current?.entry.id]);

  const langName = lang?.name ?? 'this language';
  const meta = langMeta(code);
  const art = LANG_ART[code]?.art;
  const completedToday = progress.lastCompletedDate === today;
  const showComplete = done || (completedToday && !replaying);

  function openEntry(question: PracticeQuestion) {
    router.push({
      pathname: '/word/[id]',
      params: { id: question.entry.id, code, word: question.entry.word },
    });
  }

  function answer(choice: string) {
    if (!current || selected) return;
    const correct = choice === current.entry.meaning;
    setSelected(choice);
    if (correct) setCorrectCount((count) => count + 1);
    Haptics.notificationAsync(
      correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
    trackEvent('practice_answered', {
      language: code,
      wordId: current.entry.id,
      correct,
      question: index + 1,
    });
  }

  function finish() {
    const next = completedProgress(progress, today, questions.length);
    setProgress(next);
    setDone(true);
    setReplaying(false);
    savePracticeProgress(code, next);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    trackEvent('practice_completed', {
      language: code,
      words: questions.length,
      correct: correctCount,
      streak: next.streak,
      replay: completedToday,
    });
  }

  function nextQuestion() {
    if (!selected) return;
    if (index >= questions.length - 1) {
      finish();
      return;
    }
    setIndex((value) => value + 1);
    setSelected(null);
  }

  function replay() {
    setIndex(0);
    setSelected(null);
    setCorrectCount(0);
    setDone(false);
    setReplaying(true);
    trackEvent('practice_replayed', { language: code });
  }

  function chooseLanguage(nextCode: string) {
    setCode(nextCode);
    setPicker(false);
  }

  return (
    <Screen>
      <AccentWash height={340} />
      <TopBar onSearch={() => router.push('/dictionary')} onProfile={() => router.push('/account')} compact />

      <View style={styles.hero}>
        {art ? <Image source={art} style={styles.heroArt} resizeMode="cover" /> : null}
        <LinearGradient
          colors={['rgba(25,42,30,0.28)', 'rgba(24,42,29,0.88)', C.forestDeep]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroTop}>
          <View style={styles.heroPill}>
            <Ionicons name="leaf-outline" size={13} color={C.cream} />
            <Text style={styles.heroPillText}>DAILY PRACTICE</Text>
          </View>
          <Pressable
            onPress={() => setPicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Current language ${langName}. Change language`}
            style={({ pressed }) => [styles.languagePill, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.languagePillText} numberOfLines={1}>{langName}</Text>
            <Ionicons name="chevron-down" size={14} color={C.cream} />
          </Pressable>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Carry five words forward</Text>
          <Text style={styles.heroBody}>A small daily practice built only from this working dictionary.</Text>
        </View>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Ionicons name="flame-outline" size={16} color={C.clayBright} />
            <Text style={styles.heroStatStrong}>{progress.streak || 'Fresh'}</Text>
            <Text style={styles.heroStatLabel}>{progress.streak ? (progress.streak === 1 ? 'day' : 'days') : 'start'}</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Ionicons name="book-outline" size={16} color={C.cream} />
            <Text style={styles.heroStatStrong}>{questions.length || 5}</Text>
            <Text style={styles.heroStatLabel}>real entries</Text>
          </View>
          <Text style={styles.artLabel}>ILLUSTRATIVE ARTWORK</Text>
        </View>
      </View>

      {loading ? (
        <Card style={styles.loadingCard}>
          <View style={styles.loadingTop}>
            <Skeleton width={90} height={12} />
            <Skeleton width={72} height={12} />
          </View>
          <Skeleton width="58%" height={32} radius={9} />
          <SkeletonLines count={4} height={52} />
        </Card>
      ) : error ? (
        <Card style={styles.emptyCard}>
          <View style={[styles.emptyIcon, { backgroundColor: accent.accentSoft }]}>
            <Ionicons name="book-outline" size={26} color={accent.accent} />
          </View>
          <Text style={styles.emptyTitle}>Practice is waiting on the dictionary</Text>
          <Text style={styles.emptyBody}>{error}</Text>
          <Button label="Try again" icon="refresh" onPress={() => setRetry((value) => value + 1)} />
          <Button label={`Browse ${langName}`} variant="ghost" onPress={() => router.push('/dictionary')} />
        </Card>
      ) : showComplete ? (
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.completeWrap}>
          <View style={styles.completeCard}>
            <LinearGradient colors={[accent.accentDeep, C.forestDeep]} style={StyleSheet.absoluteFill} />
            <View style={styles.completeIcon}><Ionicons name="checkmark" size={28} color={C.forestDeep} /></View>
            <Text style={styles.completeEyebrow}>TODAY'S PRACTICE</Text>
            <Text style={styles.completeTitle}>Five words carried forward</Text>
            <Text style={styles.completeBody}>
              {done
                ? `${correctCount} of ${questions.length} meanings matched on the first try.`
                : `You have already visited today's ${questions.length} words.`}
            </Text>
            <View style={styles.completeStats}>
              <View style={styles.completeStat}>
                <Text style={styles.completeNumber}>{progress.streak}</Text>
                <Text style={styles.completeLabel}>DAY STREAK</Text>
              </View>
              <View style={styles.completeStatLine} />
              <View style={styles.completeStat}>
                <Text style={styles.completeNumber}>{progress.totalWords}</Text>
                <Text style={styles.completeLabel}>WORDS VISITED</Text>
              </View>
            </View>
            <Button label="Practise these five again" icon="refresh" variant="cream" full onPress={replay} />
          </View>

          <Card style={styles.todayCard}>
            <View style={styles.todayHeading}>
              <View>
                <Text style={[styles.eyebrow, { color: accent.accent }]}>TODAY'S FIVE</Text>
                <Text style={styles.todayTitle}>Keep the source close</Text>
              </View>
              <Ionicons name="shield-checkmark-outline" size={22} color={accent.accent} />
            </View>
            {questions.map((question, wordIndex) => (
              <View key={question.entry.id} style={[styles.todayRow, wordIndex > 0 && styles.todayRowBorder]}>
                <SpeakerButton code={code} text={question.entry.word} wordId={question.entry.id} size="sm" />
                <Pressable
                  onPress={() => openEntry(question)}
                  accessibilityRole="button"
                  accessibilityLabel={`${question.entry.word}, ${question.entry.meaning}. Open dictionary entry and sources`}
                  style={({ pressed }) => [styles.todayLink, pressed && { opacity: 0.65 }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.todayWord} accessibilityLanguage={meta.languageTag}>{question.entry.word}</Text>
                    <Text style={styles.todayMeaning} numberOfLines={2}>{question.entry.meaning}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={accent.accent} />
                </Pressable>
              </View>
            ))}
          </Card>
        </Animated.View>
      ) : current ? (
        <Animated.View key={current.entry.id} entering={FadeIn.duration(260)}>
          <Card style={{ ...styles.quizCard, borderColor: accent.accentLine }}>
            <View style={styles.progressHeader}>
              <Text style={[styles.eyebrow, { color: accent.accent }]}>WORD {index + 1} OF {questions.length}</Text>
              <Text style={styles.progressCount}>{Math.round(((index + (selected ? 1 : 0)) / questions.length) * 100)}%</Text>
            </View>
            <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: questions.length, now: index + (selected ? 1 : 0) }}>
              <View style={[styles.progressFill, { backgroundColor: accent.accent, width: `${((index + (selected ? 1 : 0)) / questions.length) * 100}%` }]} />
            </View>

            <View style={styles.wordPrompt}>
              <SpeakerButton code={code} text={current.entry.word} wordId={current.entry.id} recording={recording} size="lg" />
              <Text style={styles.promptLabel}>LISTEN &amp; REMEMBER</Text>
              <Text style={styles.promptWord} accessibilityLanguage={meta.languageTag}>{current.entry.word}</Text>
              {current.entry.pos ? <Text style={[styles.promptPos, { color: accent.accent }]}>{current.entry.pos}</Text> : null}
              <Text style={styles.promptQuestion}>Which meaning is in the dictionary?</Text>
            </View>

            <View style={styles.choices}>
              {current.choices.map((choice, choiceIndex) => {
                const isCorrect = choice === current.entry.meaning;
                const isChosen = choice === selected;
                const revealCorrect = !!selected && isCorrect;
                const revealWrong = !!selected && isChosen && !isCorrect;
                return (
                  <Pressable
                    key={choice}
                    onPress={() => answer(choice)}
                    disabled={!!selected}
                    accessibilityRole="button"
                    accessibilityLabel={`${choiceIndex + 1}. ${choice}`}
                    accessibilityState={{ selected: isChosen, disabled: !!selected }}
                    style={({ pressed }) => [
                      styles.choice,
                      revealCorrect && styles.choiceCorrect,
                      revealWrong && styles.choiceWrong,
                      pressed && !selected && { transform: [{ scale: 0.99 }], borderColor: accent.accent },
                    ]}
                  >
                    <View style={[
                      styles.choiceLetter,
                      revealCorrect && styles.choiceLetterCorrect,
                      revealWrong && styles.choiceLetterWrong,
                    ]}>
                      {revealCorrect || revealWrong ? (
                        <Ionicons name={revealCorrect ? 'checkmark' : 'close'} size={16} color={C.white} />
                      ) : (
                        <Text style={styles.choiceLetterText}>{String.fromCharCode(65 + choiceIndex)}</Text>
                      )}
                    </View>
                    <Text style={[styles.choiceText, (revealCorrect || revealWrong) && styles.choiceTextStrong]}>{choice}</Text>
                  </Pressable>
                );
              })}
            </View>

            {selected ? (
              <Animated.View entering={FadeInDown.springify().damping(19)} style={styles.feedback}>
                <View style={styles.feedbackHeading}>
                  <Ionicons
                    name={selected === current.entry.meaning ? 'checkmark-circle' : 'book-outline'}
                    size={19}
                    color={selected === current.entry.meaning ? C.success : C.clay}
                  />
                  <Text style={styles.feedbackTitle}>
                    {selected === current.entry.meaning ? 'That matches the entry' : 'The entry records this meaning'}
                  </Text>
                </View>
                <Text style={styles.feedbackMeaning}>{current.entry.meaning}</Text>
                <AudioSourceBadge recording={recording} loading={recording === undefined} compact />
                <Pressable
                  onPress={() => openEntry(current)}
                  accessibilityRole="button"
                  accessibilityLabel="Open dictionary entry, review status, and sources"
                  style={({ pressed }) => [styles.sourceLink, pressed && { opacity: 0.65 }]}
                >
                  <Ionicons name="shield-checkmark-outline" size={16} color={accent.accent} />
                  <Text style={[styles.sourceLinkText, { color: accent.accent }]}>Open entry &amp; source trail</Text>
                  <Ionicons name="arrow-forward" size={14} color={accent.accent} />
                </Pressable>
                <Button
                  label={index === questions.length - 1 ? 'Finish today' : 'Next word'}
                  icon={index === questions.length - 1 ? 'checkmark' : 'arrow-forward'}
                  full
                  onPress={nextQuestion}
                />
              </Animated.View>
            ) : null}
          </Card>
        </Animated.View>
      ) : null}

      {!loading && !error && !showComplete ? (
        <View style={styles.trustNote}>
          <View style={[styles.trustIcon, { backgroundColor: accent.accentSoft }]}>
            <Ionicons name="library-outline" size={18} color={accent.accent} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.trustTitle}>A working collection, not a final authority</Text>
            <Text style={styles.trustBody}>Every answer comes from a real dictionary entry. Open it to see its source, notes, and review status.</Text>
          </View>
        </View>
      ) : null}

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
  hero: { minHeight: 232, borderRadius: radius.xl, overflow: 'hidden', padding: 18, justifyContent: 'space-between', backgroundColor: C.forestDeep, ...shadowStrong },
  heroArt: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  heroPill: { height: 30, paddingHorizontal: 10, borderRadius: radius.pill, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(22,38,27,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  heroPillText: { fontFamily: F.bold, fontSize: 10, letterSpacing: 1.15, color: C.cream },
  languagePill: { maxWidth: 160, height: 32, paddingHorizontal: 11, borderRadius: radius.pill, flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  languagePillText: { flexShrink: 1, fontFamily: F.semibold, fontSize: S.small, color: C.cream },
  heroCopy: { gap: 5, maxWidth: '92%' },
  heroTitle: { fontFamily: F.displayBold, fontSize: 34, lineHeight: 38, color: C.white },
  heroBody: { fontFamily: F.body, fontSize: S.label, lineHeight: 21, color: 'rgba(247,243,234,0.86)' },
  heroStats: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 9 },
  heroStat: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  heroStatStrong: { fontFamily: F.displayBold, fontSize: S.heading, color: C.white },
  heroStatLabel: { fontFamily: F.medium, fontSize: 11, color: 'rgba(247,243,234,0.78)' },
  heroDivider: { width: 1, height: 25, backgroundColor: 'rgba(255,255,255,0.2)' },
  artLabel: { marginLeft: 'auto', alignSelf: 'flex-end', fontFamily: F.bold, fontSize: 8, letterSpacing: 0.9, color: 'rgba(247,243,234,0.55)' },

  loadingCard: { gap: 18, minHeight: 390 },
  loadingTop: { flexDirection: 'row', justifyContent: 'space-between' },
  emptyCard: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  emptyIcon: { width: 54, height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: F.displayBold, fontSize: S.title, color: C.ink, textAlign: 'center' },
  emptyBody: { fontFamily: F.body, fontSize: S.label, lineHeight: 22, color: C.muted, textAlign: 'center' },

  quizCard: { gap: 15, padding: 18, borderWidth: 1.5 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.4 },
  progressCount: { fontFamily: F.semibold, fontSize: 11, color: C.muted },
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: C.sageSoft, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  wordPrompt: { alignItems: 'center', gap: 5, paddingVertical: 8 },
  promptLabel: { marginTop: 3, fontFamily: F.bold, fontSize: 9, letterSpacing: 1.35, color: C.faint },
  promptWord: { fontFamily: F.displayBold, fontSize: 38, lineHeight: 45, color: C.ink, textAlign: 'center' },
  promptPos: { fontFamily: F.serifItalic, fontSize: S.small, textTransform: 'capitalize' },
  promptQuestion: { marginTop: 7, fontFamily: F.semibold, fontSize: S.label, color: C.inkSoft, textAlign: 'center' },
  choices: { gap: 10 },
  choice: { minHeight: 60, borderRadius: radius.md, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surfaceAlt, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  choiceCorrect: { borderColor: C.success, backgroundColor: '#E9F3EA' },
  choiceWrong: { borderColor: C.danger, backgroundColor: '#F7E9E6' },
  choiceLetter: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: C.bgDeep, alignItems: 'center', justifyContent: 'center' },
  choiceLetterCorrect: { backgroundColor: C.success },
  choiceLetterWrong: { backgroundColor: C.danger },
  choiceLetterText: { fontFamily: F.bold, fontSize: S.small, color: C.muted },
  choiceText: { flex: 1, fontFamily: F.body, fontSize: S.label, lineHeight: 21, color: C.inkSoft },
  choiceTextStrong: { fontFamily: F.semibold, color: C.ink },
  feedback: { gap: 11, borderTopWidth: 1, borderTopColor: C.hair, paddingTop: 15 },
  feedbackHeading: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  feedbackTitle: { flex: 1, fontFamily: F.bold, fontSize: S.small, color: C.ink },
  feedbackMeaning: { fontFamily: F.serif, fontSize: S.body, lineHeight: 24, color: C.ink },
  sourceLink: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sourceLinkText: { fontFamily: F.bold, fontSize: S.small },

  trustNote: { flexDirection: 'row', gap: 11, borderRadius: radius.lg, padding: 15, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  trustIcon: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  trustTitle: { fontFamily: F.bold, fontSize: S.small, color: C.ink },
  trustBody: { fontFamily: F.body, fontSize: 12, lineHeight: 18, color: C.muted },

  completeWrap: { gap: 18 },
  completeCard: { minHeight: 365, borderRadius: radius.xl, overflow: 'hidden', padding: 24, gap: 11, alignItems: 'center', justifyContent: 'center', ...shadowStrong },
  completeIcon: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  completeEyebrow: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.clayBright },
  completeTitle: { fontFamily: F.displayBold, fontSize: S.display, lineHeight: 36, color: C.white, textAlign: 'center' },
  completeBody: { fontFamily: F.body, fontSize: S.label, lineHeight: 22, color: 'rgba(247,243,234,0.82)', textAlign: 'center' },
  completeStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 7 },
  completeStat: { minWidth: 105, alignItems: 'center', gap: 2 },
  completeStatLine: { width: 1, height: 38, backgroundColor: 'rgba(255,255,255,0.2)' },
  completeNumber: { fontFamily: F.displayBold, fontSize: S.title, color: C.white },
  completeLabel: { fontFamily: F.bold, fontSize: 9, letterSpacing: 1.05, color: 'rgba(247,243,234,0.66)' },
  todayCard: { gap: 8 },
  todayHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  todayTitle: { marginTop: 3, fontFamily: F.display, fontSize: S.heading, color: C.ink },
  todayRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayRowBorder: { borderTopWidth: 1, borderTopColor: C.hair },
  todayLink: { flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayWord: { fontFamily: F.displayBold, fontSize: S.heading, color: C.ink },
  todayMeaning: { fontFamily: F.body, fontSize: S.small, lineHeight: 18, color: C.muted },
});
