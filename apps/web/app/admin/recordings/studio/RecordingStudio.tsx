'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks, MessageSquareText, History, BarChart3, Mic, ChevronLeft, Clock, CheckCircle2, Headphones, Users } from 'lucide-react';
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
import { InviteSpeakers } from './InviteSpeakers';
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

  // Session tracking — a sit-down with one speaker can run ~an hour.
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

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

  // Start a fresh session whenever a speaker is active; stop when cleared.
  useEffect(() => {
    if (speakerId) {
      setSessionStart(Date.now());
      setSessionCount(0);
    } else {
      setSessionStart(null);
    }
  }, [speakerId]);

  // Tick the session clock.
  useEffect(() => {
    if (sessionStart == null) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - sessionStart) / 1000)), 1000);
    return () => clearInterval(id);
  }, [sessionStart]);

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
      setSessionCount((c) => c + 1);
      if (sessionStart == null) setSessionStart(Date.now());
      refreshAll();
      await advance(target);
    },
    [target, language, languageId, speakerId, sessionStart, refreshAll, advance],
  );

  const tabs: { id: Tab; label: string; icon: typeof ListChecks }[] = [
    { id: 'words', label: 'Words', icon: ListChecks },
    { id: 'sentences', label: 'Sentences', icon: MessageSquareText },
    { id: 'review', label: 'Recordings', icon: History },
    { id: 'corpus', label: 'Corpus', icon: BarChart3 },
  ];

  const speakerName = speakers.find((s) => s.id === speakerId)?.name ?? null;
  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* TOPBAR */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:h-14 sm:flex-nowrap sm:px-5 sm:py-0">
          <Link
            href="/admin"
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Admin</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Mic className="h-4 w-4 text-primary" />
            </span>
            <span className="hidden font-display text-lg font-bold text-foreground md:inline">Studio</span>
          </div>
          <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <select
            value={languageId}
            onChange={(e) => setLanguageId(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Language"
          >
            {languages.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <SpeakerPicker
            languageId={languageId}
            speakers={speakers}
            selectedId={speakerId}
            onSelect={selectSpeaker}
            onSpeakersChange={setSpeakers}
          />
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/admin/recordings/library"
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
              title="Recording library"
            >
              <Headphones className="h-4 w-4" /> <span className="hidden lg:inline">Library</span>
            </Link>
            <InviteSpeakers languageId={languageId} />
            <UploadStatus />
          </div>
        </div>

        {/* SESSION STRIP */}
        {speakerId && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border/60 bg-primary/5 px-3 py-1.5 text-sm sm:px-5">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <Users className="h-3.5 w-3.5 text-primary" /> {speakerName ?? 'Speaker'}
            </span>
            <span className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> {elapsedLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {sessionCount} recorded this session
            </span>
            <span className="hidden text-xs text-muted-foreground md:inline">
              Record → it auto-advances to the next word. Take your time — aim for a relaxed ~hour together.
            </span>
          </div>
        )}
      </header>

      {/* BODY */}
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        {!speakerId ? (
          <div className="mx-auto mt-6 max-w-lg rounded-3xl border border-border bg-card p-8 text-center sm:mt-12">
            <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Users className="h-8 w-8 text-primary" />
            </span>
            <h1 className="font-display text-2xl font-bold text-foreground">Start a recording session</h1>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
              Pick a speaker to begin. The studio walks through one word or sentence at a time and
              auto-advances after each take, so a speaker can settle in for a relaxed session.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <SpeakerPicker
                languageId={languageId}
                speakers={speakers}
                selectedId={speakerId}
                onSelect={selectSpeaker}
                onSpeakersChange={setSpeakers}
              />
              <InviteSpeakers languageId={languageId} />
            </div>
            {speakers.length === 0 && (
              <p className="mt-4 text-sm text-muted-foreground">
                No speakers yet for {language?.name}. Invite one to get started.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Recorder
                target={target}
                speakerName={speakerName}
                onSave={handleSave}
                onSkip={target ? () => advance(target) : undefined}
                onEditWord={target?.wordId ? () => setEditWordId(target.wordId ?? null) : undefined}
              />
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-border bg-card p-4">
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
                        <span className="hidden sm:inline">{t.label}</span>
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
                      speakerName={speakerName}
                      refreshKey={reviewKey}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

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
