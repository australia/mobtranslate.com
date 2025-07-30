'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { 
  XCircle, 
  Calendar,
  User,
  Globe,
  AlertCircle,
  FileX
} from 'lucide-react';

interface RejectedWord {
  id: string;
  word: string;
  translation: string;
  language_name: string;
  rejected_at: string;
  rejected_by: string;
  submitted_by: string;
  rejection_reason: string;
  can_resubmit: boolean;
}

export default function RejectedPage() {
  const [rejectedWords, setRejectedWords] = useState<RejectedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');

  useEffect(() => {
    fetchRejectedWords();
  }, [timeRange]);

  const fetchRejectedWords = async () => {
    try {
      const response = await fetch(`/api/v2/curator/rejected?range=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setRejectedWords(data);
      }
    } catch (error) {
      console.error('Failed to fetch rejected words:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mock data
  const mockRejectedWords: RejectedWord[] = [
    {
      id: '1',
      word: 'test',
      translation: 'testing',
      language_name: 'Kuku Yalanji',
      rejected_at: '2024-01-28T14:00:00Z',
      rejected_by: 'Current User',
      submitted_by: 'New User',
      rejection_reason: 'Not an Indigenous word - appears to be English',
      can_resubmit: false
    },
    {
      id: '2',
      word: 'kambu',
      translation: 'water',
      language_name: 'Yawuru',
      rejected_at: '2024-01-28T13:00:00Z',
      rejected_by: 'Current User',
      submitted_by: 'John Doe',
      rejection_reason: 'Incorrect translation - this word means "rain" not "water"',
      can_resubmit: true
    },
    {
      id: '3',
      word: 'yapa',
      translation: 'dog',
      language_name: 'Warlpiri',
      rejected_at: '2024-01-27T12:00:00Z',
      rejected_by: 'Current User',
      submitted_by: 'Anonymous',
      rejection_reason: 'Duplicate entry - this word already exists in the dictionary',
      can_resubmit: false
    }
  ];

  const displayWords = rejectedWords.length > 0 ? rejectedWords : mockRejectedWords;

  const getRejectionCategoryColor = (reason: string) => {
    if (reason.toLowerCase().includes('duplicate')) return 'bg-purple-100 text-purple-800';
    if (reason.toLowerCase().includes('incorrect')) return 'bg-orange-100 text-orange-800';
    if (reason.toLowerCase().includes('offensive')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rejected Words</h1>
          <p className="text-muted-foreground mt-2">
            Recently rejected word submissions with feedback
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTimeRange('24h')}
            className={timeRange === '24h' ? 'bg-primary/10' : ''}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTimeRange('7d')}
            className={timeRange === '7d' ? 'bg-primary/10' : ''}>
            This Week
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTimeRange('30d')}
            className={timeRange === '30d' ? 'bg-primary/10' : ''}>
            This Month
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Rejection History</CardTitle>
              <CardDescription>
                {displayWords.length} words rejected in selected period
              </CardDescription>
            </div>
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading ? (
              <p className="text-center py-8">Loading rejected words...</p>
            ) : displayWords.length === 0 ? (
              <div className="text-center py-8">
                <FileX className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium">No rejections</p>
                <p className="text-muted-foreground">No words rejected in this time period</p>
              </div>
            ) : (
              displayWords.map((word) => (
                <div key={word.id} className="p-4 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-lg">{word.word}</p>
                        <span className="text-muted-foreground">→</span>
                        <p className="text-lg line-through text-gray-500">{word.translation}</p>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {word.language_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Submitted by {word.submitted_by}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(word.rejected_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-red-100 text-red-800">
                      Rejected
                    </Badge>
                  </div>
                  
                  <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
                          Rejection Reason:
                        </p>
                        <p className="text-sm text-red-700 dark:text-red-300">
                          {word.rejection_reason}
                        </p>
                        {word.can_resubmit && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                            ✓ Can be resubmitted with corrections
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Rejected
            </CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayWords.length}</div>
            <p className="text-xs text-muted-foreground">
              In selected period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Can Resubmit
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {displayWords.filter(w => w.can_resubmit).length}
            </div>
            <p className="text-xs text-muted-foreground">
              With corrections
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Rejection Rate
            </CardTitle>
            <XCircle className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8%</div>
            <p className="text-xs text-muted-foreground">
              Of all submissions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Common Rejection Reasons */}
      <Card>
        <CardHeader>
          <CardTitle>Common Rejection Reasons</CardTitle>
          <CardDescription>
            Help contributors improve their submissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2">
              <span className="text-sm">Incorrect translation</span>
              <Badge variant="secondary">35%</Badge>
            </div>
            <div className="flex items-center justify-between p-2">
              <span className="text-sm">Duplicate entry</span>
              <Badge variant="secondary">25%</Badge>
            </div>
            <div className="flex items-center justify-between p-2">
              <span className="text-sm">Missing information</span>
              <Badge variant="secondary">20%</Badge>
            </div>
            <div className="flex items-center justify-between p-2">
              <span className="text-sm">Not Indigenous word</span>
              <Badge variant="secondary">15%</Badge>
            </div>
            <div className="flex items-center justify-between p-2">
              <span className="text-sm">Other</span>
              <Badge variant="secondary">5%</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}