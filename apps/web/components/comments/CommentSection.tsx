'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from '@/lib/utils/date';
import { MessageCircle, ThumbsUp, ThumbsDown, Reply, MoreVertical, Flag } from 'lucide-react';
import { Button, Avatar, Textarea, Select, SelectPortal, SelectPositioner, SelectPopup, SelectItem, SelectTrigger, SelectValue, Menu, MenuTrigger, MenuPortal, MenuPositioner, MenuPopup, MenuItem } from '@mobtranslate/ui';
import { useToast } from '@/hooks/useToast';

interface Comment {
  id: string;
  comment_text: string;
  comment_type?: string;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
  upvotes: number;
  downvotes: number;
  user: {
    id: string;
    display_name: string;
    avatar_url?: string;
  };
  replies?: Comment[];
}

interface CommentSectionProps {
  wordId: string;
  isAuthenticated?: boolean;
}

export function CommentSection({ wordId, isAuthenticated = false }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [commentType, setCommentType] = useState<string>('general');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordId]);

  const fetchComments = async () => {
    try {
      const response = await fetch(`/api/v2/words/${wordId}/comments`);
      if (!response.ok) throw new Error('Failed to fetch comments');
      const data = await response.json();
      setComments(data);
    } catch (error) {
      console.error('Error fetching comments:', error);
      toast({
        title: 'Error',
        description: 'Failed to load comments',
        variant: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComment = async (parentId?: string) => {
    if (!commentText.trim() || !isAuthenticated) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/v2/words/${wordId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment_text: commentText,
          comment_type: parentId ? undefined : commentType,
          parent_id: parentId
        })
      });

      if (!response.ok) throw new Error('Failed to post comment');
      
      await fetchComments();
      setCommentText('');
      setReplyingTo(null);
      toast({
        title: 'Success',
        description: 'Comment posted successfully'
      });
    } catch (error) {
      console.error('Error posting comment:', error);
      toast({
        title: 'Error',
        description: 'Failed to post comment',
        variant: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (commentId: string, voteType: 'up' | 'down') => {
    if (!isAuthenticated) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in to vote on comments'
      });
      return;
    }

    try {
      const response = await fetch(`/api/v2/comments/${commentId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote_type: voteType })
      });

      if (!response.ok) throw new Error('Failed to vote');
      await fetchComments();
    } catch (error) {
      console.error('Error voting:', error);
      toast({
        title: 'Error',
        description: 'Failed to record vote',
        variant: 'error'
      });
    }
  };

  const CommentItem = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => (
    <div className={`${isReply ? 'ml-12' : ''} mb-4`}>
      <div className="flex gap-3">
        <Avatar src={comment.user.avatar_url} fallback={comment.user.display_name?.charAt(0)} className="h-8 w-8" />
        
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{comment.user.display_name}</span>
                {comment.comment_type && comment.comment_type !== 'general' && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">
                    {comment.comment_type}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.created_at))}
                </span>
                {comment.is_edited && (
                  <span className="text-xs text-muted-foreground">(edited)</span>
                )}
              </div>
            </div>
            
            <Menu>
              <MenuTrigger>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </MenuTrigger>
              <MenuPortal><MenuPositioner><MenuPopup>
                <MenuItem>
                  <Flag className="h-4 w-4 mr-2" />
                  Report
                </MenuItem>
              </MenuPopup></MenuPositioner></MenuPortal>
            </Menu>
          </div>
          
          <p className="text-sm mt-1 whitespace-pre-wrap">{comment.comment_text}</p>
          
          <div className="flex items-center gap-4 mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleVote(comment.id, 'up')}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
            >
              <ThumbsUp className="h-4 w-4" />
              <span>{comment.upvotes}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleVote(comment.id, 'down')}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive"
            >
              <ThumbsDown className="h-4 w-4" />
              <span>{comment.downvotes}</span>
            </Button>

            {!isReply && isAuthenticated && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReplyingTo(comment.id)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <Reply className="h-4 w-4" />
                Reply
              </Button>
            )}
          </div>
          
          {replyingTo === comment.id && (
            <div className="mt-3">
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a reply..."
                className="min-h-[80px]"
              />
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  onClick={() => handleSubmitComment(comment.id)}
                  disabled={!commentText.trim() || submitting}
                >
                  Reply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setReplyingTo(null);
                    setCommentText('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-4">
              {comment.replies.map((reply) => (
                <CommentItem key={reply.id} comment={reply} isReply />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return <div className="animate-pulse">Loading comments...</div>;
  }

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <MessageCircle className="h-5 w-5" />
        Comments ({comments.length})
      </h3>
      
      {isAuthenticated && (
        <div className="mb-6">
          <div className="flex gap-2 mb-2">
            <Select value={commentType} onValueChange={(v) => v != null && setCommentType(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectPortal><SelectPositioner><SelectPopup>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="pronunciation">Pronunciation</SelectItem>
                <SelectItem value="usage">Usage</SelectItem>
                <SelectItem value="cultural">Cultural</SelectItem>
                <SelectItem value="grammar">Grammar</SelectItem>
              </SelectPopup></SelectPositioner></SelectPortal>
            </Select>
          </div>
          
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            className="min-h-[100px]"
          />
          
          <Button
            className="mt-2"
            onClick={() => handleSubmitComment()}
            disabled={!commentText.trim() || submitting}
          >
            Post Comment
          </Button>
        </div>
      )}
      
      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No comments yet. Be the first to comment!
          </p>
        ) : (
          comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))
        )}
      </div>
    </div>
  );
}