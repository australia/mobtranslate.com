'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Camera, LogIn, MessageSquarePlus, FilePlus2 } from 'lucide-react';
import { Button, Input, Textarea } from '@mobtranslate/ui';
import { useAuth } from '@/contexts/AuthContext';
import { MAX_PHOTO_BYTES, type Contribution, type ContributionKind } from '@/lib/country/contributions';
import { ContributionCard } from './ContributionCard';

type Mode = 'page' | 'proposals';

const FIELD = 'mt-1 w-full';

// "Share what you know": the contributions already on this page, and the
// forms to add a photo, a note (words, uses, corrections) or, on the index,
// a whole new page. Everything posted shows straight away, attributed.
export function Community({
  language,
  target,
  mode = 'page',
  titles = {},
}: {
  language: string;
  target: string; // 'entry:<slug>' | 'place:<slug>' | 'new'
  mode?: Mode;
  titles?: Record<string, string>;
}) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [items, setItems] = useState<Contribution[] | null>(null);
  const [kind, setKind] = useState<ContributionKind>(mode === 'proposals' ? 'page' : 'note');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [words, setWords] = useState('');
  const [body, setBody] = useState('');
  const [where, setWhere] = useState('');
  const [when, setWhen] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/country/contributions?language=${language}&target=${encodeURIComponent(target)}`);
    if (res.ok) setItems(((await res.json()) as { contributions: Contribution[] }).contributions);
    else setItems([]);
  }, [language, target]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (user && !name) setName(user.name || user.email?.split('@')[0] || '');
  }, [user, name]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    if (photo && photo.size > MAX_PHOTO_BYTES) {
      setError('That photo is over 12 MB. Most phones can share a smaller copy.');
      return;
    }
    const form = new FormData();
    form.set('language', language);
    form.set('target', target);
    form.set('kind', kind);
    form.set('name', name);
    form.set('title', title);
    form.set('words', words);
    form.set('body', body);
    form.set('where', where);
    form.set('when', when);
    if (photo) form.set('photo', photo);
    setBusy(true);
    try {
      const res = await fetch('/api/country/contributions', { method: 'POST', body: form });
      const data = (await res.json()) as { contribution?: Contribution; error?: string; details?: Record<string, string[]> };
      if (!res.ok || !data.contribution) {
        const detail = data.details ? Object.values(data.details).flat()[0] : undefined;
        setError(detail || data.error || 'Something went wrong. Try again.');
        return;
      }
      setItems((current) => [data.contribution as Contribution, ...(current ?? [])]);
      setTitle('');
      setWords('');
      setBody('');
      setWhere('');
      setWhen('');
      setPhoto(null);
      setDone(true);
    } catch {
      setError('No connection. Your text is still in the form; try again when you have signal.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this from the page?')) return;
    const res = await fetch(`/api/country/contributions/${id}`, { method: 'DELETE' });
    if (res.ok) setItems((current) => (current ?? []).filter((item) => item.id !== id));
  }

  const proposals = mode === 'proposals';
  const kinds: { value: ContributionKind; label: string; icon: React.ReactNode }[] = proposals
    ? [{ value: 'page', label: 'Propose a new page', icon: <FilePlus2 className="h-4 w-4" /> }]
    : [
        { value: 'note', label: 'Words, uses, corrections', icon: <MessageSquarePlus className="h-4 w-4" /> },
        { value: 'photo', label: 'Add a photo', icon: <Camera className="h-4 w-4" /> },
      ];

  return (
    <section id="community" className="mt-10 scroll-mt-24">
      <h2 className="mb-1 border-b border-border pb-1 text-2xl font-semibold tracking-tight">
        {proposals ? 'Pages people want written' : 'From the community'}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {proposals
          ? 'Something on country with no page yet? Say what it is, what it is called and what it is for. It shows here straight away, with your name on it, until it becomes a full page.'
          : 'Know this one? Add the words you use for it, what it is for, how it is done, a correction, or a photo from country. It shows here straight away with your name on it. Please keep anything restricted or sacred off the site.'}
      </p>

      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing added yet. Be the first.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ContributionCard
              key={item.id}
              contribution={item}
              showTarget={proposals && item.target !== 'new'}
              targetTitle={titles[item.target]}
              onRemove={user && item.userId === user.id ? () => remove(item.id) : undefined}
            />
          ))}
        </div>
      )}

      {loading ? null : !user ? (
        <p className="mt-5 text-sm">
          <Link
            href={`/auth/signin?redirect=${encodeURIComponent(pathname)}`}
            className="inline-flex items-center gap-1.5 font-medium text-[var(--lang-accent)] hover:underline"
          >
            <LogIn className="h-4 w-4" /> Sign in to add to this page
          </Link>
          <span className="text-muted-foreground"> (free, so every contribution has a name on it)</span>
        </p>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3 rounded-lg border border-border bg-card p-4">
          {kinds.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="What are you adding?">
              {kinds.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setKind(option.value)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
                    kind === option.value
                      ? 'border-[var(--lang-accent)] bg-[var(--lang-accent)] text-[var(--color-background)]'
                      : 'border-border bg-card text-foreground hover:border-[var(--lang-accent)]'
                  }`}
                >
                  {option.icon} {option.label}
                </button>
              ))}
            </div>
          )}

          {kind === 'page' && (
            <label className="block text-sm">
              <span className="font-medium">What is it?</span>
              <Input className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Nonda plum, Red-tailed black cockatoo, Grinding stone" maxLength={120} required />
            </label>
          )}

          {kind !== 'photo' && (
            <label className="block text-sm">
              <span className="font-medium">Kuku Yalanji words for it</span>
              <span className="text-muted-foreground"> (optional; spell it how you say it)</span>
              <Input className={FIELD} value={words} onChange={(e) => setWords(e.target.value)} maxLength={500} />
            </label>
          )}

          {kind === 'photo' && (
            <label className="block text-sm">
              <span className="font-medium">Photo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm"
                required
              />
              <span className="text-xs text-muted-foreground">Location data is stripped from the file before it is stored.</span>
            </label>
          )}

          <label className="block text-sm">
            <span className="font-medium">
              {kind === 'photo' ? 'What does the photo show?' : kind === 'page' ? 'What it is, where it lives, what it is for, how it is used or made' : 'What you know'}
            </span>
            <Textarea
              className={FIELD}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={kind === 'photo' ? 2 : 6}
              maxLength={kind === 'photo' ? 500 : 8000}
              required={kind !== 'photo'}
              placeholder={
                kind === 'note'
                  ? 'Uses, how to find it, how to prepare it, when it is in season, what is wrong on this page…'
                  : undefined
              }
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Where</span>
              <span className="text-muted-foreground"> (optional, as much as you want to say)</span>
              <Input className={FIELD} value={where} onChange={(e) => setWhere(e.target.value)} placeholder="e.g. Mitchell River below the homestead" maxLength={200} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">When</span>
              <span className="text-muted-foreground"> (optional)</span>
              <Input className={FIELD} value={when} onChange={(e) => setWhen(e.target.value)} placeholder="e.g. October 2026, early dry" maxLength={80} />
            </label>
          </div>

          <label className="block text-sm">
            <span className="font-medium">Your name as it should appear</span>
            <Input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {done && <p className="text-sm text-success">Added. Thank you.</p>}
          <Button type="submit" loading={busy} loadingText="Adding…">
            {kind === 'photo' ? 'Add photo' : kind === 'page' ? 'Propose page' : 'Add to this page'}
          </Button>
        </form>
      )}
    </section>
  );
}
