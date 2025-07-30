'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from '@/lib/utils/date';
import { MessageCircle, ThumbsUp, ThumbsDown, Reply, MoreVertical, Flag } from 'lucide-react';
import { Button } from '@/app/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/table/avatar';
import { Textarea } from '@/app/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/app/components/ui/table/dropdown-menu';
import { useToast } from '@/app/components/ui/use-toast';
import { createClient } from '@/lib/supabase/client';

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
  const supabase = createClient();

  useEffect(() => {
    fetchComments();
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
        variant: 'destructive'
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
        variant: 'destructive'
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
        variant: 'destructive'
      });
    }
  };

  const CommentItem = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => (
    <div className={`${isReply ? 'ml-12' : ''} mb-4`}>
      <div className="flex gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={comment.user.avatar_url} />
          <AvatarFallback>{comment.user.display_name?.charAt(0)}</AvatarFallback>
        </Avatar>
        
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{comment.user.display_name}</span>
                {comment.comment_type && comment.comment_type !== 'general' && (
                  <span className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                    {comment.comment_type}
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                </span>
                {comment.is_edited && (
                  <span className="text-xs text-gray-500">(edited)</span>
                )}
              </div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Flag className="h-4 w-4 mr-2" />
                  Report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          <p className="text-sm mt-1 whitespace-pre-wrap">{comment.comment_text}</p>
          
          <div className="flex items-center gap-4 mt-2">
            <button
              onClick={() => handleVote(comment.id, 'up')}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-blue-600 transition-colors"
            >
              <ThumbsUp className="h-4 w-4" />
              <span>{comment.upvotes}</span>
            </button>
            
            <button
              onClick={() => handleVote(comment.id, 'down')}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600 transition-colors"
            >
              <ThumbsDown className="h-4 w-4" />
              <span>{comment.downvotes}</span>
            </button>
            
            {!isReply && isAuthenticated && (
              <button
                onClick={() => setReplyingTo(comment.id)}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                <Reply className="h-4 w-4" />
                Reply
              </button>
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
            <Select value={commentType} onValueChange={setCommentType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Comment type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="pronunciation">Pronunciation</SelectItem>
                <SelectItem value="usage">Usage</SelectItem>
                <SelectItem value="cultural">Cultural</SelectItem>
                <SelectItem value="grammar">Grammar</SelectItem>
              </SelectContent>
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
          <p className="text-center text-gray-500 py-8">
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