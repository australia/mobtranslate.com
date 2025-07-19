'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import { Card, CardContent, Button, Badge, LoadingState } from '@ui/components';
import { X, Check, AlertCircle, Zap, ArrowLeft } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import Link from 'next/link';

interface WordCard {
  id: string;
  wordId: string;
  word: string;
  meaning: string;
  choices: string[];
  correctIndex: number;
  bucket: number;
  wordClass?: string;
}

type Phase = 'loading' | 'word' | 'feedback' | 'no-words';

export default function LearnDictionaryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const languageCode = params.dictionary as string;
  
  const [currentWord, setCurrentWord] = useState<WordCard | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const [streak, setStreak] = useState(0);
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const [languageName, setLanguageName] = useState<string>('');

  useEffect(() => {
    if (loading) return;
    
    if (!user) {
      router.push(`/auth/signin?redirect=/learn/${languageCode}`);
      return;
    }

    fetchLanguageName();
    fetchNextWord();
  }, [user, loading, languageCode]);

  const fetchLanguageName = async () => {
    try {
      const response = await fetch('/api/v2/languages');
      const languages = await response.json();
      const language = languages.find((lang: any) => lang.code === languageCode);
      if (language) {
        setLanguageName(language.name);
      }
    } catch (error) {
      console.error('Error fetching language name:', error);
    }
  };

  const fetchNextWord = async () => {
    setPhase('loading');
    try {
      const response = await fetch('/api/v2/learn/next-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ languageCode })
      });

      const data = await response.json();
      
      if (data.error) {
        console.error('Error fetching word:', data.error);
        if (data.error === 'No words available') {
          setPhase('no-words');
        }
        return;
      }

      setCurrentWord(data);
      setPhase('word');
      setSelectedChoice(null);
      setStartTime(Date.now());
    } catch (error) {
      console.error('Error fetching next word:', error);
    }
  };

  const handleAnswer = async (choiceIndex: number) => {
    if (phase !== 'word' || !currentWord) return;
    
    const responseTime = Date.now() - startTime;
    const isCorrect = choiceIndex === currentWord.correctIndex;
    
    setSelectedChoice(choiceIndex);
    setPhase('feedback');

    // Update streak
    if (isCorrect) {
      setStreak(prev => prev + 1);
    } else {
      setStreak(0);
    }

    setWordsCompleted(prev => prev + 1);

    // Submit attempt
    try {
      await fetch('/api/v2/learn/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wordId: currentWord.wordId,
          isCorrect,
          responseTimeMs: responseTime,
          selectedAnswer: currentWord.choices[choiceIndex],
          correctAnswer: currentWord.choices[currentWord.correctIndex]
        })
      });
    } catch (error) {
      console.error('Error submitting attempt:', error);
    }
  };

  const handleContinue = () => {
    fetchNextWord();
  };

  const getBucketColor = (bucket: number) => {
    const colors = [
      'bg-gray-500',    // New
      'bg-red-500',     // Learning-1
      'bg-orange-500',  // Learning-2
      'bg-yellow-500',  // Review-1
      'bg-blue-500',    // Review-2
      'bg-green-500'    // Mastered
    ];
    return colors[bucket] || 'bg-gray-500';
  };

  const getBucketName = (bucket: number) => {
    const names = ['New', 'Learning', 'Learning', 'Review', 'Review', 'Mastered'];
    return names[bucket] || 'Unknown';
  };

  if (loading) {
    return (
      <SharedLayout>
        <div className="min-h-screen flex items-center justify-center">
          <LoadingState />
        </div>
      </SharedLayout>
    );
  }

  return (
    <SharedLayout>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/learn">
                  <Button variant="ghost" size="sm">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <div className="text-sm font-medium">
                  {languageName || languageCode} • {wordsCompleted} words practiced
                </div>
                <Badge variant="outline" className="gap-1">
                  <Zap className="h-3 w-3" />
                  {streak}
                </Badge>
              </div>
              <Link href="/stats">
                <Button variant="ghost" size="sm">
                  View Stats
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto px-4 py-8">
          {phase === 'no-words' ? (
            <Card className="max-w-2xl mx-auto">
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-16 w-16 mx-auto text-yellow-500 mb-4" />
                <h2 className="text-xl font-semibold mb-2">No Words Available</h2>
                <p className="text-muted-foreground mb-4">
                  There are no words available for {languageName || languageCode} yet.
                </p>
                <Link href="/learn">
                  <Button variant="outline">
                    Back to Language Selection
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : phase === 'loading' ? (
            <Card className="max-w-2xl mx-auto">
              <CardContent className="p-8 text-center">
                <LoadingState />
                <p className="text-muted-foreground mt-4">Loading next word...</p>
              </CardContent>
            </Card>
          ) : currentWord ? (
            <Card className="max-w-2xl mx-auto">
              <CardContent className="p-8">
                {phase === 'word' && (
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 mb-4">
                        <Badge 
                          variant="secondary" 
                          className={cn("text-white", getBucketColor(currentWord.bucket))}
                        >
                          {getBucketName(currentWord.bucket)}
                        </Badge>
                        {currentWord.wordClass && (
                          <Badge variant="outline">{currentWord.wordClass}</Badge>
                        )}
                      </div>
                      
                      <h1 className="text-4xl font-bold mb-2 font-crimson">
                        {currentWord.word}
                      </h1>
                      <div className="text-muted-foreground">Select the correct meaning</div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3">
                      {currentWord.choices.map((choice, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="lg"
                          onClick={() => handleAnswer(index)}
                          className={cn(
                            "h-auto p-4 text-left justify-start whitespace-normal",
                            "hover:bg-blue-50 hover:border-blue-300 transition-all duration-200"
                          )}
                        >
                          <div className="flex items-start gap-3 w-full">
                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium flex-shrink-0 mt-1">
                              {String.fromCharCode(65 + index)}
                            </div>
                            <div className="text-base">{choice}</div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {phase === 'feedback' && (
                  <div className="text-center space-y-6">
                    <div className={cn(
                      "text-6xl",
                      selectedChoice === currentWord.correctIndex ? "text-green-500" : "text-red-500"
                    )}>
                      {selectedChoice === currentWord.correctIndex ? (
                        <Check className="h-16 w-16 mx-auto" />
                      ) : (
                        <AlertCircle className="h-16 w-16 mx-auto" />
                      )}
                    </div>
                    
                    <div>
                      <h2 className="text-2xl font-bold mb-2 font-crimson">
                        {currentWord.word}
                      </h2>
                      <div className="text-lg text-green-600 font-medium">
                        {currentWord.choices[currentWord.correctIndex]}
                      </div>
                      {selectedChoice !== currentWord.correctIndex && (
                        <div className="text-red-500 mt-2">
                          You selected: {currentWord.choices[selectedChoice!]}
                        </div>
                      )}
                    </div>
                    
                    <Button
                      onClick={handleContinue}
                      size="lg"
                      className="mt-4"
                    >
                      Continue
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </SharedLayout>
  );
}