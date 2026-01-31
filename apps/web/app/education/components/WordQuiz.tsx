'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Check, ChevronRight, Trophy, Zap, Target, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GameWord {
  id: string;
  word: string;
  translation: string;
  definition?: string;
  wordClass?: string;
}

interface WordQuizProps {
  words: GameWord[];
  onClose: () => void;
  languageName: string;
}

interface Question {
  word: GameWord;
  options: string[];
  correctIndex: number;
}

export default function WordQuiz({ words, onClose, languageName }: WordQuizProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [gameComplete, setGameComplete] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const generateQuestions = useCallback(() => {
    const quizWords = words.slice(0, 10);
    const allTranslations = words.map(w => w.translation);

    const newQuestions: Question[] = quizWords.map(word => {
      // Get 3 random wrong answers
      const wrongAnswers = allTranslations
        .filter(t => t !== word.translation)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      // Create options array with correct answer
      const options = [...wrongAnswers, word.translation].sort(() => Math.random() - 0.5);
      const correctIndex = options.indexOf(word.translation);

      return { word, options, correctIndex };
    });

    setQuestions(newQuestions);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setScore(0);
    setStreak(0);
    setGameComplete(false);
  }, [words]);

  useEffect(() => {
    generateQuestions();
  }, [generateQuestions]);

  const handleAnswer = (index: number) => {
    if (isAnswered) return;

    setSelectedAnswer(index);
    setIsAnswered(true);

    const isCorrect = index === questions[currentIndex].correctIndex;

    if (isCorrect) {
      setScore(prev => prev + 1);
      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak > bestStreak) setBestStreak(newStreak);
      if (newStreak % 3 === 0) setShowConfetti(true);
    } else {
      setStreak(0);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setIsAnswered(false);
      setShowConfetti(false);
    } else {
      setGameComplete(true);
    }
  };

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + (isAnswered ? 1 : 0)) / questions.length) * 100;

  if (!currentQuestion && !gameComplete) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-4 border-gray-200 border-t-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading quiz...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-display font-black">Word Quiz</h2>
          <p className="text-muted-foreground">Test your {languageName} vocabulary</p>
        </div>
        <button
          onClick={onClose}
          className="p-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="font-medium">Question {currentIndex + 1} of {questions.length}</span>
          <span className="text-muted-foreground">{Math.round(progress)}% complete</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-gray-700 to-gray-800 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-100 text-emerald-700">
          <Trophy className="w-4 h-4" />
          <span className="font-bold">{score} correct</span>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white animate-pulse">
            <Zap className="w-4 h-4" />
            <span className="font-bold">{streak} streak!</span>
          </div>
        )}
      </div>

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${2 + Math.random()}s`
              }}
            >
              <div className={cn(
                "w-3 h-3 rounded-full",
                i % 4 === 0 ? "bg-gray-500" :
                i % 4 === 1 ? "bg-amber-500" :
                i % 4 === 2 ? "bg-emerald-500" : "bg-rose-500"
              )} />
            </div>
          ))}
        </div>
      )}

      {/* Quiz Card */}
      {!gameComplete && currentQuestion && (
        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
          <div className="bg-card rounded-3xl border-4 border-foreground p-8 shadow-[6px_6px_0px_0px] shadow-foreground">
            {/* Word Display */}
            <div className="text-center mb-8">
              {currentQuestion.word.wordClass && (
                <span className="inline-block px-3 py-1 bg-muted rounded-full text-xs font-medium text-muted-foreground mb-3">
                  {currentQuestion.word.wordClass}
                </span>
              )}
              <h3 className="text-4xl sm:text-5xl font-display font-black bg-gradient-to-r from-blue-700 to-gray-800 bg-clip-text text-transparent mb-4">
                {currentQuestion.word.word}
              </h3>
              <p className="text-lg text-muted-foreground">What does this word mean?</p>
            </div>

            {/* Options */}
            <div className="space-y-3">
              {currentQuestion.options.map((option, index) => {
                const isSelected = selectedAnswer === index;
                const isCorrect = index === currentQuestion.correctIndex;
                const showResult = isAnswered;

                return (
                  <button
                    key={index}
                    onClick={() => handleAnswer(index)}
                    disabled={isAnswered}
                    className={cn(
                      "w-full text-left p-5 rounded-2xl border-2 transition-all duration-300",
                      !showResult && "hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-950/20",
                      !showResult && !isSelected && "border-border bg-background",
                      showResult && isCorrect && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
                      showResult && isSelected && !isCorrect && "border-rose-500 bg-rose-50 dark:bg-rose-950/30",
                      showResult && !isSelected && !isCorrect && "border-border bg-muted/50 opacity-50"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                        !showResult && "bg-muted",
                        showResult && isCorrect && "bg-emerald-500 text-white",
                        showResult && isSelected && !isCorrect && "bg-rose-500 text-white"
                      )}>
                        {showResult && isCorrect ? (
                          <Check className="w-5 h-5" />
                        ) : showResult && isSelected && !isCorrect ? (
                          <X className="w-5 h-5" />
                        ) : (
                          String.fromCharCode(65 + index)
                        )}
                      </div>
                      <span className={cn(
                        "text-lg",
                        showResult && isCorrect && "font-bold text-emerald-700 dark:text-emerald-400"
                      )}>
                        {option}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Next Button */}
            {isAnswered && (
              <button
                onClick={handleNext}
                className="mt-8 w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-lg border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all animate-slide-in"
              >
                {currentIndex < questions.length - 1 ? 'Next Question' : 'See Results'}
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results Modal */}
      {gameComplete && (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-card rounded-3xl border-4 border-foreground p-8 max-w-md w-full text-center shadow-[8px_8px_0px_0px] shadow-foreground animate-scale-in">
            <div className="text-6xl mb-4">
              {score >= 8 ? '🏆' : score >= 5 ? '🎉' : '💪'}
            </div>
            <h3 className="text-3xl font-display font-black mb-2">Quiz Complete!</h3>
            <p className="text-muted-foreground mb-6">
              {score >= 8 ? 'Outstanding performance!' :
               score >= 5 ? 'Great job!' :
               'Keep practicing!'}
            </p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-emerald-600">{score}/{questions.length}</div>
                <div className="text-xs text-muted-foreground">Score</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-gray-800">{Math.round((score / questions.length) * 100)}%</div>
                <div className="text-xs text-muted-foreground">Accuracy</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-amber-600">{bestStreak}</div>
                <div className="text-xs text-muted-foreground">Best Streak</div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={generateQuestions}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Play Again
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 bg-background text-foreground rounded-xl font-bold border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes confetti {
          0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti 2s linear forwards;
        }
      `}</style>
    </div>
  );
}
