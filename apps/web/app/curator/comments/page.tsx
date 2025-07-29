'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';
import { Badge } from '@ui/components/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/components/avatar';
import { useToast } from '@ui/components/use-toast';
import { 
  MessageSquare, 
  Flag, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  User,
  Calendar,
  Eye,
  Trash2,
  Shield
} from 'lucide-react';

interface Comment {
  id: string;
  word_id: string;
  word: string;
  content: string;
  category: 'general' | 'pronunciation' | 'usage' | 'cultural' | 'grammar';
  user_id: string;
  user_name: string;
  user_avatar?: string;
  created_at: string;
  updated_at?: string;
  is_flagged: boolean;
  flag_reason?: string;
  flagged_by?: string;
  flagged_at?: string;
  upvotes: number;
  downvotes: number;
  status: 'active' | 'hidden' | 'deleted';
  parent_id?: string;
  replies_count?: number;
}

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('flagged');
  const { toast } = useToast();

  useEffect(() => {
    fetchComments();
  }, [filterType]);

  const fetchComments = async () => {
    try {
      const response = await fetch(`/api/v2/curator/comments?type=${filterType}`);
      if (response.ok) {
        const data = await response.json();
        setComments(data);
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error);
      toast({
        title: 'Error',
        description: 'Failed to load comments',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleModerateComment = async (commentId: string, action: 'approve' | 'hide' | 'delete') => {
    try {
      const response = await fetch(`/api/v2/curator/comments/${commentId}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: `Comment ${action}d successfully`
        });
        fetchComments();
      }
    } catch (error) {
      console.error('Failed to moderate comment:', error);
      toast({
        title: 'Error',
        description: 'Failed to moderate comment',
        variant: 'destructive'
      });
    }
  };

  const getCategoryColor = (category: Comment['category']) => {
    const colors = {
      general: 'bg-gray-100 text-gray-800',
      pronunciation: 'bg-purple-100 text-purple-800',
      usage: 'bg-blue-100 text-blue-800',
      cultural: 'bg-pink-100 text-pink-800',
      grammar: 'bg-green-100 text-green-800'
    };
    return colors[category] || colors.general;
  };

  // Mock data for demonstration
  const mockComments: Comment[] = [
    {
      id: '1',
      word_id: '1',
      word: 'ngamu',
      content: 'This translation is incorrect. It should be "grandmother" not "mother".',
      category: 'general',
      user_id: '1',
      user_name: 'Anonymous User',
      created_at: '2024-01-28T10:00:00Z',
      is_flagged: true,
      flag_reason: 'Incorrect information',
      flagged_by: 'John Doe',
      flagged_at: '2024-01-28T11:00:00Z',
      upvotes: 2,
      downvotes: 8,
      status: 'active',
      replies_count: 3
    },
    {
      id: '2',
      word_id: '2',
      word: 'mayi',
      content: 'The pronunciation guide is really helpful! Just to add, in the coastal dialect, it\'s pronounced slightly differently.',
      category: 'pronunciation',
      user_id: '2',
      user_name: 'Sarah Wilson',
      user_avatar: '/avatars/sarah.jpg',
      created_at: '2024-01-28T09:00:00Z',
      is_flagged: true,
      flag_reason: 'Spam',
      flagged_by: 'Mike Chen',
      flagged_at: '2024-01-28T09:30:00Z',
      upvotes: 15,
      downvotes: 1,
      status: 'active'
    },
    {
      id: '3',
      word_id: '3',
      word: 'yapa',
      content: 'This word has deep cultural significance that should be noted. It\'s not just "person" but carries respect.',
      category: 'cultural',
      user_id: '3',
      user_name: 'Elder Mary',
      created_at: '2024-01-27T14:00:00Z',
      is_flagged: false,
      upvotes: 45,
      downvotes: 0,
      status: 'active'
    },
    {
      id: '4',
      word_id: '4',
      word: 'kari',
      content: 'Buy cheap watches online! Best prices guaranteed! Click here: spam.link',
      category: 'general',
      user_id: '4',
      user_name: 'SpamBot123',
      created_at: '2024-01-28T12:00:00Z',
      is_flagged: true,
      flag_reason: 'Spam',
      flagged_by: 'System',
      flagged_at: '2024-01-28T12:01:00Z',
      upvotes: 0,
      downvotes: 25,
      status: 'active'
    }
  ];

  const displayComments = comments.length > 0 ? comments : mockComments;
  const flaggedCount = displayComments.filter(c => c.is_flagged && c.status === 'active').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Comments Moderation</h1>
          <p className="text-muted-foreground mt-2">
            Review and moderate user comments
          </p>
        </div>
        {flaggedCount > 0 && (
          <Badge variant="destructive" className="text-lg px-4 py-2">
            <AlertTriangle className="h-4 w-4 mr-2" />
            {flaggedCount} flagged
          </Badge>
        )}
      </div>

      {/* Filter Tabs */}
      <Tabs value={filterType} onValueChange={setFilterType}>
        <TabsList>
          <TabsTrigger value="flagged">
            <Flag className="h-4 w-4 mr-2" />
            Flagged
          </TabsTrigger>
          <TabsTrigger value="recent">
            <MessageSquare className="h-4 w-4 mr-2" />
            Recent
          </TabsTrigger>
          <TabsTrigger value="all">All Comments</TabsTrigger>
        </TabsList>

        <TabsContent value={filterType} className="space-y-4 mt-6">
          {loading ? (
            <Card>
              <CardContent className="text-center py-8">
                Loading comments...
              </CardContent>
            </Card>
          ) : displayComments.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium">No comments found</p>
                <p className="text-muted-foreground">No comments match your current filter</p>
              </CardContent>
            </Card>
          ) : (
            displayComments.map((comment) => (
              <Card 
                key={comment.id} 
                className={`hover:shadow-lg transition-shadow ${
                  comment.is_flagged ? 'border-red-200 dark:border-red-800' : ''
                }`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10">
                        {comment.user_avatar ? (
                          <AvatarImage src={comment.user_avatar} alt={comment.user_name} />
                        ) : (
                          <AvatarFallback>
                            <User className="h-5 w-5" />
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{comment.user_name}</p>
                          <Badge className={getCategoryColor(comment.category)} variant="secondary">
                            {comment.category}
                          </Badge>
                          {comment.status !== 'active' && (
                            <Badge variant="secondary">
                              {comment.status}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span>on "{comment.word}"</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(comment.created_at).toLocaleDateString()}
                          </span>
                          {comment.replies_count && comment.replies_count > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {comment.replies_count} replies
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="flex items-center gap-1 text-green-600">
                          <ThumbsUp className="h-4 w-4" />
                          {comment.upvotes}
                        </span>
                        <span className="flex items-center gap-1 text-red-600">
                          <ThumbsDown className="h-4 w-4" />
                          {comment.downvotes}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm">{comment.content}</p>

                  {comment.is_flagged && (
                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Flag className="h-4 w-4 text-red-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-red-800 dark:text-red-200">
                            Flagged for: {comment.flag_reason}
                          </p>
                          <p className="text-xs text-red-600 dark:text-red-400">
                            by {comment.flagged_by} on {comment.flagged_at && new Date(comment.flagged_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {comment.status === 'active' && (
                    <div className="flex gap-2 pt-2 border-t">
                      {comment.is_flagged && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleModerateComment(comment.id, 'approve')}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-orange-600 hover:text-orange-700"
                            onClick={() => handleModerateComment(comment.id, 'hide')}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Hide
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleModerateComment(comment.id, 'delete')}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                      <div className="flex-1" />
                      <Button
                        size="sm"
                        variant="ghost"
                      >
                        <Shield className="h-4 w-4 mr-2" />
                        View User
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Moderation Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Comments
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayComments.length}</div>
            <p className="text-xs text-muted-foreground">
              Across all words
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Flagged
            </CardTitle>
            <Flag className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{flaggedCount}</div>
            <p className="text-xs text-muted-foreground">
              Need review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Hidden
            </CardTitle>
            <Eye className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {displayComments.filter(c => c.status === 'hidden').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Temporarily hidden
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Approval Rate
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">94%</div>
            <p className="text-xs text-muted-foreground">
              Last 30 days
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}