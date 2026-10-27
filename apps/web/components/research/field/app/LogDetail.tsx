'use client';

import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { baitLabel } from '@/lib/research/field/conditions';
import { fishingMethodLabels, type Activity } from '@/lib/research/field/types';
import { formatCoordinate, whenLogged } from '../geo';
import type { FieldLog } from './useFieldData';
import { Button } from './ui';

export default function LogDetail({
  log,
  targetName,
  activity = 'gather',
  online,
  onDelete,
  onClose,
}: {
  log: FieldLog;
  targetName: string;
  activity?: Activity;
  online: boolean;
  onDelete: (log: FieldLog) => Promise<boolean>;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = log.pending || online;
  const fishing = activity === 'fish';
  const title = fishing
    ? log.kind === 'presence'
      ? `${targetName}${log.catchCount && log.catchCount > 1 ? ` ×${log.catchCount}` : ''}`
      : `Nothing caught`
    : log.kind === 'presence'
      ? `Found ${targetName.toLowerCase()}`
      : `Looked — no ${targetName.toLowerCase()}`;

  return (
    <div className="space-y-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-[var(--field-ink-soft)]">
            {fishing && log.kind === 'absence' ? `After ${targetName.toLowerCase()} · ` : ''}
            {whenLogged(log.observedAt)}
            {log.loggedByName ? ` · ${log.loggedByName}` : ''}
          </p>
        </div>
        <button type="button" onClick={onClose} className="field-icon-btn -mr-2 -mt-1" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      {log.hasPhoto && !log.pending && online && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/admin/research/field/observations/${log.id}/photo`} alt={`Photo logged with this ${fishing ? 'catch' : log.kind === 'presence' ? 'find' : 'search'}`} className="max-h-64 w-full rounded-xl object-cover" />
      )}
      {log.hasPhoto && (log.pending || !online) && <p className="field-note">{log.pending ? 'The photo uploads with this log.' : 'The photo shows when you’re online.'}</p>}

      <dl className="field-facts">
        {fishing && (
          <>
            <div>
              <dt>Bait</dt>
              <dd>{log.bait ? baitLabel(log.bait) : 'None recorded'}</dd>
            </div>
            <div>
              <dt>How</dt>
              <dd>{log.method ? fishingMethodLabels[log.method] : 'Not recorded'}</dd>
            </div>
            {log.kind === 'presence' && (
              <>
                <div>
                  <dt>Size</dt>
                  <dd className="tabular-nums">{log.sizeCm ? `${Math.round(log.sizeCm)} cm` : 'Not measured'}</dd>
                </div>
                <div>
                  <dt>Kept</dt>
                  <dd>{log.kept === null ? 'Not recorded' : log.kept ? 'Kept' : 'Let go'}</dd>
                </div>
              </>
            )}
          </>
        )}
        <div>
          <dt>Position</dt>
          <dd className="font-mono text-sm">{formatCoordinate(log.latitude, log.longitude)}</dd>
        </div>
        <div>
          <dt>Accuracy</dt>
          <dd className="tabular-nums">{log.accuracyM === null ? 'Unknown' : `±${Math.round(log.accuracyM)} m`}</dd>
        </div>
        {log.notes && (
          <div className="col-span-2">
            <dt>Note</dt>
            <dd className="whitespace-pre-wrap">{log.notes}</dd>
          </div>
        )}
        <div className="col-span-2">
          <dt>Status</dt>
          <dd>{log.pending ? (log.uploadError ? `On this phone — ${log.uploadError}` : 'On this phone, waiting to upload') : 'Uploaded'}</dd>
        </div>
      </dl>

      {error && <p className="field-error">{error}</p>}
      {confirming ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="danger"
            size="lg"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await onDelete(log);
              setBusy(false);
              if (ok) onClose();
              else setError('Couldn’t delete it. Try again with signal.');
            }}
          >
            {busy ? 'Deleting…' : 'Delete this log'}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setConfirming(true)} disabled={!canDelete} className="w-full">
          <Trash2 className="h-5 w-5" aria-hidden /> {canDelete ? 'Delete…' : 'Delete needs signal'}
        </Button>
      )}
    </div>
  );
}
