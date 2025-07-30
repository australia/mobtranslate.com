'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import { Card, CardContent, Button, Badge, LoadingState } from '@/app/components/ui/table';
import { X, Check, AlertCircle, Zap, ArrowLeft, BarChart3, Sparkles, Target } from 'lucide-react';
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
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (loading) return;
    
    if (!user) {
      router.push(`/auth/signin?redirect=/learn/${languageCode}`);
      return;
    }

    fetchLanguageName();
    fetchNextWord();
  }, [user, loading, languageCode]);

  useEffect(() => {
    if (showConfetti) {
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showConfetti]);

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
      const newStreak = streak + 1;
      setStreak(newStreak);
      // Show confetti on streak milestones
      if (newStreak % 5 === 0) {
        setShowConfetti(true);
      }
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

  const getBucketInfo = (bucket: number) => {
    const buckets = [
      { name: 'New', color: 'bg-gradient-to-r from-gray-400 to-gray-500', icon: Sparkles },
      { name: 'Learning', color: 'bg-gradient-to-r from-red-400 to-red-500', icon: Target },
      { name: 'Learning', color: 'bg-gradient-to-r from-orange-400 to-orange-500', icon: Target },
      { name: 'Review', color: 'bg-gradient-to-r from-yellow-400 to-yellow-500', icon: Target },
      { name: 'Review', color: 'bg-gradient-to-r from-blue-400 to-blue-500', icon: Target },
      { name: 'Mastered', color: 'bg-gradient-to-r from-green-400 to-green-500', icon: Sparkles }
    ];
    return buckets[bucket] || buckets[0];
  };

  if (loading) {
    return (
      <SharedLayout>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-indigo-200 dark:border-indigo-800"></div>
            <div className="absolute top-0 left-0 w-20 h-20 rounded-full border-4 border-transparent border-t-indigo-500 dark:border-t-indigo-400 animate-spin"></div>
          </div>
        </div>
      </SharedLayout>
    );
  }

  return (
    <SharedLayout>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        {/* Confetti Effect */}
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-50">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-confetti"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  animationDuration: `${2 + Math.random() * 1}s`
                }}
              >
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  i % 4 === 0 ? "bg-purple-500" : 
                  i % 4 === 1 ? "bg-blue-500" : 
                  i % 4 === 2 ? "bg-green-500" : "bg-yellow-500"
                )} />
              </div>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link href="/learn" className="touch-target">
                  <Button variant="ghost" size="sm" className="hover:scale-105 transition-transform">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <div>
                  <h1 className="text-lg font-semibold">{languageName || languageCode}</h1>
                  <p className="text-sm text-muted-foreground">{wordsCompleted} words practiced</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {streak > 0 && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "gap-1 transition-all",
                      streak >= 10 ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0" :
                      streak >= 5 ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white border-0" :
                      ""
                    )}
                  >
                    <Zap className="h-3 w-3" />
                    {streak}
                  </Badge>
                )}
                <Link href={`/stats/${languageCode}`} className="touch-target">
                  <Button variant="ghost" size="sm" className="hover:scale-105 transition-transform">
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
          {phase === 'no-words' ? (
            <Card className="max-w-2xl mx-auto shadow-xl">
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
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-indigo-200 dark:border-indigo-800"></div>
                <div className="absolute top-0 left-0 w-20 h-20 rounded-full border-4 border-transparent border-t-indigo-500 dark:border-t-indigo-400 animate-spin"></div>
              </div>
              <p className="text-lg text-muted-foreground mt-6 animate-pulse">Loading next word...</p>
            </div>
          ) : currentWord ? (
            <div className="space-y-6">
              {/* Progress indicator */}
              {phase === 'word' && (
                <div className="max-w-2xl mx-auto">
                  <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 animate-progress" />
                  </div>
                </div>
              )}

              <Card className="max-w-2xl mx-auto shadow-xl overflow-hidden">
                {/* Bucket indicator */}
                {currentWord && (
                  <div className={cn(
                    "h-2",
                    getBucketInfo(currentWord.bucket).color
                  )} />
                )}
                
                <CardContent className="p-6 md:p-8">
                  {phase === 'word' && (
                    <div className="space-y-8">
                      <div className="text-center space-y-4">
                        <div className="flex items-center justify-center gap-2">
                          {currentWord.wordClass && (
                            <Badge variant="secondary" className="text-xs">
                              {currentWord.wordClass}
                            </Badge>
                          )}
                          <Badge 
                            variant="secondary" 
                            className={cn(
                              "text-xs text-white",
                              getBucketInfo(currentWord.bucket).color
                            )}
                          >
                            {getBucketInfo(currentWord.bucket).name}
                          </Badge>
                        </div>
                        
                        <h1 className="text-5xl md:text-6xl font-bold font-crimson text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
                          {currentWord.word}
                        </h1>
                        
                        <p className="text-lg text-muted-foreground">
                          What does this word mean?
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-3">
                        {currentWord.choices.map((choice, index) => (
                          <button
                            key={index}
                            onClick={() => handleAnswer(index)}
                            className={cn(
                              "w-full text-left p-5 rounded-xl",
                              "bg-white dark:bg-gray-800",
                              "border-2 border-gray-200 dark:border-gray-700",
                              "hover:border-indigo-400 dark:hover:border-indigo-500",
                              "hover:bg-indigo-50 dark:hover:bg-indigo-950/20",
                              "hover:shadow-lg hover:shadow-indigo-200/50 dark:hover:shadow-indigo-900/50",
                              "transform hover:scale-[1.02] active:scale-[0.98]",
                              "transition-all duration-200 ease-out",
                              "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
                              "group cursor-pointer"
                            )}
                          >
                            <div className="flex items-start gap-4">
                              <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center font-semibold flex-shrink-0",
                                "bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800",
                                "group-hover:from-indigo-100 group-hover:to-indigo-200 dark:group-hover:from-indigo-900/50 dark:group-hover:to-indigo-800/50",
                                "transition-all duration-200"
                              )}>
                                {String.fromCharCode(65 + index)}
                              </div>
                              <div className="text-base md:text-lg text-gray-700 dark:text-gray-200 leading-relaxed pt-0.5">
                                {choice}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {phase === 'feedback' && (
                    <div className="text-center space-y-8 animate-fadeIn">
                      <div className={cn(
                        "inline-flex p-6 rounded-full",
                        selectedChoice === currentWord.correctIndex 
                          ? "bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20" 
                          : "bg-gradient-to-br from-red-100 to-pink-100 dark:from-red-900/20 dark:to-pink-900/20"
                      )}>
                        {selectedChoice === currentWord.correctIndex ? (
                          <Check className="h-16 w-16 text-green-600 dark:text-green-400" />
                        ) : (
                          <X className="h-16 w-16 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      
                      <div className="space-y-4">
                        <h2 className="text-3xl md:text-4xl font-bold font-crimson">
                          {currentWord.word}
                        </h2>
                        <div className="text-xl text-green-600 dark:text-green-400 font-medium">
                          {currentWord.choices[currentWord.correctIndex]}
                        </div>
                        {selectedChoice !== currentWord.correctIndex && (
                          <div className="text-red-500 dark:text-red-400">
                            You selected: {currentWord.choices[selectedChoice!]}
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={handleContinue}
                        className={cn(
                          "px-8 py-4 rounded-xl font-semibold text-white",
                          "bg-gradient-to-r from-indigo-500 to-purple-500",
                          "hover:from-indigo-600 hover:to-purple-600",
                          "shadow-lg hover:shadow-xl shadow-indigo-500/25 hover:shadow-indigo-600/30",
                          "transform hover:scale-105 active:scale-[0.98]",
                          "transition-all duration-200 ease-out",
                          "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                        )}
                      >
                        Continue Learning
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        @keyframes confetti {
          0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        
        @keyframes progress {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }
        
        @keyframes fadeIn {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-confetti {
          animation: confetti linear;
        }
        
        .animate-progress {
          animation: progress 20s linear;
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        .touch-target {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
      `}</style>
    </SharedLayout>
  );
}