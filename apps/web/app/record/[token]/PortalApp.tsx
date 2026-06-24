'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Mic, Play, Pause, ChevronRight, Plus, ListChecks, MessageSquareText,
  CheckCircle2, Loader2, HelpCircle, AlertTriangle, Volume2, RotateCcw, PartyPopper, Headphones,
} from 'lucide-react';
import { Button, Input, Textarea, cn } from '@mobtranslate/ui';
import { uploadQueue } from '@/lib/recording/uploadQueue';
import type { CapturedRecording } from '@/lib/recording/types';
import { Recorder, MIC_HELP, type RecorderTarget } from '@/app/admin/recordings/studio/Recorder';
import { UploadStatus } from '@/app/admin/recordings/studio/UploadStatus';
import { useStudioMic } from '@/app/admin/recordings/studio/useStudioMic';
import { Modal } from '@/app/admin/recordings/studio/Modal';
import { BottomSheet } from './BottomSheet';
import { Walkthrough } from './Walkthrough';
import { authTransport, tokenTransport, type MyRecording, type PortalTransport, type PortalWorkItem } from './portalApi';

// Only serializable data crosses the server→client boundary; the transport
// (which holds functions) is constructed here, on the client.
export type PortalSource =
  | { kind: 'token'; token: string; ctx: { language_id: string; language_code: string; language_name: string; speaker_name: string | null; speaker_id: string | null } }
  | { kind: 'auth'; ctx: { language_id: string; language_code: string; language_name: string } };

type Step = 'welcome' | 'walkthrough' | 'miccheck' | 'record' | 'done';
const SEEN_KEY = 'mt-record-walkthrough-v1';

export function PortalApp({ source }: { source: PortalSource }) {
  const sourceKey = source.kind === 'token' ? `t:${source.token}:${source.ctx.language_id}` : `a:${source.ctx.language_id}`;
  const transport = useMemo<PortalTransport>(
    () => (source.kind === 'token' ? tokenTransport(source.token, source.ctx) : authTransport(source.ctx)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceKey],
  );

  // One shared microphone for the whole flow (mic-check turns it on; the
  // Recorder reuses the same stream).
  const mic = useStudioMic();

  const [step, setStep] = useState<Step>('welcome');
  const [kind, setKind] = useState<'word' | 'sentence'>('word');
  const [items, setItems] = useState<PortalWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<RecorderTarget | null>(null);
  const [recorded, setRecorded] = useState(0);
  const [online, setOnline] = useState(true);
  const [adding, setAdding] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mineOpen, setMineOpen] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  // Where to return after a Help-triggered walkthrough (null = normal first-run).
  const [resumeAfterWalk, setResumeAfterWalk] = useState<Step | null>(null);

  useEffect(() => {
    uploadQueue.init();
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const loadWorklist = useCallback(async () => {
    setLoading(true);
    try {
      const res = await transport.worklist({ kind, filter: 'pending', limit: 40 });
      setItems(res.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [transport, kind]);

  // (Re)load the worklist on mount and whenever the kind changes.
  useEffect(() => {
    void loadWorklist();
  }, [loadWorklist]);

  // Once the mic is live during the mic-check, move straight into recording.
  useEffect(() => {
    if (step === 'miccheck' && mic.isOpen) setStep('record');
  }, [step, mic.isOpen]);

  // On the record screen, make sure something is selected; if nothing is left,
  // celebrate (done).
  useEffect(() => {
    if (step !== 'record' || target) return;
    if (items.length) setTarget(toTarget(kind, items[0]));
    else if (!loading) setStep('done');
  }, [step, target, items, loading, kind]);

  const advance = useCallback(async () => {
    try {
      const res = await transport.worklist({ kind, filter: 'pending', limit: 20 });
      setItems(res.items);
      const cur = target?.wordId ?? target?.exampleId ?? target?.targetId;
      const next = res.items.find((i) => i.key !== cur);
      if (next) setTarget(toTarget(kind, next));
      else {
        setTarget(null);
        setStep('done');
      }
    } catch {
      setTarget(null);
    }
  }, [transport, kind, target]);

  const handleSave = useCallback(
    async (captured: CapturedRecording) => {
      if (!target) return;
      await uploadQueue.enqueue({
        captured,
        languageId: transport.languageId,
        languageCode: transport.languageCode,
        label: target.label,
        kind: target.kind,
        wordId: target.wordId ?? null,
        exampleId: target.exampleId ?? null,
        targetId: target.targetId ?? null,
        gloss: target.gloss,
        speakerId: transport.speakerId,
        uploadEndpoint: transport.uploadEndpoint,
      });
      setRecorded((n) => n + 1);
      setSavedToast(true);
      window.setTimeout(() => setSavedToast(false), 1500);
      await advance();
    },
    [target, transport, advance],
  );

  // ----- navigation helpers -----
  const beginFromWelcome = useCallback(() => {
    const seen = typeof window !== 'undefined' && window.localStorage.getItem(SEEN_KEY) === '1';
    if (!seen) {
      setResumeAfterWalk(null);
      setStep('walkthrough');
    } else {
      setStep(mic.isOpen ? 'record' : 'miccheck');
    }
  }, [mic.isOpen]);

  const finishWalkthrough = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode */
    }
    if (resumeAfterWalk) {
      setStep(resumeAfterWalk);
      setResumeAfterWalk(null);
    } else {
      setStep(mic.isOpen ? 'record' : 'miccheck');
    }
  }, [resumeAfterWalk, mic.isOpen]);

  const openWalkthroughFromHelp = useCallback(() => {
    setHelpOpen(false);
    setResumeAfterWalk(step === 'walkthrough' ? 'record' : step);
    setStep('walkthrough');
  }, [step]);

  const switchKind = useCallback((k: 'word' | 'sentence') => {
    setKind(k);
    setTarget(null);
    setMoreOpen(false);
    setStep('record');
  }, []);

  const remaining = items.length;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {step === 'welcome' && (
        <WelcomeScreen transport={transport} remaining={remaining} loading={loading} onStart={beginFromWelcome} onHowto={() => { setResumeAfterWalk(null); setStep('walkthrough'); }} onHelp={() => setHelpOpen(true)} />
      )}

      {step === 'walkthrough' && <Walkthrough onDone={finishWalkthrough} onSkip={finishWalkthrough} />}

      {step === 'miccheck' && <MicCheckScreen mic={mic} onHelp={() => setHelpOpen(true)} />}

      {step === 'record' && (
        <RecordScreen
          transport={transport}
          mic={mic}
          kind={kind}
          target={target}
          recorded={recorded}
          remaining={remaining}
          online={online}
          onSave={handleSave}
          onSkip={() => void advance()}
          onHelp={() => setHelpOpen(true)}
          onMore={() => setMoreOpen(true)}
        />
      )}

      {step === 'done' && (
        <DoneScreen
          transport={transport}
          kind={kind}
          recorded={recorded}
          onAddOwn={() => setAdding(true)}
          onHearMine={() => setMineOpen(true)}
          onRecordSentences={() => switchKind('sentence')}
          onHelp={() => setHelpOpen(true)}
        />
      )}

      {/* Persistent overlays */}
      <SavedToast show={savedToast} />

      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} onShowWalkthrough={openWalkthroughFromHelp} />

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="space-y-3 pb-2">
          <p className="text-base font-medium text-muted-foreground">What would you like to record?</p>
          <div className="grid grid-cols-2 gap-3">
            <BigToggle active={kind === 'word'} icon={ListChecks} label="Words" onClick={() => switchKind('word')} />
            <BigToggle active={kind === 'sentence'} icon={MessageSquareText} label="Sentences" onClick={() => switchKind('sentence')} />
          </div>
          <SheetAction icon={Plus} label="Add your own" sub="Record a word or sentence that isn’t in the list" onClick={() => { setMoreOpen(false); setAdding(true); }} />
          <SheetAction icon={Headphones} label="Hear my recordings" sub="Listen back to what you’ve recorded" onClick={() => { setMoreOpen(false); setMineOpen(true); }} />
          <div className="flex justify-center pt-1"><UploadStatus /></div>
        </div>
      </BottomSheet>

      <BottomSheet open={mineOpen} onClose={() => setMineOpen(false)} title="My recordings">
        <MyRecordings transport={transport} />
      </BottomSheet>

      <AddOwnModal
        open={adding}
        kind={kind}
        onClose={() => setAdding(false)}
        onCreated={(t) => {
          setAdding(false);
          setTarget({ kind: t.kind as RecorderTarget['kind'], label: t.text, gloss: t.gloss, targetId: t.id });
          setStep('record');
        }}
        transport={transport}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function ScreenShell({ children, onHelp }: { children: React.ReactNode; onHelp?: () => void }) {
  return (
    <div
      className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
    >
      {onHelp && (
        <div className="flex justify-end pt-1">
          <HelpButton onClick={onHelp} />
        </div>
      )}
      {children}
    </div>
  );
}

function WelcomeScreen({
  transport, remaining, loading, onStart, onHowto, onHelp,
}: {
  transport: PortalTransport; remaining: number; loading: boolean; onStart: () => void; onHowto: () => void; onHelp: () => void;
}) {
  return (
    <ScreenShell onHelp={onHelp}>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[var(--color-primary)]/12">
          <Mic className="h-14 w-14 text-[var(--color-primary)]" strokeWidth={1.75} />
        </div>
        {transport.speakerName && (
          <p className="mt-5 text-lg text-muted-foreground">
            Hello <span className="font-semibold text-foreground">{transport.speakerName}</span>
          </p>
        )}
        <h1 className="mt-2 text-3xl font-bold leading-tight text-foreground text-balance sm:text-4xl">
          Let’s record some <span className="text-[var(--color-primary)]">{transport.languageName}</span> words
        </h1>
        <p className="mt-4 max-w-sm text-xl leading-relaxed text-muted-foreground text-pretty">
          We’ll show you a word. You say it out loud. It helps keep your language strong for the next generation.
        </p>
        {!loading && remaining > 0 && (
          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-base font-medium text-foreground">
            <ListChecks className="h-5 w-5 text-[var(--color-secondary)]" />
            {remaining} {remaining === 1 ? 'word' : 'words'} ready for you
          </p>
        )}
      </div>

      <div className="space-y-3 pt-4">
        <Button size="lg" fullWidth className="h-16 text-xl" onClick={onStart}>
          Start
          <ChevronRight className="ml-1 h-6 w-6" />
        </Button>
        <Button variant="ghost" size="lg" fullWidth className="h-12 text-lg text-muted-foreground" onClick={onHowto}>
          How does this work?
        </Button>
      </div>
    </ScreenShell>
  );
}

function MicCheckScreen({ mic, onHelp }: { mic: ReturnType<typeof useStudioMic>; onHelp: () => void }) {
  const help = MIC_HELP[mic.micState];
  return (
    <ScreenShell onHelp={onHelp}>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[var(--color-primary)]/12">
          <Mic className="h-14 w-14 text-[var(--color-primary)]" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 text-3xl font-bold leading-tight text-foreground text-balance">Turn on your microphone</h1>

        {help ? (
          <div className="mt-5 w-full rounded-2xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-5 text-center">
            <AlertTriangle className="mx-auto h-9 w-9 text-[var(--color-warning)]" />
            <h2 className="mt-2 text-xl font-semibold text-foreground">{help.title}</h2>
            <p className="mt-1 text-lg text-muted-foreground text-pretty">{help.body}</p>
          </div>
        ) : (
          <p className="mt-4 max-w-sm text-xl leading-relaxed text-muted-foreground text-pretty">
            Your phone will ask for permission. Tap <span className="font-semibold text-foreground">Allow</span>. We only listen while you are recording.
          </p>
        )}
      </div>

      <div className="pt-4">
        <Button
          size="lg"
          fullWidth
          className="h-16 text-xl"
          leftIcon={<Mic className="h-6 w-6" />}
          onClick={mic.open}
          loading={mic.micState === 'requesting'}
          loadingText="Starting microphone…"
        >
          {help ? 'Try again' : 'Turn on microphone'}
        </Button>
      </div>
    </ScreenShell>
  );
}

function RecordScreen({
  transport, mic, kind, target, recorded, remaining, online, onSave, onSkip, onHelp, onMore,
}: {
  transport: PortalTransport;
  mic: ReturnType<typeof useStudioMic>;
  kind: 'word' | 'sentence';
  target: RecorderTarget | null;
  recorded: number;
  remaining: number;
  online: boolean;
  onSave: (c: CapturedRecording) => Promise<void>;
  onSkip: () => void;
  onHelp: () => void;
  onMore: () => void;
}) {
  const total = recorded + remaining;
  const pct = total > 0 ? Math.round((recorded / total) * 100) : 0;

  return (
    <div className="mx-auto min-h-[100dvh] max-w-md px-4" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
      <header
        className="sticky top-0 z-30 -mx-4 mb-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-foreground">{transport.languageName}</p>
            <p className="truncate text-sm text-muted-foreground">
              {transport.speakerName ? `Recording as ${transport.speakerName}` : 'Recording'}
            </p>
          </div>
          <HelpButton onClick={onHelp} />
        </div>
      </header>

      {/* Progress */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between text-base">
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-secondary)]">
            <CheckCircle2 className="h-5 w-5" /> {recorded} recorded
          </span>
          <span className="text-muted-foreground">{remaining} to go</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[var(--color-secondary)] transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {!online && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-[var(--color-warning)]/15 px-4 py-3 text-base font-medium text-[var(--color-warning)]">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          You’re offline — your recordings are safe on this phone and will upload by themselves when you’re back online.
        </div>
      )}

      <Recorder target={target} speakerName={transport.speakerName} mic={mic} showHints onSave={onSave} onSkip={target ? onSkip : undefined} />

      <div className="mt-4">
        <Button variant="secondary" size="lg" fullWidth className="h-14 text-lg" leftIcon={<Plus className="h-5 w-5" />} onClick={onMore}>
          {kind === 'word' ? 'More words & options' : 'More sentences & options'}
        </Button>
      </div>
    </div>
  );
}

function DoneScreen({
  transport, kind, recorded, onAddOwn, onHearMine, onRecordSentences, onHelp,
}: {
  transport: PortalTransport; kind: 'word' | 'sentence'; recorded: number;
  onAddOwn: () => void; onHearMine: () => void; onRecordSentences: () => void; onHelp: () => void;
}) {
  return (
    <ScreenShell onHelp={onHelp}>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[var(--color-secondary)]/15">
          <PartyPopper className="h-14 w-14 text-[var(--color-secondary)]" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 text-3xl font-bold leading-tight text-foreground text-balance">That’s everything for now</h1>
        <p className="mt-3 max-w-sm text-xl leading-relaxed text-muted-foreground text-pretty">
          Thank you for sharing your language{transport.speakerName ? `, ${transport.speakerName}` : ''}.
          {recorded > 0 ? ` You recorded ${recorded} ${recorded === 1 ? 'time' : 'times'} today.` : ''} Your recordings are saved.
        </p>
        <div className="mt-5"><UploadStatus /></div>
      </div>

      <div className="space-y-3 pt-4">
        <Button size="lg" fullWidth className="h-16 text-xl" leftIcon={<Plus className="h-6 w-6" />} onClick={onAddOwn}>
          Record my own {kind === 'sentence' ? 'sentence' : 'word'}
        </Button>
        {kind === 'word' && (
          <Button variant="secondary" size="lg" fullWidth className="h-14 text-lg" leftIcon={<MessageSquareText className="h-5 w-5" />} onClick={onRecordSentences}>
            Record sentences too
          </Button>
        )}
        <Button variant="ghost" size="lg" fullWidth className="h-14 text-lg text-muted-foreground" leftIcon={<Headphones className="h-5 w-5" />} onClick={onHearMine}>
          Hear my recordings
        </Button>
      </div>
    </ScreenShell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-base font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
    >
      <HelpCircle className="h-5 w-5 text-[var(--color-primary)]" />
      Help
    </button>
  );
}

function SavedToast({ show }: { show: boolean }) {
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-[700] flex justify-center transition-all duration-200 motion-reduce:transition-none',
        show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
      )}
      style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      aria-live="polite"
    >
      {show && (
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-secondary)] px-5 py-3 text-lg font-semibold text-white shadow-lg">
          <CheckCircle2 className="h-6 w-6" /> Saved
        </span>
      )}
    </div>
  );
}

function BigToggle({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof ListChecks; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl border-2 px-4 py-5 text-lg font-semibold transition-colors',
        active ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted',
      )}
    >
      <Icon className={cn('h-7 w-7', active ? 'text-[var(--color-primary)]' : 'text-muted-foreground')} />
      {label}
    </button>
  );
}

function SheetAction({ icon: Icon, label, sub, onClick }: { icon: typeof Plus; label: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:bg-muted"
    >
      <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/12">
        <Icon className="h-6 w-6 text-[var(--color-primary)]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold text-foreground">{label}</span>
        <span className="block text-base text-muted-foreground">{sub}</span>
      </span>
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
    </button>
  );
}

function HelpSheet({ open, onClose, onShowWalkthrough }: { open: boolean; onClose: () => void; onShowWalkthrough: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Help">
      <div className="space-y-3 pb-2">
        <SheetAction icon={Volume2} label="Show me how again" sub="Watch the quick how-to one more time" onClick={onShowWalkthrough} />

        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-lg font-semibold text-foreground">If something isn’t working</h3>
          <dl className="mt-3 space-y-3 text-base">
            <div>
              <dt className="flex items-center gap-2 font-semibold text-foreground"><Mic className="h-5 w-5 text-[var(--color-primary)]" /> The microphone won’t turn on</dt>
              <dd className="mt-1 text-muted-foreground text-pretty">Tap the small lock icon near the web address at the top, choose the microphone, and allow it. Then tap “Turn on microphone” again.</dd>
            </div>
            <div>
              <dt className="flex items-center gap-2 font-semibold text-foreground"><AlertTriangle className="h-5 w-5 text-[var(--color-warning)]" /> It says I’m too quiet or too loud</dt>
              <dd className="mt-1 text-muted-foreground text-pretty">Hold the phone about a hand’s width from your mouth. If it’s too loud, move it back a little. Speak in your normal voice.</dd>
            </div>
            <div>
              <dt className="flex items-center gap-2 font-semibold text-foreground"><RotateCcw className="h-5 w-5 text-[var(--color-primary)]" /> I made a mistake</dt>
              <dd className="mt-1 text-muted-foreground text-pretty">No problem. Before you tap “Keep”, tap “Record again” and have another go. You can redo it as many times as you like.</dd>
            </div>
          </dl>
        </div>

        <Button variant="secondary" size="lg" fullWidth className="h-14 text-lg" onClick={onClose}>
          Got it
        </Button>
      </div>
    </BottomSheet>
  );
}

function toTarget(kind: 'word' | 'sentence', item: PortalWorkItem): RecorderTarget {
  return kind === 'sentence'
    ? { kind: 'sentence', label: item.label, gloss: item.gloss, exampleId: item.key }
    : { kind: 'word', label: item.label, gloss: item.gloss, wordId: item.key };
}

function MyRecordings({ transport }: { transport: PortalTransport }) {
  const [rows, setRows] = useState<MyRecording[] | null>(null);
  useEffect(() => {
    transport.myRecordings().then(setRows).catch(() => setRows([]));
    const onUp = () => transport.myRecordings().then(setRows).catch(() => undefined);
    window.addEventListener('recording-uploaded', onUp);
    return () => window.removeEventListener('recording-uploaded', onUp);
  }, [transport]);

  if (rows === null) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (rows.length === 0)
    return <p className="px-1 py-8 text-center text-lg text-muted-foreground">Your saved recordings will appear here once you’ve recorded a few.</p>;

  return (
    <div className="space-y-2 pb-2">
      {rows.map((r) => (
        <PlayRow key={r.id} row={r} />
      ))}
    </div>
  );
}

function PlayRow({ row }: { row: MyRecording }) {
  const [playing, setPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const src = row.opus_url || row.master_url;
  const toggle = () => {
    if (!src) return;
    let a = audio;
    if (!a) {
      a = new Audio(src);
      a.onended = () => setPlaying(false);
      a.onpause = () => setPlaying(false);
      a.onplay = () => setPlaying(true);
      setAudio(a);
    }
    if (a.paused) {
      a.currentTime = 0;
      a.play().catch(() => setPlaying(false));
    } else a.pause();
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3">
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        aria-label={playing ? 'Pause' : 'Play'}
        className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary)] text-white shadow-sm transition-transform active:scale-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
      >
        {playing ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="h-6 w-6" fill="currentColor" />}
      </button>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-medium text-foreground">{row.label}</span>
        {row.gloss && <span className="block truncate text-base text-muted-foreground">{row.gloss}</span>}
      </span>
      {row.duration_ms != null && <span className="flex-shrink-0 text-sm text-muted-foreground">{(row.duration_ms / 1000).toFixed(1)}s</span>}
    </div>
  );
}

function AddOwnModal({
  open, kind, transport, onClose, onCreated,
}: {
  open: boolean;
  kind: 'word' | 'sentence';
  transport: PortalTransport;
  onClose: () => void;
  onCreated: (t: { id: string; text: string; gloss: string | null; kind: string }) => void;
}) {
  const [text, setText] = useState('');
  const [gloss, setGloss] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const t = await transport.addTarget({ kind, text: text.trim(), gloss: gloss.trim() || null });
      setText('');
      setGloss('');
      onCreated(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={kind === 'sentence' ? 'Add a sentence' : 'Add a word'} description="Add your own to record. You can include what it means in English.">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-base font-medium text-foreground">{kind === 'sentence' ? 'Sentence' : 'Word'} (in your language)</span>
          {kind === 'sentence' ? (
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus />
          ) : (
            <Input size="lg" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          )}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-base font-medium text-foreground">What it means (English)</span>
          <Input size="lg" value={gloss} onChange={(e) => setGloss(e.target.value)} placeholder="optional" />
        </label>
        {error && <p className="text-base text-[var(--color-destructive)]">{error}</p>}
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <Button size="lg" className="h-14 text-lg" onClick={submit} loading={saving} loadingText="Adding…" disabled={!text.trim()}>
          Add &amp; record
        </Button>
        <Button variant="ghost" size="lg" className="h-12 text-base" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
