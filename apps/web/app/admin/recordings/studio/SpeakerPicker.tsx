'use client';

import { useState } from 'react';
import { UserPlus, ChevronDown, Check } from 'lucide-react';
import { Button, Input, cn } from '@mobtranslate/ui';
import { Modal } from './Modal';
import { createSpeaker, type SpeakerProfile } from './api';

interface SpeakerPickerProps {
  languageId: string;
  speakers: SpeakerProfile[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSpeakersChange: (speakers: SpeakerProfile[]) => void;
}

export function SpeakerPicker({ languageId, speakers, selectedId, onSelect, onSpeakersChange }: SpeakerPickerProps) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const selected = speakers.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-left hover:bg-muted"
        >
          <div>
            <span className="block text-xs text-muted-foreground">Speaker</span>
            <span className="block text-base font-medium text-foreground">
              {selected ? selected.name : 'Not set'}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
            <div className="absolute left-0 z-20 mt-2 w-72 rounded-xl border border-border bg-card p-1.5 shadow-lg">
              {speakers.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">No speakers yet. Add one below.</p>
              )}
              {speakers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onSelect(s.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-muted',
                    s.id === selectedId && 'bg-primary/10',
                  )}
                >
                  <span>
                    <span className="block text-base font-medium text-foreground">{s.name}</span>
                    {(s.community || s.age) && (
                      <span className="block text-xs text-muted-foreground">
                        {[s.community, s.age ? `${s.age} yrs` : null].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  {s.id === selectedId && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setAdding(true);
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-border px-3 py-2.5 text-left text-primary hover:bg-muted"
              >
                <UserPlus className="h-4 w-4" />
                <span className="text-base font-medium">Add a speaker</span>
              </button>
            </div>
          </>
        )}
      </div>

      <AddSpeakerModal
        open={adding}
        languageId={languageId}
        onClose={() => setAdding(false)}
        onCreated={(s) => {
          onSpeakersChange([...speakers, s]);
          onSelect(s.id);
          setAdding(false);
        }}
      />
    </div>
  );
}

function AddSpeakerModal({
  open,
  languageId,
  onClose,
  onCreated,
}: {
  open: boolean;
  languageId: string;
  onClose: () => void;
  onCreated: (s: SpeakerProfile) => void;
}) {
  const [name, setName] = useState('');
  const [community, setCommunity] = useState('');
  const [age, setAge] = useState('');
  const [dialect, setDialect] = useState('');
  const [consent, setConsent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const s = await createSpeaker({
        name: name.trim(),
        languageId,
        community: community.trim() || null,
        age: age ? Number(age) : null,
        dialect: dialect.trim() || null,
        culturalConsent: consent,
      });
      setName('');
      setCommunity('');
      setAge('');
      setDialect('');
      onCreated(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a speaker" description="Who is making these recordings? This credits their voice.">
      <div className="space-y-4">
        <Field label="Name">
          <Input size="lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aunty Mary" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Community (optional)">
            <Input size="lg" value={community} onChange={(e) => setCommunity(e.target.value)} placeholder="e.g. Mossman Gorge" />
          </Field>
          <Field label="Age (optional)">
            <Input size="lg" type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 80" />
          </Field>
        </div>
        <Field label="Dialect (optional)">
          <Input size="lg" value={dialect} onChange={(e) => setDialect(e.target.value)} placeholder="e.g. coastal" />
        </Field>
        <label className="flex items-start gap-3 rounded-lg bg-muted p-3">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5" />
          <span className="text-sm text-foreground">
            This speaker consents to their recordings being shared in the dictionary.
          </span>
        </label>
        {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} loading={saving} loadingText="Saving…" disabled={!name.trim()}>
          Add speaker
        </Button>
      </div>
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
