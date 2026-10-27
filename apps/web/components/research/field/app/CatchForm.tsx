'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Minus, Plus, X } from 'lucide-react';
import { baitKey, baitLabel } from '@/lib/research/field/conditions';
import { baitedMethods, fishingMethodLabels, fishingMethods, type FieldTarget, type FishingMethod } from '@/lib/research/field/types';
import { fixQuality, type Fix, type GpsState } from './sensors';
import { Button } from './ui';

export type CatchInput = {
  fix: Fix;
  targetId: string;
  bait: string | null;
  method: FishingMethod | null;
  observedAt: string | null;
  catchCount: number | null;
  sizeCm: number | null;
  kept: boolean | null;
  notes: string;
  photo: File | null;
  loggedByName: string;
};

/** Common baits on Cape York rivers, offered until your own list takes over. */
const STARTER_BAITS = ['Cherabin', 'Prawn', 'Worm', 'Grasshopper', 'Fish strip', 'Lure'];
const MAX_BAIT_CHOICES = 6;

/** Your baits first, most used first, topped up with the starters. */
export function baitChoices(used: Array<string | null>): string[] {
  const counts = new Map<string, number>();
  for (const bait of used) {
    const key = baitKey(bait);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const yours = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  for (const starter of STARTER_BAITS) if (!yours.includes(baitKey(starter)!)) yours.push(baitKey(starter)!);
  return yours.slice(0, Math.max(MAX_BAIT_CHOICES, counts.size));
}

/** A datetime-local value in this phone's own time zone. */
function localInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function Choice({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="field-choice" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * Log one catch, or a spell fished with nothing caught. Bait and method are
 * remembered from the last log, since they rarely change between casts.
 */
export default function CatchForm({
  kind,
  animals,
  selectedId,
  gps,
  best,
  loggedByName,
  baits,
  lastBait,
  lastMethod,
  onSave,
  onCancel,
}: {
  kind: 'presence' | 'absence';
  animals: FieldTarget[];
  selectedId: string;
  gps: GpsState;
  best: Fix | null;
  loggedByName: string;
  baits: string[];
  lastBait: string | null;
  lastMethod: FishingMethod | null;
  onSave: (input: CatchInput) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [targetId, setTargetId] = useState(selectedId);
  const [method, setMethod] = useState<FishingMethod | null>(lastMethod ?? 'handline');
  const [bait, setBait] = useState<string | null>(baitKey(lastBait));
  const [otherBait, setOtherBait] = useState('');
  const [typingBait, setTypingBait] = useState(false);
  const [earlier, setEarlier] = useState(false);
  const [when, setWhen] = useState(() => localInputValue(new Date()));
  const [count, setCount] = useState(1);
  const [size, setSize] = useState('');
  const [kept, setKept] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState(loggedByName);
  const photoInput = useRef<HTMLInputElement>(null);
  const live = gps.status === 'live' ? gps.fix : null;
  const quality = best ? fixQuality(best.accuracy) : null;
  const usesBait = method === null || baitedMethods.includes(method);
  const animal = animals.find((a) => a.id === targetId);
  const shownBaits = bait && !baits.includes(bait) ? [bait, ...baits] : baits;

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const chosenBait = usesBait ? (typingBait ? baitKey(otherBait) : bait) : null;
  const sizeValue = size.trim() === '' ? null : Number(size);
  const sizeValid = sizeValue === null || (Number.isFinite(sizeValue) && sizeValue > 0 && sizeValue < 1000);
  const observedAt = earlier && when ? new Date(when) : null;
  const timeValid = !observedAt || (!Number.isNaN(observedAt.getTime()) && observedAt.getTime() <= Date.now() + 60_000);

  return (
    <form
      className="space-y-5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      onSubmit={(event) => {
        event.preventDefault();
        if (!best || !sizeValid || !timeValid) return;
        onSave({
          fix: best,
          targetId,
          bait: chosenBait,
          method,
          observedAt: observedAt ? observedAt.toISOString() : null,
          catchCount: kind === 'presence' ? count : null,
          sizeCm: kind === 'presence' ? sizeValue : null,
          kept: kind === 'presence' ? kept : null,
          notes: notes.trim(),
          photo: kind === 'presence' ? photo : null,
          loggedByName: name.trim(),
        });
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold text-balance">{kind === 'presence' ? 'Log a catch' : 'Fished here, nothing caught'}</h2>
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

      <fieldset className="space-y-2">
        <legend className="field-label mb-2">{kind === 'presence' ? 'What did you catch?' : 'What were you after?'}</legend>
        <div className="field-choices">
          {animals.map((a) => (
            <Choice key={a.id} pressed={a.id === targetId} onClick={() => setTargetId(a.id)}>
              {a.name}
            </Choice>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="field-label mb-2">How</legend>
        <div className="field-choices">
          {fishingMethods.map((m) => (
            <Choice key={m} pressed={method === m} onClick={() => setMethod(m)}>
              {fishingMethodLabels[m]}
            </Choice>
          ))}
        </div>
      </fieldset>

      {usesBait && (
        <fieldset className="space-y-2">
          <legend className="field-label mb-2">Bait</legend>
          <div className="field-choices">
            {shownBaits.map((b) => (
              <Choice
                key={b}
                pressed={!typingBait && bait === b}
                onClick={() => {
                  setTypingBait(false);
                  setBait(bait === b ? null : b);
                }}
              >
                {baitLabel(b)}
              </Choice>
            ))}
            <Choice pressed={typingBait} onClick={() => setTypingBait(!typingBait)}>
              Something else…
            </Choice>
          </div>
          {typingBait && (
            <input
              aria-label="Bait"
              value={otherBait}
              onChange={(e) => setOtherBait(e.target.value)}
              maxLength={80}
              className="field-input"
              placeholder="e.g. Red claw"
              autoFocus
            />
          )}
        </fieldset>
      )}

      {kind === 'presence' && (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="space-y-1.5">
            <span className="field-label" id={`${id}-count`}>
              How many
            </span>
            <div className="field-stepper" role="group" aria-labelledby={`${id}-count`}>
              <button type="button" aria-label="One fewer" disabled={count <= 1} onClick={() => setCount((c) => Math.max(1, c - 1))}>
                <Minus className="h-5 w-5" aria-hidden />
              </button>
              <output aria-live="polite">{count}</output>
              <button type="button" aria-label="One more" disabled={count >= 500} onClick={() => setCount((c) => Math.min(500, c + 1))}>
                <Plus className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
          <div className="w-28 space-y-1.5">
            <label htmlFor={`${id}-size`} className="field-label">
              Size <span className="font-normal text-[var(--field-ink-soft)]">(cm)</span>
            </label>
            <input
              id={`${id}-size`}
              inputMode="decimal"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="field-input tabular-nums"
              placeholder="—"
              aria-invalid={!sizeValid}
            />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="field-label mb-1.5">Kept?</legend>
            <div className="field-choices">
              <Choice pressed={kept === true} onClick={() => setKept(kept === true ? null : true)}>
                Kept
              </Choice>
              <Choice pressed={kept === false} onClick={() => setKept(kept === false ? null : false)}>
                Let go
              </Choice>
            </div>
          </fieldset>
        </div>
      )}
      {!sizeValid && <p className="field-error">Size should be a number of centimetres.</p>}

      <div className="space-y-2">
        <label className="flex items-center gap-3 text-[0.9375rem]">
          <input type="checkbox" checked={earlier} onChange={(e) => setEarlier(e.target.checked)} className="field-check" />
          {kind === 'presence' ? 'Caught it earlier' : 'Fished here earlier'}
        </label>
        {earlier && (
          <input
            type="datetime-local"
            aria-label="When"
            value={when}
            max={localInputValue(new Date())}
            onChange={(e) => setWhen(e.target.value)}
            className="field-input"
          />
        )}
        {earlier && <p className="field-note">The position saved is where you are now, so log it from the same spot.</p>}
        {!timeValid && <p className="field-error">That time is in the future.</p>}
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
          <p className="text-sm text-[var(--field-ink-soft)]">Location data is removed from the photo.</p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor={`${id}-notes`} className="field-label">
          Note <span className="font-normal text-[var(--field-ink-soft)]">(optional)</span>
        </label>
        <textarea
          id={`${id}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          className="field-input"
          placeholder={kind === 'presence' ? 'Snag, deep hole, water colour…' : 'How long you fished, what the water was like…'}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${id}-by`} className="field-label">
          Logged by
        </label>
        <input id={`${id}-by`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" className="field-input" placeholder="Your name" />
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button type="submit" variant="primary" size="xl" disabled={!best || !sizeValid || !timeValid || !animal}>
          Save
        </Button>
        <Button variant="ghost" size="xl" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
