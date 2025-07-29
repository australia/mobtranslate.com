'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';
import { Badge } from '@ui/components/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@ui/components/dialog';
import { Label } from '@ui/components/label';
import { Textarea } from '@ui/components/textarea';
import { useToast } from '@ui/components/use-toast';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  User, 
  Calendar,
  Globe,
  MessageSquare,
  AlertCircle,
  Eye,
  Volume2
} from 'lucide-react';

interface PendingWord {
  id: string;
  word: string;
  translation: string;
  part_of_speech?: string;
  pronunciation?: string;
  audio_url?: string;
  definition?: string;
  example_sentence?: string;
  cultural_notes?: string;
  language_id: string;
  language_name: string;
  submitted_by: string;
  submitted_by_name: string;
  created_at: string;
  previous_attempts?: number;
  similar_words?: Array<{ word: string; translation: string }>;
}

export default function PendingReviewsPage() {
  const [pendingWords, setPendingWords] = useState<PendingWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWord, setSelectedWord] = useState<PendingWord | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [filterLanguage, setFilterLanguage] = useState('all');
  const { toast } = useToast();

  useEffect(() => {
    fetchPendingWords();
  }, [filterLanguage]);

  const fetchPendingWords = async () => {
    try {
      const url = filterLanguage === 'all' 
        ? '/api/v2/curator/pending'
        : `/api/v2/curator/pending?language=${filterLanguage}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setPendingWords(data);
      }
    } catch (error) {
      console.error('Failed to fetch pending words:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pending reviews',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async () => {
    if (!selectedWord || !reviewAction) return;

    try {
      const response = await fetch(`/api/v2/curator/words/${selectedWord.id}/review`, {
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
          description: `Word ${reviewAction === 'approve' ? 'approved' : 'rejected'} successfully`
        });
        setReviewDialogOpen(false);
        setSelectedWord(null);
        setReviewNotes('');
        fetchPendingWords();
      }
    } catch (error) {
      console.error('Failed to review word:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit review',
        variant: 'destructive'
      });
    }
  };

  const openReviewDialog = (word: PendingWord, action: 'approve' | 'reject') => {
    setSelectedWord(word);
    setReviewAction(action);
    setReviewDialogOpen(true);
  };

  // Mock data for demonstration
  const mockPendingWords: PendingWord[] = [
    {
      id: '1',
      word: 'ngamu',
      translation: 'mother',
      part_of_speech: 'noun',
      pronunciation: 'nga-moo',
      definition: 'Mother, maternal parent',
      example_sentence: 'Ngamu yundu wunay',
      cultural_notes: 'Term of respect also used for maternal aunts',
      language_id: '1',
      language_name: 'Kuku Yalanji',
      submitted_by: '1',
      submitted_by_name: 'Sarah Johnson',
      created_at: '2024-01-28T10:00:00Z',
      previous_attempts: 0,
      similar_words: [
        { word: 'ngamuku', translation: 'grandmother' }
      ]
    },
    {
      id: '2',
      word: 'mayi',
      translation: 'food',
      part_of_speech: 'noun',
      pronunciation: 'may-ee',
      definition: 'Food, edible items',
      example_sentence: 'Mayi kari nginda',
      language_id: '2',
      language_name: 'Yawuru',
      submitted_by: '2',
      submitted_by_name: 'John Smith',
      created_at: '2024-01-28T11:00:00Z',
      previous_attempts: 1
    },
    {
      id: '3',
      word: 'yapa',
      translation: 'person',
      part_of_speech: 'noun',
      pronunciation: 'yah-pah',
      audio_url: '/audio/yapa.mp3',
      definition: 'Person, human being',
      language_id: '3',
      language_name: 'Warlpiri',
      submitted_by: '3',
      submitted_by_name: 'Emma Davis',
      created_at: '2024-01-28T09:00:00Z',
      previous_attempts: 0
    }
  ];

  const displayWords = pendingWords.length > 0 ? pendingWords : mockPendingWords;
  const languages = [...new Set(displayWords.map(w => w.language_name))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pending Reviews</h1>
          <p className="text-muted-foreground mt-2">
            Review and approve new word submissions
          </p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          <Clock className="h-4 w-4 mr-2" />
          {displayWords.length} pending
        </Badge>
      </div>

      {/* Language Filter */}
      <Tabs value={filterLanguage} onValueChange={setFilterLanguage}>
        <TabsList>
          <TabsTrigger value="all">All Languages</TabsTrigger>
          {languages.map(lang => (
            <TabsTrigger key={lang} value={lang}>{lang}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Pending Words Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <Card className="col-span-full">
            <CardContent className="text-center py-8">
              Loading pending reviews...
            </CardContent>
          </Card>
        ) : displayWords.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <p className="text-lg font-medium">All caught up!</p>
              <p className="text-muted-foreground">No pending reviews at the moment</p>
            </CardContent>
          </Card>
        ) : (
          displayWords.map((word) => (
            <Card key={word.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl">{word.word}</CardTitle>
                    <CardDescription className="mt-1">
                      {word.translation}
                      {word.part_of_speech && (
                        <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                          {word.part_of_speech}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  {word.audio_url && (
                    <Button variant="ghost" size="sm">
                      <Volume2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {word.pronunciation && (
                  <div>
                    <p className="text-sm text-muted-foreground">Pronunciation</p>
                    <p className="font-medium">{word.pronunciation}</p>
                  </div>
                )}

                {word.definition && (
                  <div>
                    <p className="text-sm text-muted-foreground">Definition</p>
                    <p className="text-sm">{word.definition}</p>
                  </div>
                )}

                {word.example_sentence && (
                  <div>
                    <p className="text-sm text-muted-foreground">Example</p>
                    <p className="text-sm italic">{word.example_sentence}</p>
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                  <div className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {word.language_name}
                  </div>
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {word.submitted_by_name}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(word.created_at).toLocaleDateString()}
                  </div>
                </div>

                {word.previous_attempts && word.previous_attempts > 0 && (
                  <div className="flex items-center gap-2 text-sm text-orange-600">
                    <AlertCircle className="h-4 w-4" />
                    Previously rejected {word.previous_attempts} time{word.previous_attempts > 1 ? 's' : ''}
                  </div>
                )}

                {word.similar_words && word.similar_words.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-sm">
                    <p className="text-xs text-muted-foreground mb-1">Similar words:</p>
                    {word.similar_words.map((sw, i) => (
                      <span key={i} className="text-xs">
                        {sw.word} ({sw.translation})
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setSelectedWord(word);
                      setReviewDialogOpen(true);
                      setReviewAction(null);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Details
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="flex-1 text-red-600 hover:text-red-700"
                    onClick={() => openReviewDialog(word, 'reject')}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button 
                    size="sm"
                    className="flex-1"
                    onClick={() => openReviewDialog(word, 'approve')}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                </div>
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
              {reviewAction === 'approve' ? 'Approve' : reviewAction === 'reject' ? 'Reject' : 'Review'} Word
            </DialogTitle>
            <DialogDescription>
              {selectedWord && `Reviewing "${selectedWord.word}" (${selectedWord.translation})`}
            </DialogDescription>
          </DialogHeader>

          {selectedWord && (
            <div className="space-y-4 my-4">
              {/* Show all word details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label>Word</Label>
                  <p className="font-medium">{selectedWord.word}</p>
                </div>
                <div>
                  <Label>Translation</Label>
                  <p className="font-medium">{selectedWord.translation}</p>
                </div>
                {selectedWord.pronunciation && (
                  <div>
                    <Label>Pronunciation</Label>
                    <p className="font-medium">{selectedWord.pronunciation}</p>
                  </div>
                )}
                {selectedWord.part_of_speech && (
                  <div>
                    <Label>Part of Speech</Label>
                    <p className="font-medium">{selectedWord.part_of_speech}</p>
                  </div>
                )}
              </div>

              {selectedWord.definition && (
                <div>
                  <Label>Definition</Label>
                  <p className="text-sm">{selectedWord.definition}</p>
                </div>
              )}

              {selectedWord.example_sentence && (
                <div>
                  <Label>Example Sentence</Label>
                  <p className="text-sm italic">{selectedWord.example_sentence}</p>
                </div>
              )}

              {selectedWord.cultural_notes && (
                <div>
                  <Label>Cultural Notes</Label>
                  <p className="text-sm">{selectedWord.cultural_notes}</p>
                </div>
              )}

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
                  onClick={() => openReviewDialog(selectedWord!, 'reject')}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button 
                  onClick={() => openReviewDialog(selectedWord!, 'approve')}
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
                  {reviewAction === 'approve' ? 'Approve' : 'Reject'} Word
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}