'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@mobtranslate/ui';
import { useToast } from '@/hooks/useToast';
import { AlertCircle, ArrowLeft, RefreshCw, RotateCcw, ShieldCheck, UserPlus, UserRoundCog, UserX } from 'lucide-react';

interface Language { id: string; name: string; code: string }
interface Curator {
  id: string;
  user_id?: string | null;
  email?: string | null;
  display_name?: string | null;
  username?: string | null;
  assigned_at?: string | null;
  is_active?: boolean | null;
}

function personName(curator: Curator) {
  return curator.display_name || curator.username || curator.email || 'Account not named';
}

export default function LanguageSettingsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [language, setLanguage] = useState<Language | null>(null);
  const [curators, setCurators] = useState<Curator[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Curator | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [languageResponse, curatorResponse] = await Promise.all([
        fetch('/api/v2/admin/languages'),
        fetch(`/api/v2/admin/languages/${params.id}/curators`),
      ]);
      const languageData = await languageResponse.json().catch(() => ({}));
      const curatorData = await curatorResponse.json().catch(() => ({}));
      if (!languageResponse.ok) throw new Error(languageData.error || 'Could not load the language.');
      if (!curatorResponse.ok) throw new Error(curatorData.error || 'Could not load curator access.');
      const selectedLanguage = Array.isArray(languageData)
        ? languageData.find((item: Language) => item.id === params.id)
        : null;
      if (!selectedLanguage) throw new Error('Language not found.');
      setLanguage(selectedLanguage);
      setCurators(Array.isArray(curatorData) ? curatorData : []);
    } catch (error) {
      setLanguage(null);
      setCurators([]);
      setLoadError(error instanceof Error ? error.message : 'Could not load language access.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const assign = async (curatorEmail = email) => {
    const normalizedEmail = curatorEmail.trim();
    if (!normalizedEmail || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v2/admin/languages/${params.id}/curators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not grant curator access.');
      toast({ title: 'Curator access active', description: 'The language-scoped role and audit entry were saved.' });
      setEmail('');
      await load();
    } catch (error) {
      toast({ title: 'Access not changed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v2/admin/languages/${params.id}/curators?assignmentId=${removing.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not remove curator access.');
      toast({ title: 'Curator access removed', description: 'The assignment was deactivated and kept in the audit history.' });
      setRemoving(null);
      await load();
    } catch (error) {
      toast({ title: 'Access not changed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" aria-label="Back to languages" onClick={() => router.push('/admin/languages')}><ArrowLeft className="h-4 w-4" /></Button>
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Language governance</p><h1 className="mt-2 text-3xl font-bold tracking-tight">{language?.name || 'Curator access'}</h1><p className="mt-2 max-w-2xl text-muted-foreground">Manage the people who can review this language’s contributions. Access is scoped to this language and every change is audited.</p></div>
      </div>

      {loading ? <div className="space-y-3" aria-label="Loading curator access">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-muted" aria-hidden="true" />)}</div> : loadError ? (
        <Card><CardContent><div className="flex flex-col items-center py-12 text-center"><AlertCircle className="mb-4 h-11 w-11 text-error" /><p className="text-lg font-semibold">Curator access did not load</p><p className="mt-2 text-sm text-muted-foreground">{loadError}</p><Button className="mt-5" variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div></CardContent></Card>
      ) : language ? <>
        <Card className="border-primary/15 bg-primary/[0.03]"><CardContent className="flex gap-3 py-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-medium">Role access is not community authority</p><p className="mt-1 text-sm text-muted-foreground">A Mob Translate curator can operate the review tools for {language.name}. The role does not claim cultural authority or endorsement on behalf of a community or organisation.</p></div></CardContent></Card>

        <Card>
          <CardHeader><CardTitle>Curator access</CardTitle><CardDescription>{curators.filter((curator) => curator.is_active).length} active assignment{curators.filter((curator) => curator.is_active).length === 1 ? '' : 's'} for {language.name}</CardDescription></CardHeader>
          <CardContent>
            {curators.length === 0 ? <div className="py-10 text-center"><UserRoundCog className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">No curator roles assigned</p><p className="mt-1 text-sm text-muted-foreground">Add an existing Mob Translate account below.</p></div> : <>
              <div className="space-y-3 sm:hidden">{curators.map((curator) => (
                <article key={curator.id} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{personName(curator)}</p>{curator.email && curator.email !== personName(curator) ? <p className="mt-1 break-all text-xs text-muted-foreground">{curator.email}</p> : null}</div><Badge variant={curator.is_active ? 'primary' : 'secondary'}>{curator.is_active ? 'Active' : 'Inactive'}</Badge></div><p className="mt-3 text-xs text-muted-foreground">Assigned {curator.assigned_at ? new Date(curator.assigned_at).toLocaleDateString() : 'date not recorded'}</p><div className="mt-4">{curator.is_active ? <Button size="sm" variant="outline" className="w-full text-error" onClick={() => setRemoving(curator)}><UserX className="mr-2 h-4 w-4" />Remove access</Button> : <Button size="sm" variant="outline" className="w-full" disabled={busy || !curator.email} onClick={() => void assign(curator.email || '')}><RotateCcw className="mr-2 h-4 w-4" />Restore access</Button>}</div></article>
              ))}</div>
              <div className="hidden overflow-x-auto sm:block"><Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Status</TableHead><TableHead>Assigned</TableHead><TableHead className="text-right">Access</TableHead></TableRow></TableHeader><TableBody>{curators.map((curator) => (
                <TableRow key={curator.id}><TableCell><p className="font-medium">{personName(curator)}</p>{curator.email && curator.email !== personName(curator) ? <p className="mt-1 text-xs text-muted-foreground">{curator.email}</p> : null}</TableCell><TableCell><Badge variant={curator.is_active ? 'primary' : 'secondary'}>{curator.is_active ? 'Active' : 'Inactive'}</Badge></TableCell><TableCell>{curator.assigned_at ? new Date(curator.assigned_at).toLocaleDateString() : 'Not recorded'}</TableCell><TableCell className="text-right">{curator.is_active ? <Button size="sm" variant="outline" className="text-error" onClick={() => setRemoving(curator)}><UserX className="mr-2 h-4 w-4" />Remove</Button> : <Button size="sm" variant="outline" disabled={busy || !curator.email} onClick={() => void assign(curator.email || '')}><RotateCcw className="mr-2 h-4 w-4" />Restore</Button>}</TableCell></TableRow>
              ))}</TableBody></Table></div>
            </>}
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle>Grant curator access</CardTitle><CardDescription>The person must already have a Mob Translate account. Their email is used only to locate that account.</CardDescription></CardHeader><CardContent><div className="flex flex-col gap-3 sm:flex-row"><div className="flex-1"><label htmlFor="curator-email" className="sr-only">Account email</label><Input id="curator-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Account email address" onKeyDown={(event) => { if (event.key === 'Enter') void assign(); }} /></div><Button disabled={busy || !email.trim()} onClick={() => void assign()}><UserPlus className="mr-2 h-4 w-4" />{busy ? 'Saving…' : 'Grant access'}</Button></div><p className="mt-3 text-xs text-muted-foreground">Only language managers can view this account list. Adding access does not send an email invitation.</p></CardContent></Card>
      </> : null}

      <Dialog open={Boolean(removing)} onOpenChange={(open) => { if (!open && !busy) setRemoving(null); }}><DialogPortal><DialogBackdrop /><DialogPopup><DialogTitle>Remove curator access?</DialogTitle><DialogDescription>{removing ? `${personName(removing)} will no longer be able to review contributions for ${language?.name || 'this language'}. The assignment and audit history are retained.` : 'The assignment will be deactivated.'}</DialogDescription><div className="mt-6 flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>Cancel</Button><Button variant="error" disabled={busy} onClick={() => void remove()}>{busy ? 'Saving…' : 'Remove access'}</Button></div></DialogPopup></DialogPortal></Dialog>
    </div>
  );
}
