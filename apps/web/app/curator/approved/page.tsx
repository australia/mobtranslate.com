'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { 
  CheckCircle, 
  Calendar,
  User,
  Globe,
  Search,
  FileText
} from 'lucide-react';

interface ApprovedWord {
  id: string;
  word: string;
  translation: string;
  language_name: string;
  approved_at: string;
  approved_by: string;
  submitted_by: string;
  review_notes?: string;
}

export default function ApprovedPage() {
  const [approvedWords, setApprovedWords] = useState<ApprovedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');

  useEffect(() => {
    fetchApprovedWords();
  }, [timeRange]);

  const fetchApprovedWords = async () => {
    try {
      const response = await fetch(`/api/v2/curator/approved?range=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setApprovedWords(data);
      }
    } catch (error) {
      console.error('Failed to fetch approved words:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mock data
  const mockApprovedWords: ApprovedWord[] = [
    {
      id: '1',
      word: 'ngamu',
      translation: 'mother',
      language_name: 'Kuku Yalanji',
      approved_at: '2024-01-28T14:00:00Z',
      approved_by: 'Current User',
      submitted_by: 'Sarah Johnson',
      review_notes: 'Verified with language elder'
    },
    {
      id: '2',
      word: 'mayi',
      translation: 'food',
      language_name: 'Yawuru',
      approved_at: '2024-01-28T13:00:00Z',
      approved_by: 'Current User',
      submitted_by: 'John Smith'
    },
    {
      id: '3',
      word: 'yapa',
      translation: 'person',
      language_name: 'Warlpiri',
      approved_at: '2024-01-28T12:00:00Z',
      approved_by: 'Current User',
      submitted_by: 'Emma Davis',
      review_notes: 'Good cultural context provided'
    }
  ];

  const displayWords = approvedWords.length > 0 ? approvedWords : mockApprovedWords;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Approved Words</h1>
          <p className="text-muted-foreground mt-2">
            Recently approved word submissions
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
              <CardTitle>Approval History</CardTitle>
              <CardDescription>
                {displayWords.length} words approved in selected period
              </CardDescription>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading ? (
              <p className="text-center py-8">Loading approved words...</p>
            ) : displayWords.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium">No approvals yet</p>
                <p className="text-muted-foreground">No words approved in this time period</p>
              </div>
            ) : (
              displayWords.map((word) => (
                <div key={word.id} className="flex items-start justify-between p-4 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-lg">{word.word}</p>
                      <span className="text-muted-foreground">→</span>
                      <p className="text-lg">{word.translation}</p>
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
                        {new Date(word.approved_at).toLocaleDateString()}
                      </span>
                    </div>
                    {word.review_notes && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                        Note: {word.review_notes}
                      </p>
                    )}
                  </div>
                  <Badge variant="default" className="bg-green-600">
                    Approved
                  </Badge>
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
              Total Approved
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
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
              Languages Covered
            </CardTitle>
            <Globe className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(displayWords.map(w => w.language_name)).size}
            </div>
            <p className="text-xs text-muted-foreground">
              Different languages
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Contributors
            </CardTitle>
            <User className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(displayWords.map(w => w.submitted_by)).size}
            </div>
            <p className="text-xs text-muted-foreground">
              Unique contributors
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}