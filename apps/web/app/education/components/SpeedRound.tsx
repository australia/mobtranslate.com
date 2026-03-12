'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, RotateCcw, Trophy, Zap, Timer } from 'lucide-react';
import { cn, Button } from '@mobtranslate/ui';

interface GameWord {
  id: string;
  word: string;
  translation: string;
}

interface SpeedRoundProps {
  words: GameWord[];
  onClose: () => void;
  languageName: string;
}

interface Question {
  word: GameWord;
  options: [string, string];
  correctIndex: number;
}

export default function SpeedRound({ words, onClose, languageName }: SpeedRoundProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const questionStartTime = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const generateQuestions = useCallback(() => {
    const allTranslations = words.map(w => w.translation);
    const shuffledWords = [...words].sort(() => Math.random() - 0.5);

    const newQuestions: Question[] = shuffledWords.map(word => {
      const wrongAnswer = allTranslations
        .filter(t => t !== word.translation)
        .sort(() => Math.random() - 0.5)[0];

      const correctIndex = Math.random() > 0.5 ? 0 : 1;
      const options: [string, string] = correctIndex === 0
        ? [word.translation, wrongAnswer]
        : [wrongAnswer, word.translation];

      return { word, options, correctIndex };
    });

    // Generate enough questions for 60 seconds (repeat if needed)
    const extended: Question[] = [];
    while (extended.length < 60) {
      extended.push(...newQuestions.sort(() => Math.random() - 0.5));
    }

    setQuestions(extended);
    setCurrentIndex(0);
    setScore(0);
    setTimeLeft(60);
    setGameStarted(false);
    setGameComplete(false);
    setAnsweredCount(0);
    setStreak(0);
    setBestStreak(0);
    setLastAnswerCorrect(null);
    setSelectedAnswer(null);
  }, [words]);

  useEffect(() => {
    generateQuestions();
  }, [generateQuestions]);

  useEffect(() => {
    if (gameStarted && !gameComplete) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setGameComplete(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameStarted, gameComplete]);

  const handleAnswer = (index: number) => {
    if (gameComplete || selectedAnswer !== null) return;

    if (!gameStarted) {
      setGameStarted(true);
      questionStartTime.current = Date.now();
    }

    setSelectedAnswer(index);
    const isCorrect = index === questions[currentIndex].correctIndex;
    setLastAnswerCorrect(isCorrect);

    if (isCorrect) {
      const elapsed = (Date.now() - questionStartTime.current) / 1000;
      // Faster answers get more points: max 15, min 5
      const timeBonus = Math.max(5, Math.round(15 - elapsed * 2));
      setScore(prev => prev + timeBonus);
      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak > bestStreak) setBestStreak(newStreak);
    } else {
      setStreak(0);
    }

    setAnsweredCount(prev => prev + 1);

    // Move to next question after brief delay
    setTimeout(() => {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setLastAnswerCorrect(null);
      questionStartTime.current = Date.now();
    }, 400);
  };

  const handleStart = () => {
    setGameStarted(true);
    questionStartTime.current = Date.now();
  };

  const currentQuestion = questions[currentIndex];
  const wpm = gameComplete && answeredCount > 0
    ? Math.round((answeredCount / 60) * 60)
    : 0;

  if (words.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-xl font-bold mb-2">No Words Available</h3>
          <p className="text-muted-foreground mb-4">Add some words to the dictionary to play this game.</p>
          <button onClick={onClose} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">Go Back</button>
        </div>
      </div>
    );
  }

  if (words.length < 2) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-xl font-bold mb-2">Not Enough Words</h3>
          <p className="text-muted-foreground mb-4">Need at least 2 words to play this game. Currently have {words.length}.</p>
          <button onClick={onClose} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">Go Back</button>
        </div>
      </div>
    );
  }

  if (!currentQuestion && !gameComplete) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-4 border-border border-t-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading speed round...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-display font-black">Speed Round</h2>
          <p className="text-muted-foreground">Quick-fire {languageName} vocabulary</p>
        </div>
        <Button
          variant="ghost"
          onClick={onClose}
          className="p-3 rounded-xl bg-muted hover:bg-muted/80"
        >
          <X className="w-6 h-6" />
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-xl",
          timeLeft <= 10 ? "bg-rose-100 text-rose-700 animate-pulse" : "bg-muted"
        )}>
          <Timer className="w-4 h-4" />
          <span className="font-mono font-bold text-lg">{timeLeft}s</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted">
          <Trophy className="w-4 h-4 text-amber-500" />
          <span className="font-bold">{score} pts</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted">
          <span className="font-medium">{answeredCount} answered</span>
        </div>
        {streak > 1 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white animate-pulse">
            <Zap className="w-4 h-4" />
            <span className="font-bold">{streak} streak!</span>
          </div>
        )}
      </div>

      {/* Pre-game Screen */}
      {!gameStarted && !gameComplete && (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-card rounded-3xl border-4 border-foreground p-8 max-w-md w-full text-center shadow-[8px_8px_0px_0px] shadow-foreground">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-6">
              <Timer className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-3xl font-display font-black mb-2">Ready?</h3>
            <p className="text-muted-foreground mb-6">
              You have 60 seconds to answer as many questions as possible.
              Pick the correct translation for each {languageName} word.
              Faster answers earn more points!
            </p>
            <Button
              onClick={handleStart}
              className="px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-lg border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all"
            >
              Start!
            </Button>
          </div>
        </div>
      )}

      {/* Game Area */}
      {gameStarted && !gameComplete && currentQuestion && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
          {/* Timer Bar */}
          <div className="w-full mb-8">
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-1000 ease-linear",
                  timeLeft > 20 ? "bg-gradient-to-r from-emerald-500 to-green-400" :
                  timeLeft > 10 ? "bg-gradient-to-r from-amber-500 to-yellow-400" :
                  "bg-gradient-to-r from-rose-500 to-red-400"
                )}
                style={{ width: `${(timeLeft / 60) * 100}%` }}
              />
            </div>
          </div>

          {/* Word Display */}
          <div className={cn(
            "bg-card rounded-3xl border-4 border-foreground p-8 w-full shadow-[6px_6px_0px_0px] shadow-foreground mb-8 transition-all duration-200",
            lastAnswerCorrect === true && "border-emerald-500",
            lastAnswerCorrect === false && "border-rose-500"
          )}>
            <div className="text-center mb-8">
              <h3 className="text-4xl sm:text-5xl font-display font-black bg-gradient-to-r from-primary to-foreground bg-clip-text text-transparent">
                {currentQuestion.word.word}
              </h3>
              <p className="text-muted-foreground mt-2">What does this mean?</p>
            </div>

            {/* Two Options */}
            <div className="grid grid-cols-2 gap-4">
              {currentQuestion.options.map((option, index) => {
                const isSelected = selectedAnswer === index;
                const isCorrect = index === currentQuestion.correctIndex;
                const showResult = selectedAnswer !== null;

                return (
                  <button
                    key={index}
                    onClick={() => handleAnswer(index)}
                    disabled={selectedAnswer !== null}
                    className={cn(
                      "p-5 rounded-2xl border-3 font-bold text-lg transition-all duration-200",
                      !showResult && "border-border bg-background hover:border-primary hover:bg-muted hover:scale-105 cursor-pointer",
                      showResult && isCorrect && "border-emerald-500 bg-emerald-50",
                      showResult && isSelected && !isCorrect && "border-rose-500 bg-rose-50",
                      showResult && !isSelected && !isCorrect && "border-border bg-muted/50 opacity-50"
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feedback Flash */}
          {lastAnswerCorrect !== null && (
            <div className={cn(
              "text-lg font-bold",
              lastAnswerCorrect ? "text-emerald-600" : "text-rose-600"
            )}>
              {lastAnswerCorrect ? '+points!' : 'Wrong!'}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {gameComplete && (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-card rounded-3xl border-4 border-foreground p-8 max-w-md w-full text-center shadow-[8px_8px_0px_0px] shadow-foreground animate-scale-in">
            <div className="text-6xl mb-4">
              {score >= 100 ? '🏆' : score >= 60 ? '🔥' : '⚡'}
            </div>
            <h3 className="text-3xl font-display font-black mb-2">Time's Up!</h3>
            <p className="text-muted-foreground mb-6">
              {score >= 100 ? 'Incredible speed!' :
               score >= 60 ? 'Great reflexes!' :
               'Keep practicing!'}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-foreground">{score}</div>
                <div className="text-xs text-muted-foreground">Points</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-emerald-600">{answeredCount}</div>
                <div className="text-xs text-muted-foreground">Answered</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-amber-600">{bestStreak}</div>
                <div className="text-xs text-muted-foreground">Best Streak</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-primary">{wpm}</div>
                <div className="text-xs text-muted-foreground">Words/min</div>
              </div>
            </div>

            <div className="flex gap-4">
              <Button
                onClick={generateQuestions}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Play Again
              </Button>
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 px-6 py-3 bg-background text-foreground rounded-xl font-bold border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all"
              >
                Exit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
