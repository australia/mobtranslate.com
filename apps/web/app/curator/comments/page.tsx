'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Avatar,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@mobtranslate/ui';
import { useToast } from '@/hooks/useToast';
import { AlertCircle, Calendar, Flag, Globe, MessageSquare, RefreshCw, RotateCcw, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';

type CommentFilter = 'flagged' | 'all' | 'deleted';

interface ModerationComment {
  id: string;
  comment_text: string;
  comment_type?: string | null;
  created_at: string;
  is_deleted?: boolean | null;
  upvotes?: number | null;
  downvotes?: number | null;
  profiles?: { display_name?: string | null; username?: string | null } | null;
  words?: {
    word?: string | null;
    languages?: { name?: string | null } | null;
  } | null;
  engagement?: { flaggedForReview?: boolean; totalVotes?: number } | null;
}

interface CommentsResponse {
  comments?: ModerationComment[];
  stats?: { totalFlagged?: number; totalDeleted?: number; currentlyViewing?: number };
  error?: string;
}

function authorName(comment: ModerationComment) {
  return comment.profiles?.display_name || comment.profiles?.username || 'Community member';
}

export default function CommentsPage() {
  const [comments, setComments] = useState<ModerationComment[]>([]);
  const [stats, setStats] = useState({ totalFlagged: 0, totalDeleted: 0, currentlyViewing: 0 });
  const [filter, setFilter] = useState<CommentFilter>('flagged');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ModerationComment | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/v2/curator/comments/moderate?status=${filter}&limit=100`);
      const data = (await response.json().catch(() => ({}))) as CommentsResponse;
      if (!response.ok) throw new Error(data.error || 'Could not load community comments.');
      setComments(Array.isArray(data.comments) ? data.comments : []);
      setStats({
        totalFlagged: data.stats?.totalFlagged ?? 0,
        totalDeleted: data.stats?.totalDeleted ?? 0,
        currentlyViewing: data.stats?.currentlyViewing ?? 0,
      });
    } catch (error) {
      setComments([]);
      setStats({ totalFlagged: 0, totalDeleted: 0, currentlyViewing: 0 });
      setLoadError(error instanceof Error ? error.message : 'Could not load community comments.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  const moderate = async () => {
    if (!selected) return;
    const action = selected.is_deleted ? 'restore' : 'delete';
    if (action === 'delete' && !reason.trim()) return;
    setBusy(true);
    try {
      const response = await fetch('/api/v2/curator/comments/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: selected.id, action, reason: reason.trim() || undefined }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || `Could not ${action} the comment.`);
      toast({ title: action === 'delete' ? 'Comment removed' : 'Comment restored', description: 'The moderation action was recorded in the audit trail.' });
      setSelected(null);
      setReason('');
      await fetchComments();
    } catch (error) {
      toast({ title: 'Moderation failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Curator workspace</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Community comments</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Review comments surfaced by community reactions. A flag asks for human attention; it is not proof that a contribution is wrong.</p>
        </div>
        <Badge variant={stats.totalFlagged > 0 ? 'error' : 'secondary'} className="w-fit px-3 py-1.5"><Flag className="mr-2 h-4 w-4" />{stats.totalFlagged} awaiting review</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Awaiting review" value={stats.totalFlagged} icon={Flag} />
        <Metric label="Removed" value={stats.totalDeleted} icon={Trash2} />
        <Metric label="In this view" value={stats.currentlyViewing} icon={MessageSquare} />
      </div>

      <Card className="border-primary/15 bg-primary/[0.03]"><CardContent className="flex gap-3 py-4"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-medium">Moderate for safety, not disagreement</p><p className="mt-1 text-sm text-muted-foreground">Language knowledge can vary by family, place, dialect, and authority. Keep a comment visible unless there is a clear moderation reason to remove it.</p></div></CardContent></Card>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as CommentFilter)}>
        <TabsList>
          <TabsTrigger value="flagged"><Flag className="mr-2 h-4 w-4" />Awaiting review</TabsTrigger>
          <TabsTrigger value="all"><MessageSquare className="mr-2 h-4 w-4" />Visible</TabsTrigger>
          <TabsTrigger value="deleted"><Trash2 className="mr-2 h-4 w-4" />Removed</TabsTrigger>
        </TabsList>
        <TabsContent value={filter} className="mt-6 space-y-4">
          {loading ? (
            <div className="space-y-3" aria-label="Loading comments">{[1, 2, 3].map((item) => <div key={item} className="h-44 animate-pulse rounded-xl bg-muted" aria-hidden="true" />)}</div>
          ) : loadError ? (
            <Card><CardContent><div className="flex flex-col items-center py-10 text-center"><AlertCircle className="mb-4 h-11 w-11 text-error" /><p className="text-lg font-semibold">Comments did not load</p><p className="mt-2 max-w-xl text-sm text-muted-foreground">{loadError}</p><Button className="mt-5" variant="outline" onClick={() => void fetchComments()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div></CardContent></Card>
          ) : comments.length === 0 ? (
            <Card><CardContent><div className="py-12 text-center"><MessageSquare className="mx-auto mb-4 h-11 w-11 text-muted-foreground" /><p className="text-lg font-medium">{filter === 'flagged' ? 'Review queue clear' : filter === 'deleted' ? 'No removed comments' : 'No visible comments'}</p><p className="mt-1 text-sm text-muted-foreground">No example comments are substituted for real community activity.</p></div></CardContent></Card>
          ) : comments.map((comment) => (
            <Card key={comment.id} className={comment.engagement?.flaggedForReview && !comment.is_deleted ? 'border-error/25' : ''}>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10" alt={authorName(comment)} fallback={authorName(comment)[0]?.toUpperCase() || '?'} />
                    <div><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-base">{authorName(comment)}</CardTitle>{comment.comment_type ? <Badge variant="secondary">{comment.comment_type}</Badge> : null}{comment.is_deleted ? <Badge variant="error">Removed</Badge> : null}</div><CardDescription className="mt-1 flex flex-wrap gap-x-3 gap-y-1"><span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{new Date(comment.created_at).toLocaleString()}</span><span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{comment.words?.languages?.name || 'Language not named'}</span></CardDescription></div>
                  </div>
                  <div className="flex gap-3 text-sm"><span className="flex items-center gap-1 text-success"><ThumbsUp className="h-4 w-4" />{comment.upvotes ?? 0}</span><span className="flex items-center gap-1 text-error"><ThumbsDown className="h-4 w-4" />{comment.downvotes ?? 0}</span></div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-6">{comment.comment_text}</p>
                <p className="text-xs text-muted-foreground">On “{comment.words?.word || 'word no longer available'}”</p>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  {comment.engagement?.flaggedForReview && !comment.is_deleted ? <p className="flex items-center gap-2 text-xs text-error"><Flag className="h-3.5 w-3.5" />Surfaced after at least three downvotes</p> : <span />}
                  <Button size="sm" variant="outline" className={comment.is_deleted ? '' : 'text-error hover:text-error/80'} onClick={() => { setSelected(comment); setReason(''); }}>{comment.is_deleted ? <RotateCcw className="mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />}{comment.is_deleted ? 'Restore' : 'Remove'}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !busy) { setSelected(null); setReason(''); } }}>
        <DialogPortal><DialogBackdrop /><DialogPopup>
          <DialogTitle>{selected?.is_deleted ? 'Restore this comment?' : 'Remove this comment?'}</DialogTitle>
          <DialogDescription>{selected?.is_deleted ? 'The comment will become visible to community members again.' : 'Removal hides the comment and records who made the decision. The contribution itself is not altered.'}</DialogDescription>
          {!selected?.is_deleted ? <div className="mt-5 space-y-2"><label htmlFor="moderation-reason" className="text-sm font-medium">Reason for removal</label><Textarea id="moderation-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record a clear, respectful moderation reason" rows={4} /></div> : null}
          <div className="mt-6 flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => { setSelected(null); setReason(''); }}>Cancel</Button><Button variant={selected?.is_deleted ? 'primary' : 'error'} disabled={busy || (!selected?.is_deleted && !reason.trim())} onClick={() => void moderate()}>{busy ? 'Saving…' : selected?.is_deleted ? 'Restore comment' : 'Remove comment'}</Button></div>
        </DialogPopup></DialogPortal>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Flag }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{label}</CardTitle><Icon className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{value}</div><p className="text-xs text-muted-foreground">Real moderation records</p></CardContent></Card>;
}
