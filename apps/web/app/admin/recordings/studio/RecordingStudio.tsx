'use client';

import { useCallback, useEffect, useState } from 'react';
import { ListChecks, MessageSquareText, History, BarChart3 } from 'lucide-react';
import { cn } from '@mobtranslate/ui';
import { uploadQueue } from '@/lib/recording/uploadQueue';
import type { CapturedRecording } from '@/lib/recording/types';
import { Recorder, type RecorderTarget } from './Recorder';
import { Worklist } from './Worklist';
import { SentenceList } from './SentenceList';
import { ReviewPanel } from './ReviewPanel';
import { CorpusDashboard } from './CorpusDashboard';
import { SpeakerPicker } from './SpeakerPicker';
import { UploadStatus } from './UploadStatus';
import { EditWordModal } from './EditWordModal';
import { fetchSpeakers, fetchWorklist, fetchTargets, fetchSentences, type LanguageOption, type SpeakerProfile } from './api';

interface RecordingStudioProps {
  languages: LanguageOption[];
  initialLanguageId: string;
}

type Tab = 'words' | 'sentences' | 'review' | 'corpus';

const SPEAKER_KEY = 'studio.speaker';

export function RecordingStudio({ languages, initialLanguageId }: RecordingStudioProps) {
  const [languageId, setLanguageId] = useState(initialLanguageId);
  const language = languages.find((l) => l.id === languageId) ?? languages[0];

  const [speakers, setSpeakers] = useState<SpeakerProfile[]>([]);
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const [target, setTarget] = useState<RecorderTarget | null>(null);
  const [tab, setTab] = useState<Tab>('words');

  const [worklistKey, setWorklistKey] = useState(0);
  const [targetsKey, setTargetsKey] = useState(0);
  const [reviewKey, setReviewKey] = useState(0);
  const [editWordId, setEditWordId] = useState<string | null>(null);

  // Init the upload queue once.
  useEffect(() => {
    uploadQueue.init();
  }, []);

  // Load speakers for the language; restore last-used speaker.
  useEffect(() => {
    let cancelled = false;
    fetchSpeakers(languageId)
      .then((list) => {
        if (cancelled) return;
        setSpeakers(list);
        const saved = typeof window !== 'undefined' ? localStorage.getItem(SPEAKER_KEY) : null;
        if (saved && list.some((s) => s.id === saved)) setSpeakerId(saved);
        else if (list.length === 1) setSpeakerId(list[0].id);
      })
      .catch(() => setSpeakers([]));
    return () => {
      cancelled = true;
    };
  }, [languageId]);

  // Reset state when switching language.
  useEffect(() => {
    setTarget(null);
  }, [languageId]);

  const selectSpeaker = useCallback((id: string | null) => {
    setSpeakerId(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem(SPEAKER_KEY, id);
      else localStorage.removeItem(SPEAKER_KEY);
    }
  }, []);

  const refreshAll = useCallback(() => {
    setWorklistKey((k) => k + 1);
    setTargetsKey((k) => k + 1);
    setReviewKey((k) => k + 1);
  }, []);

  // Advance to the next pending item to keep momentum.
  const advance = useCallback(
    async (prev: RecorderTarget) => {
      try {
        if (prev.exampleId) {
          const res = await fetchSentences({ languageId, filter: 'pending', limit: 3, offset: 0 });
          const next = res.items.find((i) => i.example_id !== prev.exampleId);
          setTarget(next ? { kind: 'sentence', label: next.text, gloss: next.gloss, exampleId: next.example_id } : null);
          return;
        }
        if (prev.targetId) {
          const list = await fetchTargets(languageId, 'pending');
          const next = list.find((t) => t.id !== prev.targetId);
          setTarget(next ? { kind: next.kind, label: next.text, gloss: next.gloss, targetId: next.id } : null);
          return;
        }
        const res = await fetchWorklist({ languageId, filter: 'pending', limit: 3, offset: 0 });
        const next = res.items.find((i) => i.word_id !== prev.wordId);
        setTarget(next ? { kind: 'word', label: next.word, gloss: next.gloss, wordId: next.word_id } : null);
      } catch {
        setTarget(null);
      }
    },
    [languageId],
  );

  const handleSave = useCallback(
    async (captured: CapturedRecording) => {
      if (!target || !language) return;
      await uploadQueue.enqueue({
        captured,
        languageId,
        languageCode: language.code,
        label: target.label,
        kind: target.kind,
        wordId: target.wordId ?? null,
        targetId: target.targetId ?? null,
        exampleId: target.exampleId ?? null,
        gloss: target.gloss,
        speakerId,
        isCorrection: target.isCorrection ?? false,
        supersedesId: target.supersedesId ?? null,
      });
      refreshAll();
      await advance(target);
    },
    [target, language, languageId, speakerId, refreshAll, advance],
  );

  const tabs: { id: Tab; label: string; icon: typeof ListChecks }[] = [
    { id: 'words', label: 'Words', icon: ListChecks },
    { id: 'sentences', label: 'Sentences', icon: MessageSquareText },
    { id: 'review', label: 'Recordings', icon: History },
    { id: 'corpus', label: 'Corpus', icon: BarChart3 },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recording studio</h1>
          <p className="text-base text-muted-foreground">Capture native-speaker pronunciations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={languageId}
            onChange={(e) => setLanguageId(e.target.value)}
            className="h-11 rounded-xl border border-border bg-card px-3 text-base font-medium text-foreground"
            aria-label="Language"
          >
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <SpeakerPicker
            languageId={languageId}
            speakers={speakers}
            selectedId={speakerId}
            onSelect={selectSpeaker}
            onSpeakersChange={setSpeakers}
          />
          <UploadStatus />
        </div>
      </div>

      {/* Main two-pane layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Recorder
            target={target}
            speakerName={speakers.find((s) => s.id === speakerId)?.name ?? null}
            onSave={handleSave}
            onSkip={target ? () => advance(target) : undefined}
            onEditWord={target?.wordId ? () => setEditWordId(target.wordId ?? null) : undefined}
          />
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1">
              {tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium transition-colors',
                      tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="h-[28rem]">
              {tab === 'words' && (
                <Worklist
                  languageId={languageId}
                  currentWordId={target?.wordId ?? null}
                  refreshKey={worklistKey}
                  onPick={(t) => {
                    setTarget(t);
                    setTab('words');
                  }}
                />
              )}
              {tab === 'sentences' && (
                <SentenceList
                  languageId={languageId}
                  currentKey={target?.exampleId ?? target?.targetId ?? null}
                  refreshKey={targetsKey}
                  onPick={(t) => setTarget(t)}
                />
              )}
              {tab === 'review' && (
                <div className="h-full overflow-y-auto">
                  <ReviewPanel
                    languageId={languageId}
                    wordId={target?.wordId ?? null}
                    refreshKey={reviewKey}
                    onReplace={(row) =>
                      setTarget({
                        kind: row.kind,
                        label: row.label,
                        gloss: row.gloss,
                        wordId: row.word_id,
                        targetId: row.target_id,
                        isCorrection: true,
                        supersedesId: row.id,
                      })
                    }
                  />
                </div>
              )}
              {tab === 'corpus' && language && (
                <CorpusDashboard
                  languageId={languageId}
                  languageCode={language.code}
                  speakerId={speakerId}
                  speakerName={speakers.find((s) => s.id === speakerId)?.name ?? null}
                  refreshKey={reviewKey}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <EditWordModal
        wordId={editWordId}
        onClose={() => setEditWordId(null)}
        onSaved={() => {
          refreshAll();
          setReviewKey((k) => k + 1);
        }}
      />
    </div>
  );
}
