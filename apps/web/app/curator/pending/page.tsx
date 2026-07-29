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
import { AlertCircle, Calendar, CheckCircle, Clock, Eye, Globe, RefreshCw, User, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

interface PendingWord {
  id: string;
  type: 'word';
  word: string;
  word_type?: string | null;
  language_id?: string | null;
  created_at?: string | null;
  languages?: { id: string; name: string; code: string } | null;
  profiles?: { display_name?: string | null; username?: string | null } | null;
  definitions?: Array<{ definition: string }>;
  translations?: Array<{ translation: string }>;
}

interface PendingResponse {
  items?: PendingWord[];
  pagination?: { total?: number };
  error?: string;
}

function firstDefinition(word: PendingWord) {
  return word.definitions?.[0]?.definition || 'No definition supplied';
}

function firstTranslation(word: PendingWord) {
  return word.translations?.[0]?.translation || 'No translation supplied';
}

function submitterName(word: PendingWord) {
  return word.profiles?.display_name || word.profiles?.username || 'Contributor not named';
}

export default function PendingReviewsPage() {
  const [pendingWords, setPendingWords] = useState<PendingWord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<PendingWord | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const fetchPendingWords = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/v2/curator/pending?type=words&limit=100');
      const data = (await response.json().catch(() => ({}))) as PendingResponse;
      if (!response.ok) throw new Error(data.error || 'Could not load the word review queue.');
      const items = Array.isArray(data.items) ? data.items.filter((item) => item.type === 'word') : [];
      setPendingWords(items);
      setTotal(data.pagination?.total ?? items.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load the word review queue.';
      setPendingWords([]);
      setTotal(0);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPendingWords();
  }, [fetchPendingWords]);

  function closeDialog() {
    setReviewDialogOpen(false);
    setSelectedWord(null);
    setReviewAction(null);
    setReviewNotes('');
  }

  function openReviewDialog(word: PendingWord, action: 'approve' | 'reject' | null) {
    setSelectedWord(word);
    setReviewAction(action);
    setReviewNotes('');
    setReviewDialogOpen(true);
  }

  async function handleReview() {
    if (!selectedWord || !reviewAction || submitting) return;
    if (reviewAction === 'reject' && !reviewNotes.trim()) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/v2/curator/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: selectedWord.id,
          itemType: 'word',
          action: reviewAction,
          reason: reviewAction === 'reject' ? reviewNotes.trim() : undefined,
          notes: reviewNotes.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save this review.');
      toast({
        title: reviewAction === 'approve' ? 'Entry marked as reviewed' : 'Entry rejected',
        description: reviewAction === 'approve'
          ? 'The internal Mob Translate review state was recorded.'
          : 'The reason was recorded and the entry was removed from the pending queue.',
      });
      closeDialog();
      await fetchPendingWords();
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
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Word review queue</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Review source-backed entries carefully. An approval records an internal Mob Translate review; it never implies community endorsement by itself.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit px-4 py-2 text-base">
          <Clock className="mr-2 h-4 w-4" />
          {total} pending
        </Badge>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading word reviews">
          {[1, 2, 3].map((item) => (
            <div key={item} className="space-y-3 rounded-xl border border-border bg-card p-5" aria-hidden="true">
              <div className="h-7 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-16 w-full animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <Card className="border-error/30">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <AlertCircle className="mb-4 h-11 w-11 text-error" />
            <p className="text-lg font-semibold">The review queue did not load</p>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{loadError}</p>
            <Button className="mt-5" variant="outline" onClick={() => void fetchPendingWords()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </CardContent>
        </Card>
      ) : pendingWords.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <div className="mb-4 rounded-full bg-success/10 p-3"><CheckCircle className="h-8 w-8 text-success" /></div>
            <p className="text-lg font-semibold">No word entries are waiting</p>
            <p className="mt-2 text-sm text-muted-foreground">This is a real empty queue—no sample entries are substituted.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pendingWords.map((word) => (
            <Card key={word.id} className="transition-shadow hover:shadow-lg">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-2xl">{word.word}</CardTitle>
                    <CardDescription className="mt-1">{firstTranslation(word)}</CardDescription>
                  </div>
                  {word.word_type ? <Badge variant="secondary">{word.word_type}</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="min-h-10 text-sm leading-relaxed text-muted-foreground">{firstDefinition(word)}</p>
                <div className="space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                  <p className="flex items-center gap-2"><Globe className="h-3.5 w-3.5" />{word.languages?.name || 'Language not named'}</p>
                  <p className="flex items-center gap-2"><User className="h-3.5 w-3.5" />{submitterName(word)}</p>
                  {word.created_at ? <p className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" />{new Date(word.created_at).toLocaleDateString()}</p> : null}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button size="sm" variant="outline" onClick={() => openReviewDialog(word, null)}>
                    <Eye className="mr-1.5 h-4 w-4" /> Details
                  </Button>
                  <Button size="sm" variant="outline" className="text-error" onClick={() => openReviewDialog(word, 'reject')}>
                    <XCircle className="mr-1.5 h-4 w-4" /> Return
                  </Button>
                  <Button size="sm" onClick={() => openReviewDialog(word, 'approve')}>
                    <CheckCircle className="mr-1.5 h-4 w-4" /> Review
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={reviewDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setReviewDialogOpen(true); }}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup>
            <DialogTitle>{reviewAction === 'approve' ? 'Mark entry as reviewed' : reviewAction === 'reject' ? 'Return entry with a reason' : 'Review entry'}</DialogTitle>
            <DialogDescription>
              {selectedWord ? `${selectedWord.word} · ${selectedWord.languages?.name || 'Language not named'}` : 'Dictionary entry'}
            </DialogDescription>

            {selectedWord ? (
              <div className="my-5 space-y-4">
                <div className="grid gap-4 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
                  <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Word</p><p className="mt-1 font-semibold">{selectedWord.word}</p></div>
                  <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Translation</p><p className="mt-1">{firstTranslation(selectedWord)}</p></div>
                  <div className="sm:col-span-2"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Definition</p><p className="mt-1 text-sm leading-relaxed">{firstDefinition(selectedWord)}</p></div>
                  <div className="sm:col-span-2"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Submitted by</p><p className="mt-1 text-sm">{submitterName(selectedWord)}</p></div>
                </div>

                {reviewAction ? (
                  <div>
                    <label htmlFor="word-review-notes" className="text-sm font-medium">
                      {reviewAction === 'reject' ? 'Reason for returning this entry' : 'Internal review note (optional)'}
                    </label>
                    <Textarea
                      id="word-review-notes"
                      className="mt-2"
                      value={reviewNotes}
                      onChange={(event) => setReviewNotes(event.target.value)}
                      placeholder={reviewAction === 'reject' ? 'Explain what needs evidence or correction…' : 'Record the source or check you completed…'}
                      rows={4}
                    />
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {reviewAction === 'approve'
                        ? 'This records an internal review state only. It does not certify the entry on behalf of a community or organisation.'
                        : 'The entry leaves the pending queue and the reason is kept with its review history.'}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              {!reviewAction && selectedWord ? (
                <>
                  <Button variant="outline" className="text-error" onClick={() => setReviewAction('reject')}>Return entry</Button>
                  <Button onClick={() => setReviewAction('approve')}>Mark as reviewed</Button>
                </>
              ) : reviewAction ? (
                <Button
                  variant={reviewAction === 'reject' ? 'error' : 'primary'}
                  disabled={submitting || (reviewAction === 'reject' && !reviewNotes.trim())}
                  onClick={() => void handleReview()}
                >
                  {submitting ? 'Saving…' : reviewAction === 'approve' ? 'Mark as reviewed' : 'Return with reason'}
                </Button>
              ) : null}
            </div>
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
