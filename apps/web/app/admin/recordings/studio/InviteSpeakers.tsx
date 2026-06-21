'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2, Copy, Check, Loader2, Ban, RotateCcw, Plus, User, Search } from 'lucide-react';
import { Button, Input, cn } from '@mobtranslate/ui';
import { Modal } from './Modal';
import { createInvite, fetchInvites, searchUsers, setInviteStatus, type SpeakerInvite, type UserSearchResult } from './api';

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

type Mode = 'anonymous' | 'registered';

function InviteModal({ open, languageId, onClose }: { open: boolean; languageId: string; onClose: () => void }) {
  const [invites, setInvites] = useState<SpeakerInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('anonymous');
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

  const createAnon = async () => {
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

  const createRegistered = async (u: UserSearchResult) => {
    setCreating(true);
    setError(null);
    try {
      const inv = await createInvite({ languageId, invitedUserId: u.id });
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
      description="Invite a registered user, or create a private link for someone without an account — no login needed for the link."
      className="max-w-xl"
    >
      <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1">
        <ModeTab active={mode === 'anonymous'} onClick={() => setMode('anonymous')} icon={Link2} label="Private link" />
        <ModeTab active={mode === 'registered'} onClick={() => setMode('registered')} icon={User} label="Registered user" />
      </div>

      {mode === 'anonymous' ? (
        <div className="flex gap-2">
          <Input size="lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="Speaker's name (e.g. Aunty Mary)" onKeyDown={(e) => e.key === 'Enter' && createAnon()} />
          <Button size="lg" leftIcon={<Plus className="h-5 w-5" />} onClick={createAnon} loading={creating} loadingText="Creating…" disabled={!name.trim()}>
            Create link
          </Button>
        </div>
      ) : (
        <UserPicker disabled={creating} onPick={createRegistered} />
      )}
      {error && <p className="mt-2 text-sm text-[var(--color-destructive)]">{error}</p>}

      <div className="mt-5 space-y-2">
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && invites.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No invites yet.</p>}
        {invites.map((inv) => (
          <InviteRow key={inv.id} inv={inv} onToggle={() => toggle(inv)} />
        ))}
      </div>
    </Modal>
  );
}

function ModeTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Link2; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function UserPicker({ onPick, disabled }: { onPick: (u: UserSearchResult) => void; disabled: boolean }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchUsers(q)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input size="lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users by name or email…" className="pl-9" disabled={disabled} />
      </div>
      {q.trim().length >= 2 && (
        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
          {searching && <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>}
          {!searching && results.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No users found.</p>}
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(u)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-base font-medium text-foreground">{u.display_name || u.username || u.email}</span>
                {u.email && <span className="block truncate text-xs text-muted-foreground">{u.email}</span>}
              </span>
              <Plus className="h-4 w-4 flex-shrink-0 text-[var(--color-primary)]" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InviteRow({ inv, onToggle }: { inv: SpeakerInvite; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);
  const revoked = inv.status === 'revoked';
  const registered = inv.mode === 'registered';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inv.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  };
  const name = inv.speaker?.name || inv.invited_user?.display_name || inv.invited_user?.email || inv.label || 'Speaker';
  return (
    <div className={cn('rounded-xl border px-3 py-3', revoked ? 'border-border bg-muted/40 opacity-70' : 'border-border bg-card')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full', registered ? 'bg-[var(--color-secondary)]/15 text-[var(--color-secondary)]' : 'bg-muted text-muted-foreground')}>
            {registered ? <User className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {revoked ? 'Revoked' : registered ? 'Registered — appears in their account' : inv.last_used_at ? `Last used ${new Date(inv.last_used_at).toLocaleDateString()}` : 'Link not used yet'}
            </p>
          </div>
        </div>
        <button type="button" onClick={onToggle} aria-label={revoked ? 'Re-activate' : 'Revoke'} className="flex-shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
          {revoked ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
        </button>
      </div>
      {!revoked && !registered && (
        <div className="mt-2 flex items-center gap-2">
          <input readOnly value={inv.url} className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-muted-foreground" onFocus={(e) => e.target.select()} />
          <Button size="sm" variant={copied ? 'secondary' : 'outline'} leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
      {!revoked && registered && (
        <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          They’ll find this under <span className="font-medium text-foreground">Record your language</span> when signed in (/speak).
        </p>
      )}
    </div>
  );
}
