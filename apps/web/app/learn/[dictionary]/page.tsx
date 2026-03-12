'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import { Card, CardContent, Button, Badge, cn } from '@mobtranslate/ui';
import { X, Check, AlertCircle, Zap, ArrowLeft, BarChart3, Sparkles, Target, Flame, Trophy, BookOpen, ArrowRight, RefreshCw } from 'lucide-react';
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
  const [correctCount, setCorrectCount] = useState(0);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setCorrectCount(prev => prev + 1);
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

  const accuracy = wordsCompleted > 0 ? Math.round((correctCount / wordsCompleted) * 100) : 0;

  const isCorrectAnswer = selectedChoice !== null && currentWord && selectedChoice === currentWord.correctIndex;

  const encouragingMessages = [
    'Amazing!', 'Well done!', 'Keep it up!', 'You got it!',
    'Brilliant!', 'Excellent!', 'Nice one!', 'Perfect!'
  ];
  const encourageMsg = encouragingMessages[Math.floor(Math.random() * encouragingMessages.length)];

  if (loading) {
    return (
      <SharedLayout>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-border"></div>
            <div className="absolute top-0 left-0 w-20 h-20 rounded-full border-4 border-transparent border-t-primary animate-spin"></div>
          </div>
        </div>
      </SharedLayout>
    );
  }

  return (
    <SharedLayout>
      <div className="min-h-screen bg-background">
        {/* CSS-only Confetti */}
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
            {[...Array(60)].map((_, i) => (
              <div
                key={i}
                className="absolute confetti-piece"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 0.8}s`,
                  animationDuration: `${2 + Math.random() * 1.5}s`
                }}
              >
                <div
                  className={cn(
                    "rounded-sm",
                    i % 6 === 0 ? "w-2 h-3 bg-yellow-400" :
                    i % 6 === 1 ? "w-2 h-2 bg-green-400 rounded-full" :
                    i % 6 === 2 ? "w-3 h-2 bg-blue-400" :
                    i % 6 === 3 ? "w-2 h-2 bg-pink-400 rounded-full" :
                    i % 6 === 4 ? "w-1.5 h-3 bg-purple-400" :
                    "w-2.5 h-2 bg-red-400"
                  )}
                />
              </div>
            ))}
          </div>
        )}

        {/* Sticky Header with progress */}
        <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
          {/* Session progress bar */}
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500 ease-out"
              style={{ width: `${Math.min(wordsCompleted * 5, 100)}%` }}
            />
          </div>

          <div className="max-w-3xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link href="/learn" className="touch-target">
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-xl hover:bg-muted transition-colors">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <div>
                  <h1 className="text-base font-bold leading-tight">{languageName || languageCode}</h1>
                  <p className="text-xs text-muted-foreground">{wordsCompleted} words this session</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Streak badge */}
                {streak > 0 && (
                  <div className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold transition-all duration-300",
                    streak >= 10
                      ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/25"
                      : streak >= 5
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20"
                      : "bg-primary/10 text-primary"
                  )}>
                    <Flame className={cn(
                      "h-3.5 w-3.5",
                      streak >= 5 && "animate-pulse"
                    )} />
                    {streak}
                  </div>
                )}

                <Link href={`/stats/${languageCode}`} className="touch-target">
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-xl hover:bg-muted transition-colors">
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        {wordsCompleted > 0 && (
          <div className="max-w-3xl mx-auto px-4 pt-4">
            <div className="flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{wordsCompleted}</span>
                <span>reviewed</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Flame className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{streak}</span>
                <span>streak</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Target className="h-3.5 w-3.5" />
                <span className={cn(
                  "font-medium",
                  accuracy >= 80 ? "text-green-600" : accuracy >= 50 ? "text-amber-600" : "text-foreground"
                )}>{accuracy}%</span>
                <span>accuracy</span>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
          {/* Loading state - shimmer skeleton */}
          {phase === 'loading' && (
            <div className="max-w-2xl mx-auto">
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="h-1.5 bg-muted shimmer-bg" />
                <div className="p-8 md:p-10 space-y-8">
                  {/* Word placeholder */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-5 w-20 bg-muted rounded-full shimmer-bg" />
                    <div className="h-14 w-56 bg-muted rounded-xl shimmer-bg" />
                    <div className="h-5 w-44 bg-muted rounded shimmer-bg" />
                  </div>
                  {/* Choice placeholders */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-16 bg-muted rounded-xl shimmer-bg" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* No words state */}
          {phase === 'no-words' && (
            <div className="max-w-lg mx-auto text-center">
              <div className="rounded-2xl border border-border bg-card p-10 md:p-14">
                {/* Warm illustration - CSS gradient shapes */}
                <div className="relative w-28 h-28 mx-auto mb-8">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-100 to-orange-100" />
                  <div className="absolute inset-2 rounded-full bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
                    <Trophy className="h-12 w-12 text-amber-500" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-green-400 flex items-center justify-center">
                    <Check className="h-3.5 w-3.5 text-white" />
                  </div>
                </div>

                <h2 className="text-2xl font-bold mb-3">You've reviewed all words!</h2>
                <p className="text-muted-foreground mb-8 leading-relaxed">
                  Great work! Come back later for more practice.
                  Spaced repetition works best with regular short sessions.
                </p>

                {wordsCompleted > 0 && (
                  <div className="flex items-center justify-center gap-6 mb-8 py-4 px-6 rounded-xl bg-muted/50">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">{wordsCompleted}</div>
                      <div className="text-xs text-muted-foreground">reviewed</div>
                    </div>
                    <div className="w-px h-10 bg-border" />
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">{accuracy}%</div>
                      <div className="text-xs text-muted-foreground">accuracy</div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href="/learn">
                    <Button variant="outline" className="gap-2 rounded-xl w-full sm:w-auto">
                      <ArrowLeft className="h-4 w-4" />
                      Other Languages
                    </Button>
                  </Link>
                  <Button
                    onClick={() => fetchNextWord()}
                    className="gap-2 rounded-xl bg-primary text-white hover:bg-primary/90"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Word display and quiz */}
          {(phase === 'word' || phase === 'feedback') && currentWord && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className={cn(
                "rounded-2xl border-2 overflow-hidden transition-all duration-300",
                phase === 'feedback' && isCorrectAnswer
                  ? "border-green-400/50 shadow-lg shadow-green-500/10 correct-flash"
                  : phase === 'feedback' && !isCorrectAnswer
                  ? "border-red-400/50 shadow-lg shadow-red-500/10 incorrect-flash"
                  : "border-border bg-card shadow-xl"
              )}>
                {/* Bucket indicator strip */}
                <div className={cn(
                  "h-1.5 transition-colors duration-300",
                  phase === 'feedback' && isCorrectAnswer
                    ? "bg-gradient-to-r from-green-400 to-emerald-500"
                    : phase === 'feedback' && !isCorrectAnswer
                    ? "bg-gradient-to-r from-red-400 to-pink-500"
                    : getBucketInfo(currentWord.bucket).color
                )} />

                <div className="p-6 md:p-10">
                  {/* Word phase */}
                  {phase === 'word' && (
                    <div className="space-y-8 word-enter">
                      {/* Word display */}
                      <div className="text-center space-y-4">
                        <div className="flex items-center justify-center gap-2">
                          {currentWord.wordClass && (
                            <Badge variant="secondary" className="text-xs rounded-full px-3">
                              {currentWord.wordClass}
                            </Badge>
                          )}
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-xs text-white rounded-full px-3",
                              getBucketInfo(currentWord.bucket).color
                            )}
                          >
                            {getBucketInfo(currentWord.bucket).name}
                          </Badge>
                        </div>

                        <h1 className="text-5xl md:text-7xl font-bold font-display tracking-tight text-foreground py-4">
                          {currentWord.word}
                        </h1>

                        <p className="text-lg text-muted-foreground font-medium">
                          What does this word mean?
                        </p>
                      </div>

                      {/* 2x2 choice grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {currentWord.choices.map((choice, index) => (
                          <button
                            key={index}
                            onClick={() => handleAnswer(index)}
                            className={cn(
                              "relative group text-left p-4 sm:p-5 rounded-xl",
                              "bg-card border-2 border-border",
                              "hover:border-primary/50 hover:bg-primary/5",
                              "active:scale-[0.97] hover:scale-[1.02]",
                              "transition-all duration-150 ease-out",
                              "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2",
                              "cursor-pointer select-none"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0",
                                "bg-muted text-muted-foreground",
                                "group-hover:bg-primary/10 group-hover:text-primary",
                                "transition-all duration-150"
                              )}>
                                {String.fromCharCode(65 + index)}
                              </div>
                              <div className="text-sm md:text-base text-foreground leading-relaxed pt-0.5 font-medium">
                                {choice}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Feedback phase */}
                  {phase === 'feedback' && (
                    <div className="text-center space-y-6 feedback-enter">
                      {/* Result icon */}
                      <div className={cn(
                        "inline-flex items-center justify-center w-20 h-20 rounded-full",
                        isCorrectAnswer
                          ? "bg-green-100 ring-4 ring-green-200/50"
                          : "bg-red-100 ring-4 ring-red-200/50"
                      )}>
                        {isCorrectAnswer ? (
                          <Check className="h-10 w-10 text-green-600 stroke-[3]" />
                        ) : (
                          <X className="h-10 w-10 text-red-600 stroke-[3]" />
                        )}
                      </div>

                      {/* Encouraging text for correct */}
                      {isCorrectAnswer && (
                        <p className="text-lg font-bold text-green-600">{encourageMsg}</p>
                      )}
                      {!isCorrectAnswer && (
                        <p className="text-lg font-bold text-red-500">Not quite</p>
                      )}

                      {/* Word and answer */}
                      <div className="space-y-3">
                        <h2 className="text-3xl md:text-4xl font-bold font-display">
                          {currentWord.word}
                        </h2>

                        {/* Correct answer always shown in green */}
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-50 border border-green-200">
                          <Check className="h-4 w-4 text-green-600" />
                          <span className="text-green-700 font-semibold">
                            {currentWord.choices[currentWord.correctIndex]}
                          </span>
                        </div>

                        {/* Show what they picked if wrong */}
                        {!isCorrectAnswer && selectedChoice !== null && (
                          <div className="block">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200 mt-2">
                              <X className="h-4 w-4 text-red-500" />
                              <span className="text-red-600 text-sm">
                                You chose: {currentWord.choices[selectedChoice]}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Continue button */}
                      <div className="pt-4">
                        <Button
                          onClick={handleContinue}
                          className={cn(
                            "px-8 py-3 h-auto rounded-xl font-bold text-white text-base",
                            "bg-gradient-to-r from-primary to-primary/80",
                            "hover:from-primary/90 hover:to-primary/70",
                            "shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30",
                            "transform hover:scale-105 active:scale-[0.97]",
                            "transition-all duration-200 ease-out",
                            "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2",
                            "gap-2"
                          )}
                        >
                          Continue
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-100vh) rotate(0deg) scale(1);
            opacity: 1;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg) scale(0.5);
            opacity: 0;
          }
        }

        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }

        @keyframes word-enter {
          0% {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes feedback-enter {
          0% {
            opacity: 0;
            transform: scale(0.95);
          }
          50% {
            transform: scale(1.02);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes correct-flash {
          0% {
            background-color: rgba(34, 197, 94, 0.12);
          }
          100% {
            background-color: transparent;
          }
        }

        @keyframes incorrect-flash {
          0% {
            background-color: rgba(239, 68, 68, 0.12);
          }
          100% {
            background-color: transparent;
          }
        }

        .confetti-piece {
          animation: confetti-fall linear forwards;
        }

        .shimmer-bg {
          background: linear-gradient(
            90deg,
            hsl(var(--muted)) 25%,
            hsl(var(--muted-foreground) / 0.08) 50%,
            hsl(var(--muted)) 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }

        .word-enter {
          animation: word-enter 0.35s ease-out;
        }

        .feedback-enter {
          animation: feedback-enter 0.35s ease-out;
        }

        .correct-flash {
          animation: correct-flash 0.6s ease-out;
        }

        .incorrect-flash {
          animation: incorrect-flash 0.6s ease-out;
        }

        .touch-target {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
      `}</style>
    </SharedLayout>
  );
}
