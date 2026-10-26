'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { fixQuality, type Fix, type GpsState } from './sensors';
import { Button } from './ui';

/**
 * Confirm a log. The position firms up while the form is open and the
 * sharpest fix seen is the one saved, so waiting a few seconds is rewarded.
 */
export default function LogForm({
  kind,
  targetName,
  gps,
  best,
  loggedByName,
  onSave,
  onCancel,
}: {
  kind: 'presence' | 'absence';
  targetName: string;
  gps: GpsState;
  best: Fix | null;
  loggedByName: string;
  onSave: (input: { fix: Fix; notes: string; photo: File | null; loggedByName: string }) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState(loggedByName);
  const photoInput = useRef<HTMLInputElement>(null);
  const live = gps.status === 'live' ? gps.fix : null;
  const quality = best ? fixQuality(best.accuracy) : null;

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const title = kind === 'presence' ? `Found ${targetName.toLowerCase()} here` : `Looked here — no ${targetName.toLowerCase()}`;

  return (
    <form
      className="space-y-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      onSubmit={(event) => {
        event.preventDefault();
        if (best) onSave({ fix: best, notes: notes.trim(), photo, loggedByName: name.trim() });
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold text-balance">{title}</h2>
        <button type="button" onClick={onCancel} className="field-icon-btn -mr-2 -mt-1" aria-label="Cancel">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className={`field-fix ${quality ? `field-fix-${quality.level}` : 'field-fix-waiting'}`} aria-live="polite">
        {best && quality ? (
          <>
            <p className="font-semibold">
              {quality.level === 'good' ? 'Position is good' : quality.level === 'fair' ? 'Position is fair — sharpening' : 'Position is weak — hold still'}
            </p>
            <p className="tabular-nums">
              Saving the sharpest reading: ±{Math.round(best.accuracy)} m
              {live && live.accuracy > best.accuracy + 1 ? ` (now ±${Math.round(live.accuracy)} m)` : ''}
            </p>
          </>
        ) : (
          <p className="font-semibold">Waiting for your position…</p>
        )}
      </div>

      {kind === 'presence' && (
        <div className="flex items-center gap-3">
          <input ref={photoInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          {preview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Photo to attach" className="h-20 w-20 rounded-lg object-cover" />
              <button
                type="button"
                className="field-icon-btn absolute -right-3 -top-3 !min-h-9 !min-w-9 bg-white shadow"
                aria-label="Remove photo"
                onClick={() => {
                  setPhoto(null);
                  if (photoInput.current) photoInput.current.value = '';
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => photoInput.current?.click()} className="shrink-0 whitespace-nowrap">
              <Camera className="h-5 w-5" aria-hidden /> Add a photo
            </Button>
          )}
          <p className="text-sm text-[var(--field-ink-soft)]">The leaf and vine help confirm what it is. Location data is removed from the photo.</p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="log-notes" className="field-label">
          Note <span className="font-normal text-[var(--field-ink-soft)]">(optional)</span>
        </label>
        <textarea
          id="log-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          className="field-input"
          placeholder={kind === 'presence' ? 'Size of the vine, soil, creek nearby…' : 'How far you searched, what the ground was like…'}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="log-by" className="field-label">
          Logged by
        </label>
        <input id="log-by" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" className="field-input" placeholder="Your name" />
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button type="submit" variant="primary" size="xl" disabled={!best}>
          Save
        </Button>
        <Button variant="ghost" size="xl" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
