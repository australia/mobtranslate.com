'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { useToast } from '@/app/components/ui/use-toast';
import { 
  TrendingUp, 
  CheckCircle, 
  XCircle, 
  User, 
  Calendar,
  MessageSquare,
  GitCompare,
  ThumbsUp,
  Eye
} from 'lucide-react';

interface Improvement {
  id: string;
  word_id: string;
  current_word: string;
  current_translation: string;
  suggested_word?: string;
  suggested_translation?: string;
  suggested_pronunciation?: string;
  suggested_definition?: string;
  reason: string;
  category: 'spelling' | 'translation' | 'pronunciation' | 'definition' | 'cultural' | 'other';
  submitted_by: string;
  submitted_by_name: string;
  submitted_by_reputation?: number;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  upvotes?: number;
  previous_suggestions?: number;
}

export default function ImprovementsPage() {
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImprovement, setSelectedImprovement] = useState<Improvement | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const { toast } = useToast();

  useEffect(() => {
    fetchImprovements();
  }, [filterStatus]);

  const fetchImprovements = async () => {
    try {
      const response = await fetch(`/api/v2/curator/improvements?status=${filterStatus}`);
      if (response.ok) {
        const data = await response.json();
        setImprovements(data);
      }
    } catch (error) {
      console.error('Failed to fetch improvements:', error);
      toast({
        title: 'Error',
        description: 'Failed to load improvement suggestions',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async () => {
    if (!selectedImprovement || !reviewAction) return;

    try {
      const response = await fetch(`/api/v2/curator/improvements/${selectedImprovement.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: reviewAction,
          notes: reviewNotes
        })
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: `Improvement ${reviewAction === 'approve' ? 'approved' : 'rejected'} successfully`
        });
        setReviewDialogOpen(false);
        setSelectedImprovement(null);
        setReviewNotes('');
        fetchImprovements();
      }
    } catch (error) {
      console.error('Failed to review improvement:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit review',
        variant: 'destructive'
      });
    }
  };

  const getCategoryColor = (category: Improvement['category']) => {
    const colors = {
      spelling: 'bg-blue-100 text-blue-800',
      translation: 'bg-green-100 text-green-800',
      pronunciation: 'bg-purple-100 text-purple-800',
      definition: 'bg-orange-100 text-orange-800',
      cultural: 'bg-pink-100 text-pink-800',
      other: 'bg-gray-100 text-gray-800'
    };
    return colors[category] || colors.other;
  };

  // Mock data for demonstration
  const mockImprovements: Improvement[] = [
    {
      id: '1',
      word_id: '1',
      current_word: 'ngamu',
      current_translation: 'mother',
      suggested_translation: 'mother, mom',
      reason: 'The translation should include both formal and informal terms as both are commonly used',
      category: 'translation',
      submitted_by: '1',
      submitted_by_name: 'Mike Chen',
      submitted_by_reputation: 85,
      created_at: '2024-01-28T10:00:00Z',
      status: 'pending',
      upvotes: 3
    },
    {
      id: '2',
      word_id: '2',
      current_word: 'mayi',
      current_translation: 'food',
      suggested_pronunciation: 'MAH-yee',
      reason: 'The current pronunciation guide doesn\'t emphasize the correct stress pattern',
      category: 'pronunciation',
      submitted_by: '2',
      submitted_by_name: 'Emma Wilson',
      submitted_by_reputation: 92,
      created_at: '2024-01-28T11:00:00Z',
      status: 'pending',
      upvotes: 5,
      previous_suggestions: 1
    },
    {
      id: '3',
      word_id: '3',
      current_word: 'kari',
      current_translation: 'now',
      suggested_definition: 'Now, at this moment, immediately. Can also indicate urgency in certain contexts.',
      reason: 'The definition needs more context to help learners understand usage nuances',
      category: 'definition',
      submitted_by: '3',
      submitted_by_name: 'James Brown',
      created_at: '2024-01-28T09:00:00Z',
      status: 'pending',
      upvotes: 2
    }
  ];

  const displayImprovements = improvements.length > 0 ? improvements : mockImprovements;
  const pendingCount = displayImprovements.filter(i => i.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Improvement Suggestions</h1>
          <p className="text-muted-foreground mt-2">
            Review community suggestions for word improvements
          </p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          <TrendingUp className="h-4 w-4 mr-2" />
          {pendingCount} pending
        </Badge>
      </div>

      {/* Status Filter */}
      <Tabs value={filterStatus} onValueChange={setFilterStatus}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Improvements List */}
      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardContent className="text-center py-8">
              Loading improvement suggestions...
            </CardContent>
          </Card>
        ) : displayImprovements.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium">No suggestions found</p>
              <p className="text-muted-foreground">No improvement suggestions match your filters</p>
            </CardContent>
          </Card>
        ) : (
          displayImprovements.map((improvement) => (
            <Card key={improvement.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle className="text-lg">
                        Improve: {improvement.current_word}
                      </CardTitle>
                      <Badge className={getCategoryColor(improvement.category)}>
                        {improvement.category}
                      </Badge>
                      {improvement.status !== 'pending' && (
                        <Badge variant={improvement.status === 'approved' ? 'default' : 'secondary'}>
                          {improvement.status}
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      Current: "{improvement.current_translation}"
                    </CardDescription>
                  </div>
                  {improvement.upvotes && improvement.upvotes > 0 && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <ThumbsUp className="h-4 w-4" />
                      {improvement.upvotes}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Show the suggestion based on category */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                  <p className="text-sm font-medium mb-1">Suggested Change:</p>
                  {improvement.suggested_translation && (
                    <p className="text-sm">Translation: <span className="font-medium">{improvement.suggested_translation}</span></p>
                  )}
                  {improvement.suggested_pronunciation && (
                    <p className="text-sm">Pronunciation: <span className="font-medium">{improvement.suggested_pronunciation}</span></p>
                  )}
                  {improvement.suggested_definition && (
                    <p className="text-sm">Definition: <span className="font-medium">{improvement.suggested_definition}</span></p>
                  )}
                  {improvement.suggested_word && (
                    <p className="text-sm">Spelling: <span className="font-medium">{improvement.suggested_word}</span></p>
                  )}
                </div>

                <div>
                  <p className="text-sm font-medium mb-1">Reason for change:</p>
                  <p className="text-sm text-muted-foreground">{improvement.reason}</p>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {improvement.submitted_by_name}
                    {improvement.submitted_by_reputation && (
                      <span className="text-green-600">
                        ({improvement.submitted_by_reputation}% accuracy)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(improvement.created_at).toLocaleDateString()}
                  </div>
                  {improvement.previous_suggestions && improvement.previous_suggestions > 0 && (
                    <div className="flex items-center gap-1 text-orange-600">
                      <MessageSquare className="h-3 w-3" />
                      {improvement.previous_suggestions} previous suggestions
                    </div>
                  )}
                </div>

                {improvement.status === 'pending' && (
                  <div className="flex gap-2 pt-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setSelectedImprovement(improvement);
                        setReviewDialogOpen(true);
                        setReviewAction(null);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Review Details
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="flex-1 text-red-600 hover:text-red-700"
                      onClick={() => {
                        setSelectedImprovement(improvement);
                        setReviewAction('reject');
                        setReviewDialogOpen(true);
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                    <Button 
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setSelectedImprovement(improvement);
                        setReviewAction('approve');
                        setReviewDialogOpen(true);
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Review Improvement Suggestion
            </DialogTitle>
            <DialogDescription>
              {selectedImprovement && `Reviewing suggestion for "${selectedImprovement.current_word}"`}
            </DialogDescription>
          </DialogHeader>

          {selectedImprovement && (
            <div className="space-y-4 my-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Current Version</Label>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                    <p className="font-medium">{selectedImprovement.current_word}</p>
                    <p className="text-sm text-muted-foreground">{selectedImprovement.current_translation}</p>
                  </div>
                </div>
                <div>
                  <Label>Suggested Version</Label>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                    <p className="font-medium">
                      {selectedImprovement.suggested_word || selectedImprovement.current_word}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedImprovement.suggested_translation || 
                       selectedImprovement.suggested_pronunciation || 
                       selectedImprovement.suggested_definition}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <Label>Reason for Change</Label>
                <p className="text-sm mt-1">{selectedImprovement.reason}</p>
              </div>

              <div>
                <Label>Submitted By</Label>
                <p className="text-sm mt-1">
                  {selectedImprovement.submitted_by_name}
                  {selectedImprovement.submitted_by_reputation && (
                    <span className="text-green-600 ml-2">
                      ({selectedImprovement.submitted_by_reputation}% accuracy rate)
                    </span>
                  )}
                </p>
              </div>

              {reviewAction && (
                <div>
                  <Label htmlFor="notes">
                    {reviewAction === 'reject' ? 'Rejection Reason' : 'Review Notes'} (Optional)
                  </Label>
                  <Textarea
                    id="notes"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder={reviewAction === 'reject' 
                      ? 'Please provide a reason for rejection...' 
                      : 'Any notes about this approval...'}
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {!reviewAction ? (
              <>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setReviewAction('reject');
                  }}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button 
                  onClick={() => {
                    setReviewAction('approve');
                  }}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setReviewDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleReview}
                  variant={reviewAction === 'reject' ? 'destructive' : 'default'}
                >
                  {reviewAction === 'approve' ? 'Approve' : 'Reject'} Suggestion
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}