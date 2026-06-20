'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Loader2, X } from 'lucide-react';
import { Button, Input, Textarea, cn } from '@mobtranslate/ui';
import { Modal } from './Modal';
import { createTarget, fetchTargets, updateTarget, type CustomTarget } from './api';
import type { RecorderTarget } from './Recorder';

interface CustomTargetsProps {
  languageId: string;
  currentTargetId: string | null;
  refreshKey: number;
  onPick: (target: RecorderTarget) => void;
}

export function CustomTargets({ languageId, currentTargetId, refreshKey, onPick }: CustomTargetsProps) {
  const [targets, setTargets] = useState<CustomTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTargets(await fetchTargets(languageId, 'pending'));
    } catch {
      setTargets([]);
    } finally {
      setLoading(false);
    }
  }, [languageId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const skip = async (id: string) => {
    await updateTarget(id, { status: 'skipped' });
    setTargets((t) => t.filter((x) => x.id !== id));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Words &amp; phrases you&apos;ve added to record.</p>
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
          Add
        </Button>
      </div>

      <div className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1">
        {targets.length === 0 && !loading && (
          <div className="rounded-xl border-2 border-dashed border-border p-6 text-center">
            <p className="text-base text-foreground">No custom items yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a word or phrase that isn&apos;t in the dictionary yet, and it&apos;ll appear here to record.
            </p>
            <Button className="mt-3" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              Add a word or phrase
            </Button>
          </div>
        )}
        {targets.map((t) => {
          const active = t.id === currentTargetId;
          return (
            <div
              key={t.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2.5',
                active ? 'border-primary bg-primary/10' : 'border-border',
              )}
            >
              <button
                type="button"
                onClick={() => onPick({ kind: t.kind, label: t.text, gloss: t.gloss, targetId: t.id })}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-base font-medium text-foreground">{t.text}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {t.kind === 'phrase' ? 'Phrase' : 'Word'}
                  {t.gloss ? ` · ${t.gloss}` : ''}
                </span>
              </button>
              <button
                type="button"
                onClick={() => skip(t.id)}
                aria-label="Remove from list"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <AddTargetModal
        open={adding}
        languageId={languageId}
        onClose={() => setAdding(false)}
        onCreated={(t) => {
          setTargets((prev) => [...prev, t]);
          setAdding(false);
        }}
      />
    </div>
  );
}

function AddTargetModal({
  open,
  languageId,
  onClose,
  onCreated,
}: {
  open: boolean;
  languageId: string;
  onClose: () => void;
  onCreated: (t: CustomTarget) => void;
}) {
  const [kind, setKind] = useState<'word' | 'phrase'>('word');
  const [text, setText] = useState('');
  const [gloss, setGloss] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const t = await createTarget({
        languageId,
        kind,
        text: text.trim(),
        gloss: gloss.trim() || null,
        note: note.trim() || null,
      });
      setText('');
      setGloss('');
      setNote('');
      onCreated(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a word or phrase" description="Add something new to record. It won't change the dictionary until reviewed.">
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['word', 'phrase'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                'flex-1 rounded-lg border px-4 py-2.5 text-base font-medium capitalize',
                kind === k ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-muted',
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">{kind === 'phrase' ? 'Phrase' : 'Word'} (in language)</span>
          <Input size="lg" value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'phrase' ? 'e.g. Wanju nyumbal' : 'e.g. maya'} autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">English meaning (optional)</span>
          <Input size="lg" value={gloss} onChange={(e) => setGloss(e.target.value)} placeholder="e.g. hello friend" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Note for the speaker (optional)</span>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any context or pronunciation notes" rows={2} />
        </label>
        {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} loading={saving} loadingText="Adding…" disabled={!text.trim()}>
          Add to list
        </Button>
      </div>
    </Modal>
  );
}
