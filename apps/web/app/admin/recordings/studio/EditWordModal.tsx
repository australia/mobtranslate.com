'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check, Clock } from 'lucide-react';
import { Button, Input, Textarea } from '@mobtranslate/ui';
import { Modal } from './Modal';
import { fetchWordEdit, submitWordEdit, type WordEditChange, type WordEditSnapshot } from './api';

interface EditWordModalProps {
  wordId: string | null;
  onClose: () => void;
  onSaved?: () => void;
}

interface FormState {
  word: string;
  phonetic_transcription: string;
  notes: string;
  word_type: string;
  definition: string;
  translation: string;
}

const emptyForm: FormState = { word: '', phonetic_transcription: '', notes: '', word_type: '', definition: '', translation: '' };

export function EditWordModal({ wordId, onClose, onSaved }: EditWordModalProps) {
  const [snap, setSnap] = useState<WordEditSnapshot | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ applied: number; queued: number } | null>(null);

  useEffect(() => {
    if (!wordId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    fetchWordEdit(wordId)
      .then((s) => {
        setSnap(s);
        setForm({
          word: s.word ?? '',
          phonetic_transcription: s.phonetic_transcription ?? '',
          notes: s.notes ?? '',
          word_type: s.word_type ?? '',
          definition: s.primaryDefinition?.definition ?? '',
          translation: s.primaryTranslation?.translation ?? '',
        });
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [wordId]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const buildChanges = (): WordEditChange[] => {
    if (!snap) return [];
    const orig: FormState = {
      word: snap.word ?? '',
      phonetic_transcription: snap.phonetic_transcription ?? '',
      notes: snap.notes ?? '',
      word_type: snap.word_type ?? '',
      definition: snap.primaryDefinition?.definition ?? '',
      translation: snap.primaryTranslation?.translation ?? '',
    };
    const changes: WordEditChange[] = [];
    (Object.keys(form) as (keyof FormState)[]).forEach((k) => {
      if (form[k] !== orig[k]) {
        changes.push({
          field: k,
          current: orig[k] || null,
          suggested: form[k] || null,
          rowId:
            k === 'definition' ? snap.primaryDefinition?.id ?? null : k === 'translation' ? snap.primaryTranslation?.id ?? null : null,
        });
      }
    });
    return changes;
  };

  const changes = snap ? buildChanges() : [];

  const submit = async () => {
    if (!wordId || changes.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await submitWordEdit(wordId, changes, reason.trim() || undefined);
      setResult({ applied: res.applied, queued: res.queued });
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!wordId}
      onClose={onClose}
      title="Edit word & meaning"
      description="Changes are saved as suggestions with a full revision history."
      className="max-w-xl"
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : result ? (
        <div className="py-6 text-center">
          {result.applied > 0 ? (
            <Check className="mx-auto h-10 w-10 text-[var(--color-secondary)]" />
          ) : (
            <Clock className="mx-auto h-10 w-10 text-[var(--color-warning)]" />
          )}
          <p className="mt-3 text-lg font-medium text-foreground">
            {result.applied > 0 && `${result.applied} change${result.applied > 1 ? 's' : ''} applied`}
            {result.applied > 0 && result.queued > 0 && ' · '}
            {result.queued > 0 && `${result.queued} sent for review`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Recorded as a suggestion + revision.</p>
          <Button className="mt-5" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <>
          {snap?.pendingSuggestions && snap.pendingSuggestions.length > 0 && (
            <div className="mb-4 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-sm text-foreground">
              {snap.pendingSuggestions.length} edit{snap.pendingSuggestions.length > 1 ? 's' : ''} already pending review for this word.
            </div>
          )}
          <div className="space-y-4">
            <Field label="Word (spelling)">
              <Input size="lg" value={form.word} onChange={set('word')} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phonetic (IPA)">
                <Input size="lg" value={form.phonetic_transcription} onChange={set('phonetic_transcription')} placeholder="optional" />
              </Field>
              <Field label="Word type">
                <Input size="lg" value={form.word_type} onChange={set('word_type')} placeholder="e.g. noun" />
              </Field>
            </div>
            <Field label="English translation">
              <Input size="lg" value={form.translation} onChange={set('translation')} placeholder="the primary meaning" />
            </Field>
            <Field label="Definition">
              <Textarea value={form.definition} onChange={set('definition')} rows={2} placeholder="a fuller definition" />
            </Field>
            <Field label="Notes">
              <Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="usage, cultural notes, etc." />
            </Field>
            <Field label="Reason for change (optional)">
              <Input size="lg" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why this edit" />
            </Field>
          </div>
          {error && <p className="mt-3 text-sm text-[var(--color-destructive)]">{error}</p>}
          <div className="mt-6 flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {changes.length === 0 ? 'No changes yet' : `${changes.length} change${changes.length > 1 ? 's' : ''}`}
            </span>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={submit} loading={saving} loadingText="Saving…" disabled={changes.length === 0}>
                Save changes
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
