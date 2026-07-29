'use client';

import { useCallback, useEffect, useState } from 'react';
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
  Textarea,
} from '@mobtranslate/ui';
import { AlertCircle, ArrowRight, Calendar, CheckCircle, FilePenLine, Globe, RefreshCw, User, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

interface PendingImprovement {
  id: string;
  type: 'improvement';
  improvement_type: string;
  field_name?: string | null;
  current_value?: unknown;
  suggested_value?: unknown;
  improvement_reason?: string | null;
  created_at?: string | null;
  words?: {
    id: string;
    word: string;
    languages?: { id: string; name: string; code: string } | null;
  } | null;
  profiles?: { display_name?: string | null; username?: string | null } | null;
}

interface PendingResponse {
  items?: PendingImprovement[];
  pagination?: { total?: number };
  error?: string;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function formatValue(value: unknown): string {
  if (value == null || value === '') return 'Not recorded';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  const object = asObject(value);
  if (!object) return 'Structured value';
  if (typeof object.text === 'string') return object.text;
  if (typeof object.latitude === 'number' && typeof object.longitude === 'number') {
    return `${object.latitude.toFixed(5)}, ${object.longitude.toFixed(5)}`;
  }
  if (typeof object.suggestedTranslation === 'string') return object.suggestedTranslation;
  return Object.entries(object)
    .filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item))
    .map(([key, item]) => `${key.replaceAll(/[_-]/g, ' ')}: ${String(item)}`)
    .join(' · ') || 'Structured value';
}

function targetLabel(item: PendingImprovement): string {
  if (item.words?.word) return item.words.word;
  const value = asObject(item.suggested_value);
  return typeof value?.sourceText === 'string' ? `“${value.sourceText}”` : 'Standalone suggestion';
}

function languageLabel(item: PendingImprovement): string {
  if (item.words?.languages?.name) return item.words.languages.name;
  const value = asObject(item.suggested_value);
  return typeof value?.languageName === 'string' ? value.languageName : typeof value?.languageCode === 'string' ? value.languageCode : 'Language not named';
}

function submitterLabel(item: PendingImprovement): string {
  return item.profiles?.display_name || item.profiles?.username || 'Contributor not named';
}

function kindLabel(item: PendingImprovement): string {
  return (item.field_name || item.improvement_type || 'suggestion').replaceAll(/[_-]/g, ' ');
}

export default function ImprovementsPage() {
  const [improvements, setImprovements] = useState<PendingImprovement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PendingImprovement | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const fetchImprovements = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/v2/curator/pending?type=improvements&limit=100');
      const data = (await response.json().catch(() => ({}))) as PendingResponse;
      if (!response.ok) throw new Error(data.error || 'Could not load improvement suggestions.');
      const items = Array.isArray(data.items) ? data.items.filter((item) => item.type === 'improvement') : [];
      setImprovements(items);
      setTotal(data.pagination?.total ?? items.length);
    } catch (error) {
      setImprovements([]);
      setTotal(0);
      setLoadError(error instanceof Error ? error.message : 'Could not load improvement suggestions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchImprovements();
  }, [fetchImprovements]);

  function closeReview() {
    setSelected(null);
    setReviewAction(null);
    setReviewNotes('');
  }

  async function submitReview() {
    if (!selected || !reviewAction || submitting) return;
    if (reviewAction === 'reject' && !reviewNotes.trim()) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/v2/curator/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: selected.id,
          itemType: 'improvement',
          action: reviewAction,
          reason: reviewAction === 'reject' ? reviewNotes.trim() : undefined,
          notes: reviewNotes.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save this review.');
      toast({
        title: reviewAction === 'approve' ? 'Suggestion approved' : 'Suggestion rejected',
        description: reviewAction === 'approve' ? 'The review action and audit history were saved.' : 'The reason was saved with the suggestion.',
      });
      closeReview();
      await fetchImprovements();
    } catch (error) {
      toast({
        title: 'Review not saved',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Curator workspace</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Improvement queue</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Compare the published value with the submitted change. Nothing shown here is silently substituted with demonstration data.</p>
        </div>
        <Badge variant="secondary" className="w-fit px-4 py-2 text-base"><FilePenLine className="mr-2 h-4 w-4" />{total} pending</Badge>
      </div>

      {loading ? (
        <div className="space-y-4" aria-label="Loading improvements">
          {[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-xl border border-border bg-muted/60" aria-hidden="true" />)}
        </div>
      ) : loadError ? (
        <Card className="border-error/30"><CardContent className="flex flex-col items-center py-12 text-center">
          <AlertCircle className="mb-4 h-11 w-11 text-error" />
          <p className="text-lg font-semibold">The improvement queue did not load</p>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{loadError}</p>
          <Button className="mt-5" variant="outline" onClick={() => void fetchImprovements()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>
        </CardContent></Card>
      ) : improvements.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-14 text-center">
          <div className="mb-4 rounded-full bg-success/10 p-3"><CheckCircle className="h-8 w-8 text-success" /></div>
          <p className="text-lg font-semibold">No improvements are waiting</p>
          <p className="mt-2 text-sm text-muted-foreground">New correction and place-pin suggestions will appear here.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {improvements.map((item) => (
            <Card key={item.id} className="transition-shadow hover:shadow-lg">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">{targetLabel(item)}</CardTitle>
                    <CardDescription className="mt-1">{languageLabel(item)} · submitted by {submitterLabel(item)}</CardDescription>
                  </div>
                  <Badge variant="secondary" className="capitalize">{kindLabel(item)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                  <div className="rounded-lg border border-border bg-muted/30 p-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current</p><p className="mt-1 break-words text-sm">{formatValue(item.current_value)}</p></div>
                  <ArrowRight className="hidden h-5 w-5 text-muted-foreground md:block" />
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3"><p className="text-xs font-medium uppercase tracking-wide text-primary">Suggested</p><p className="mt-1 break-words text-sm font-medium">{formatValue(item.suggested_value)}</p></div>
                </div>
                {item.improvement_reason ? <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Contributor note:</span> {item.improvement_reason}</p> : null}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />{languageLabel(item)}</span>
                  <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{submitterLabel(item)}</span>
                  {item.created_at ? <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{new Date(item.created_at).toLocaleDateString()}</span> : null}
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" className="text-error" onClick={() => { setSelected(item); setReviewAction('reject'); }}><XCircle className="mr-1.5 h-4 w-4" />Reject</Button>
                    <Button size="sm" onClick={() => { setSelected(item); setReviewAction('approve'); }}><CheckCircle className="mr-1.5 h-4 w-4" />Approve</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) closeReview(); }}>
        <DialogPortal><DialogBackdrop /><DialogPopup>
          <DialogTitle>{reviewAction === 'approve' ? 'Approve this suggestion' : 'Reject this suggestion'}</DialogTitle>
          <DialogDescription>{selected ? `${targetLabel(selected)} · ${kindLabel(selected)}` : 'Improvement review'}</DialogDescription>
          {selected ? <div className="my-5 space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
              <p><span className="font-medium">Current:</span> {formatValue(selected.current_value)}</p>
              <p className="mt-2"><span className="font-medium">Suggested:</span> {formatValue(selected.suggested_value)}</p>
            </div>
            <div>
              <label htmlFor="improvement-review-note" className="text-sm font-medium">{reviewAction === 'reject' ? 'Reason (required)' : 'Review note (optional)'}</label>
              <Textarea id="improvement-review-note" className="mt-2" rows={4} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder={reviewAction === 'reject' ? 'Explain why this should not be applied…' : 'Record the source or verification performed…'} />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">Approval applies supported word, definition, translation and location changes and records a revision. Standalone phrase suggestions are marked reviewed but are not silently published as dictionary entries.</p>
          </div> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeReview}>Cancel</Button>
            <Button variant={reviewAction === 'reject' ? 'error' : 'primary'} disabled={submitting || (reviewAction === 'reject' && !reviewNotes.trim())} onClick={() => void submitReview()}>{submitting ? 'Saving…' : reviewAction === 'approve' ? 'Approve suggestion' : 'Reject with reason'}</Button>
          </div>
        </DialogPopup></DialogPortal>
      </Dialog>
    </div>
  );
}
