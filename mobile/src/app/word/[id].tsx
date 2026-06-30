import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Button, Card, Chip, SpeakerButton } from '../../components/kit';
import { CorrectionModal } from '../../components/CorrectionModal';
import { RecorderModal } from '../../components/RecorderModal';
import {
  getWord, getWordImage, getWordRecordings, getExampleRecordings, createExample,
  uploadWordRecording, uploadExampleRecording,
  type WordDetail, type WordExample, type ExistingRecording,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { C, F, S, radius } from '../../lib/theme';

type RecTarget =
  | { kind: 'word'; label: string; sub?: string | null }
  | { kind: 'example'; id: string; label: string; sub?: string | null };

export default function WordScreen() {
  const { id, code, word } = useLocalSearchParams<{ id: string; code?: string; word?: string }>();
  const { user } = useAuth();
  const [detail, setDetail] = useState<WordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [img, setImg] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(true);
  const [correct, setCorrect] = useState(false);
  const [fullImage, setFullImage] = useState(false);

  const [examples, setExamples] = useState<WordExample[]>([]);
  const [wordRecs, setWordRecs] = useState<ExistingRecording[] | null>(null);
  const [exRecs, setExRecs] = useState<Record<string, ExistingRecording[]>>({});
  const [recTarget, setRecTarget] = useState<RecTarget | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const player = useRef<AudioPlayer | null>(null);

  const langCode = detail?.languageCode || (code as string) || '';
  const headword = detail?.word || (word as string) || 'Word';

  useEffect(() => {
    let alive = true;
    getWord(String(id)).then((d) => { if (alive && d) { setDetail(d); setExamples(d.examples); setLoading(false); } else if (alive) setLoading(false); });
    return () => { alive = false; player.current?.remove(); };
  }, [id]);

  // artwork (AI-generated, cached)
  useEffect(() => {
    if (!langCode || !headword) return;
    let alive = true; let tries = 0;
    const pos = (detail?.wordClass || detail?.wordType || '').replace(/[-_]/g, ' ');
    const meaning = [
      pos ? `part of speech: ${pos}` : '',
      detail?.definitions?.length ? `meaning: ${detail.definitions.join('; ')}` : '',
      detail?.translations?.length ? `English: ${detail.translations.join(', ')}` : '',
    ].filter(Boolean).join('; ') || undefined;
    setImgLoading(true);
    const attempt = async () => {
      const u = await getWordImage(langCode, headword, meaning, String(id));
      if (!alive) return;
      if (u) { setImg(u); setImgLoading(false); return; }
      tries += 1;
      if (tries < 9) setTimeout(attempt, 12000); else setImgLoading(false);
    };
    attempt();
    return () => { alive = false; };
  }, [langCode, headword, detail?.definitions?.[0]]);

  // load recordings for the word + each example
  function loadWordRecs() { getWordRecordings(String(id)).then(setWordRecs); }
  function loadExRecs(exId: string) { getExampleRecordings(exId).then((r) => setExRecs((p) => ({ ...p, [exId]: r }))); }
  useEffect(() => { if (!detail) return; loadWordRecs(); detail.examples.forEach((e) => e.id && loadExRecs(e.id)); }, [detail]);

  function playUrl(u: string) { try { player.current?.remove(); const p = createAudioPlayer({ uri: u }); player.current = p; p.play(); } catch {} }

  async function addExample(text: string, english: string) {
    const ex = await createExample(String(id), text, english);
    if (ex) {
      setExamples((p) => [...p, ex]);
      if (ex.id) { setExRecs((p) => ({ ...p, [ex.id!]: [] })); }
      setAddOpen(false);
      if (ex.id) setRecTarget({ kind: 'example', id: ex.id, label: ex.text, sub: ex.translation });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {/* Artwork hero */}
        <Pressable style={styles.hero} onPress={() => img && setFullImage(true)} disabled={!img}>
          {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill as any} resizeMode="cover" /> : null}
          <LinearGradient colors={img ? ['rgba(34,56,42,0.05)', 'rgba(34,56,42,0.72)'] : [C.sageSoft, C.sageSoft]} style={StyleSheet.absoluteFill} />
          {imgLoading && !img && <ActivityIndicator color={C.forest} style={{ position: 'absolute', top: 24, right: 24 }} />}
          {!!img && <View style={styles.expandHint}><Ionicons name="expand" size={16} color={C.white} /></View>}
          <View style={styles.heroBody}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headword, { color: img ? C.white : C.forestDeep }]} selectable>{headword}</Text>
              {!!detail?.pronunciation && <Text style={[styles.pron, { color: img ? 'rgba(255,255,255,0.85)' : C.muted }]}>{detail.pronunciation}</Text>}
            </View>
            {!!langCode && <SpeakerButton code={langCode} text={headword} size="lg" />}
          </View>
        </Pressable>

        <View style={{ padding: 20, gap: 16 }}>
          {loading && <ActivityIndicator color={C.forest} size="large" style={{ marginTop: 12 }} />}

          {!loading && detail && (
            <>
              {!!detail.wordClass && <Chip label={detail.wordClass} tone="sage" />}

              {detail.definitions.length > 0 && (
                <Card>
                  <Text style={styles.section}>MEANING</Text>
                  {detail.definitions.map((d, i) => (
                    <View key={i} style={styles.defRow}><Text style={styles.bullet}>•</Text><Text style={styles.def}>{d}</Text></View>
                  ))}
                  {detail.translations.length > 0 && <Text style={styles.trans}>{detail.translations.join(' · ')}</Text>}
                </Card>
              )}

              {/* Pronunciations of the word */}
              <Card>
                <Text style={styles.section}>PRONUNCIATIONS{wordRecs && wordRecs.length ? ` · ${wordRecs.length}` : ''}</Text>
                {wordRecs === null && <ActivityIndicator color={C.forest} style={{ marginVertical: 8 }} />}
                {wordRecs && wordRecs.length === 0 && <Text style={styles.noneYet}>No community recordings yet. Be the first to say it.</Text>}
                {wordRecs?.map((r) => (
                  <Pressable key={r.id} onPress={() => playUrl(r.url)} style={styles.playRow}>
                    <Ionicons name="play-circle" size={26} color={C.forest} />
                    <Text style={styles.playName}>{r.isMine ? 'You' : (r.speaker || 'Community')}</Text>
                    {!!r.durationMs && <Text style={styles.playDur}>{Math.round(r.durationMs / 1000)}s</Text>}
                  </Pressable>
                ))}
                <Button label="Record this word" icon="mic" variant="soft" full style={{ marginTop: 12 }}
                  onPress={() => setRecTarget({ kind: 'word', label: headword, sub: detail.definitions[0] })} />
              </Card>

              {/* Examples */}
              <View style={{ gap: 10 }}>
                <View style={styles.exHead}>
                  <Text style={styles.section}>EXAMPLES{examples.length ? ` · ${examples.length}` : ''}</Text>
                  <Pressable onPress={() => setAddOpen(true)} hitSlop={8} style={styles.addBtn}>
                    <Ionicons name="add" size={16} color={C.forest} /><Text style={styles.addText}>Add</Text>
                  </Pressable>
                </View>
                {examples.length === 0 && <Card><Text style={styles.noneYet}>No examples yet. Add one to show how the word is used.</Text></Card>}
                {examples.map((ex, i) => {
                  const recs = ex.id ? exRecs[ex.id] : undefined;
                  return (
                    <Card key={ex.id ?? i}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.exText}>{ex.text}</Text>
                          {!!ex.translation && <Text style={styles.exTrans}>{ex.translation}</Text>}
                        </View>
                        <SpeakerButton code={langCode} text={ex.text} size="sm" />
                      </View>
                      {recs?.map((r) => (
                        <Pressable key={r.id} onPress={() => playUrl(r.url)} style={[styles.playRow, { marginTop: 8 }]}>
                          <Ionicons name="play-circle" size={24} color={C.forest} />
                          <Text style={styles.playName}>{r.isMine ? 'You' : (r.speaker || 'Community')}</Text>
                          {!!r.durationMs && <Text style={styles.playDur}>{Math.round(r.durationMs / 1000)}s</Text>}
                        </Pressable>
                      ))}
                      {ex.id && (
                        <Button label={recs && recs.length ? 'Add a recording' : 'Record this example'} icon="mic" variant="ghost" full style={{ marginTop: 10 }}
                          onPress={() => setRecTarget({ kind: 'example', id: ex.id!, label: ex.text, sub: ex.translation })} />
                      )}
                    </Card>
                  );
                })}
              </View>

              <Button label="Suggest a correction" icon="create-outline" variant="ghost" full onPress={() => setCorrect(true)} />
              <Text style={styles.help}>See something wrong? Help the keepers keep this dictionary accurate.</Text>
            </>
          )}
          {!loading && !detail && <Text style={styles.muted}>Could not load this word.</Text>}
        </View>
      </ScrollView>

      <CorrectionModal visible={correct} target={detail ? { kind: 'word', wordId: detail.id, word: detail.word } : null} onClose={() => setCorrect(false)} />

      {/* Record (word or example) */}
      {recTarget && (
        <RecorderModal
          kind={recTarget.kind === 'word' ? 'WORD' : 'SENTENCE'}
          label={recTarget.label}
          sub={recTarget.sub}
          recordings={recTarget.kind === 'word' ? wordRecs : (exRecs[recTarget.id] ?? null)}
          onUpload={(uri, ms) => recTarget.kind === 'word' ? uploadWordRecording(String(id), uri, ms) : uploadExampleRecording(recTarget.id, uri, ms)}
          onSaved={() => { if (recTarget.kind === 'word') loadWordRecs(); else loadExRecs(recTarget.id); }}
          onClose={() => setRecTarget(null)}
        />
      )}

      {addOpen && <AddExampleModal onClose={() => setAddOpen(false)} onAdd={addExample} signedIn={!!user} />}

      {/* Full-screen image */}
      <Modal visible={fullImage} transparent animationType="fade" onRequestClose={() => setFullImage(false)}>
        <Pressable style={styles.fullBackdrop} onPress={() => setFullImage(false)}>
          {!!img && <Image source={{ uri: img }} style={styles.fullImg} resizeMode="contain" />}
          <View style={styles.fullCaption}>
            <Text style={styles.fullWord}>{headword}</Text>
            {!!detail?.definitions?.[0] && <Text style={styles.fullMeaning}>{detail.definitions.join(' · ')}</Text>}
          </View>
          <View style={styles.fullClose}><Ionicons name="close" size={26} color={C.white} /></View>
        </Pressable>
      </Modal>
    </View>
  );
}

function AddExampleModal({ onClose, onAdd, signedIn }: { onClose: () => void; onAdd: (text: string, english: string) => Promise<void>; signedIn: boolean }) {
  const [text, setText] = useState('');
  const [english, setEnglish] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = text.trim().length > 0 && english.trim().length > 0;
  async function submit() {
    if (!valid) return;
    setBusy(true); setError(null);
    try { await onAdd(text.trim(), english.trim()); }
    catch (e: any) { setError(e?.message || 'Could not add.'); setBusy(false); }
  }
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.fullBackdrop2} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          <Text style={styles.section}>ADD AN EXAMPLE</Text>
          {!signedIn && <Text style={styles.noneYet}>You can write it, but sign in to save + record it.</Text>}
          <Text style={styles.fieldLabel}>Example sentence in language</Text>
          <TextInput value={text} onChangeText={setText} placeholder="Write the example…" placeholderTextColor={C.muted} multiline style={styles.input} />
          <Text style={styles.fieldLabel}>What it means in English</Text>
          <TextInput value={english} onChangeText={setEnglish} placeholder="The English meaning…" placeholderTextColor={C.muted} style={[styles.input, { minHeight: 48 }]} />
          <Button label="Add example" icon="add" onPress={submit} loading={busy} disabled={!valid} full style={{ marginTop: 14 }} />
          {error && <Text style={styles.err}>{error}</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hero: { height: 240, justifyContent: 'flex-end', backgroundColor: C.sageSoft },
  expandHint: { position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  heroBody: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, padding: 20 },
  headword: { fontFamily: F.displayBold, fontSize: S.hero, lineHeight: S.hero * 1.04 },
  pron: { fontFamily: F.serifItalic, fontSize: S.body, marginTop: 4 },
  section: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.sage, marginBottom: 10 },
  defRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  bullet: { fontFamily: F.body, fontSize: S.body, color: C.sage, lineHeight: 28 },
  def: { flex: 1, fontFamily: F.body, fontSize: S.body, color: C.ink, lineHeight: 28 },
  trans: { fontFamily: F.serifItalic, fontSize: S.label, color: C.muted, marginTop: 8 },
  noneYet: { fontFamily: F.body, fontSize: S.label, color: C.muted, lineHeight: 22 },
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surfaceAlt, borderRadius: radius.md, padding: 10, marginTop: 6 },
  playName: { flex: 1, fontFamily: F.semibold, fontSize: S.label, color: C.ink },
  playDur: { fontFamily: F.body, fontSize: S.small, color: C.muted },
  exHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.sageSoft, paddingHorizontal: 12, height: 32, borderRadius: radius.pill, marginBottom: 10 },
  addText: { fontFamily: F.semibold, fontSize: S.small, color: C.forest },
  exText: { fontFamily: F.body, fontSize: S.body, color: C.ink, lineHeight: 26 },
  exTrans: { fontFamily: F.body, fontSize: S.label, color: C.muted, marginTop: 3 },
  help: { fontFamily: F.body, fontSize: S.small, color: C.faint, textAlign: 'center', lineHeight: 18 },
  muted: { fontFamily: F.body, fontSize: S.label, color: C.muted, textAlign: 'center', marginTop: 20 },

  sheet: { backgroundColor: C.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: 30 },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.sageLine, marginBottom: 14 },
  fieldLabel: { fontFamily: F.semibold, fontSize: S.label, color: C.ink, marginTop: 14, marginBottom: 8 },
  input: { backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, padding: 15, fontFamily: F.body, fontSize: S.body, color: C.ink, minHeight: 80, textAlignVertical: 'top' },
  err: { fontFamily: F.medium, fontSize: S.label, color: C.danger, textAlign: 'center', marginTop: 10 },
  fullBackdrop2: { flex: 1, backgroundColor: 'rgba(20,28,22,0.45)', justifyContent: 'flex-end' },

  fullBackdrop: { flex: 1, backgroundColor: 'rgba(15,20,16,0.96)', alignItems: 'center', justifyContent: 'center' },
  fullImg: { width: '100%', height: '78%' },
  fullCaption: { position: 'absolute', bottom: 50, left: 24, right: 24, alignItems: 'center' },
  fullWord: { fontFamily: F.displayBold, fontSize: S.hero, color: C.white },
  fullMeaning: { fontFamily: F.serifItalic, fontSize: S.body, color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: 'center' },
  fullClose: { position: 'absolute', top: 50, right: 22, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});
