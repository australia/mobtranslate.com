'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2, Copy, Check, Loader2, Ban, RotateCcw, Plus } from 'lucide-react';
import { Button, Input, cn } from '@mobtranslate/ui';
import { Modal } from './Modal';
import { createInvite, fetchInvites, setInviteStatus, type SpeakerInvite } from './api';

export function InviteSpeakers({ languageId }: { languageId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="md" leftIcon={<Link2 className="h-4 w-4" />} onClick={() => setOpen(true)}>
        Invite speakers
      </Button>
      <InviteModal open={open} languageId={languageId} onClose={() => setOpen(false)} />
    </>
  );
}

function InviteModal({ open, languageId, onClose }: { open: boolean; languageId: string; onClose: () => void }) {
  const [invites, setInvites] = useState<SpeakerInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInvites(await fetchInvites(languageId));
    } catch {
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, [languageId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const inv = await createInvite({ languageId, speakerName: name.trim() });
      setName('');
      setInvites((list) => [inv, ...list]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (inv: SpeakerInvite) => {
    const next = inv.status === 'active' ? 'revoked' : 'active';
    const updated = await setInviteStatus(inv.id, next);
    setInvites((list) => list.map((i) => (i.id === inv.id ? { ...i, status: updated.status } : i)));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite speakers"
      description="Create a private link an elder can open on any phone or computer — no login needed."
      className="max-w-xl"
    >
      <div className="flex gap-2">
        <Input size="lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="Speaker's name (e.g. Aunty Mary)" onKeyDown={(e) => e.key === 'Enter' && create()} />
        <Button size="lg" leftIcon={<Plus className="h-5 w-5" />} onClick={create} loading={creating} loadingText="Creating…" disabled={!name.trim()}>
          Create link
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-[var(--color-destructive)]">{error}</p>}

      <div className="mt-5 space-y-2">
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && invites.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No invite links yet.</p>}
        {invites.map((inv) => (
          <InviteRow key={inv.id} inv={inv} onToggle={() => toggle(inv)} />
        ))}
      </div>
    </Modal>
  );
}

function InviteRow({ inv, onToggle }: { inv: SpeakerInvite; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);
  const revoked = inv.status === 'revoked';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inv.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  };
  return (
    <div className={cn('rounded-xl border px-3 py-3', revoked ? 'border-border bg-muted/40 opacity-70' : 'border-border bg-card')}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-foreground">{inv.speaker?.name || inv.label || 'Speaker'}</p>
          <p className="truncate text-xs text-muted-foreground">
            {revoked ? 'Revoked' : inv.last_used_at ? `Last used ${new Date(inv.last_used_at).toLocaleDateString()}` : 'Not used yet'}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={revoked ? 'Re-activate' : 'Revoke'}
          className="flex-shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {revoked ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
        </button>
      </div>
      {!revoked && (
        <div className="mt-2 flex items-center gap-2">
          <input readOnly value={inv.url} className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-muted-foreground" onFocus={(e) => e.target.select()} />
          <Button size="sm" variant={copied ? 'secondary' : 'outline'} leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
    </div>
  );
}
