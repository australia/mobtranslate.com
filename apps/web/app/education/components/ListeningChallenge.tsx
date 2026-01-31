'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Volume2, VolumeX, RotateCcw, ChevronRight, Trophy, Zap, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GameWord {
  id: string;
  word: string;
  translation: string;
}

interface ListeningChallengeProps {
  words: GameWord[];
  onClose: () => void;
  languageName: string;
}

export default function ListeningChallenge({ words, onClose, languageName }: ListeningChallengeProps) {
  const [gameWords, setGameWords] = useState<GameWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [options, setOptions] = useState<GameWord[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playCount, setPlayCount] = useState(0);
  const [gameComplete, setGameComplete] = useState(false);
  const synth = useRef<SpeechSynthesis | null>(null);

  const initializeGame = useCallback(() => {
    const shuffled = [...words].sort(() => Math.random() - 0.5).slice(0, 10);
    setGameWords(shuffled);
    setCurrentIndex(0);
    setScore(0);
    setStreak(0);
    setGameComplete(false);
    if (shuffled.length > 0) {
      generateOptions(shuffled[0], shuffled);
    }
  }, [words]);

  const generateOptions = (correctWord: GameWord, allWords: GameWord[]) => {
    const wrongOptions = allWords
      .filter(w => w.id !== correctWord.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const allOptions = [correctWord, ...wrongOptions].sort(() => Math.random() - 0.5);
    setOptions(allOptions);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setPlayCount(0);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synth.current = window.speechSynthesis;
    }
    initializeGame();
  }, [initializeGame]);

  const currentWord = gameWords[currentIndex];

  const playAudio = () => {
    if (!currentWord || !synth.current || isPlaying) return;

    // Cancel any ongoing speech
    synth.current.cancel();

    const utterance = new SpeechSynthesisUtterance(currentWord.word);
    utterance.rate = 0.8;
    utterance.pitch = 1;

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => {
      setIsPlaying(false);
      setPlayCount(prev => prev + 1);
    };
    utterance.onerror = () => setIsPlaying(false);

    synth.current.speak(utterance);
  };

  const handleAnswer = (word: GameWord) => {
    if (isCorrect !== null) return;

    setSelectedAnswer(word.id);
    const correct = word.id === currentWord.id;
    setIsCorrect(correct);

    if (correct) {
      // More points for fewer plays
      const points = playCount <= 1 ? 15 : playCount === 2 ? 10 : 5;
      setScore(prev => prev + points);
      setStreak(prev => prev + 1);
    } else {
      setStreak(0);
    }
  };

  const handleNext = () => {
    if (currentIndex < gameWords.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      generateOptions(gameWords[nextIndex], gameWords);
    } else {
      setGameComplete(true);
    }
  };

  // Auto-play on new word
  useEffect(() => {
    if (currentWord && isCorrect === null) {
      const timer = setTimeout(playAudio, 500);
      return () => clearTimeout(timer);
    }
  }, [currentIndex]);

  if (!currentWord && !gameComplete) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-display font-black">Listening Challenge</h2>
          <p className="text-muted-foreground">Listen and identify {languageName} words</p>
        </div>
        <button
          onClick={onClose}
          className="p-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted">
          <Trophy className="w-4 h-4 text-amber-500" />
          <span className="font-bold">{score} pts</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted">
          <span className="font-medium">{currentIndex + 1}/{gameWords.length}</span>
        </div>
        {streak > 1 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white animate-pulse">
            <Zap className="w-4 h-4" />
            <span className="font-bold">{streak} streak!</span>
          </div>
        )}
      </div>

      {!gameComplete && currentWord ? (
        <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
          {/* Audio Player */}
          <div className="mb-12">
            <button
              onClick={playAudio}
              disabled={isPlaying}
              className={cn(
                "w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300",
                "border-4 border-foreground shadow-[6px_6px_0px_0px] shadow-foreground",
                isPlaying
                  ? "bg-gradient-to-br from-cyan-400 to-blue-500 scale-110"
                  : "bg-gradient-to-br from-blue-600 to-gray-800 hover:scale-105 cursor-pointer"
              )}
            >
              {isPlaying ? (
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-2 h-8 bg-white rounded-full animate-pulse"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              ) : (
                <Volume2 className="w-12 h-12 text-white" />
              )}
            </button>
            <p className="text-center mt-4 text-muted-foreground">
              {isPlaying ? 'Playing...' : 'Tap to play'}
            </p>
            {playCount > 0 && isCorrect === null && (
              <p className="text-center text-sm text-muted-foreground mt-1">
                Played {playCount} time{playCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Question */}
          <p className="text-xl font-medium text-center mb-8">
            Which word did you hear?
          </p>

          {/* Options */}
          <div className="w-full grid grid-cols-2 gap-4 mb-8">
            {options.map((option) => {
              const isSelected = selectedAnswer === option.id;
              const isCorrectOption = option.id === currentWord.id;
              const showResult = isCorrect !== null;

              return (
                <button
                  key={option.id}
                  onClick={() => handleAnswer(option)}
                  disabled={isCorrect !== null}
                  className={cn(
                    "p-6 rounded-2xl border-2 transition-all duration-300 text-left",
                    !showResult && "hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-950/20",
                    !showResult && "border-border bg-card",
                    showResult && isCorrectOption && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
                    showResult && isSelected && !isCorrectOption && "border-rose-500 bg-rose-50 dark:bg-rose-950/30",
                    showResult && !isSelected && !isCorrectOption && "border-border bg-muted/50 opacity-50"
                  )}
                >
                  <div className="font-bold text-lg mb-1">{option.word}</div>
                  <div className="text-sm text-muted-foreground">{option.translation}</div>
                </button>
              );
            })}
          </div>

          {/* Next Button */}
          {isCorrect !== null && (
            <div className="text-center">
              <p className={cn(
                "text-lg font-bold mb-4",
                isCorrect ? "text-emerald-600" : "text-rose-600"
              )}>
                {isCorrect ? '🎧 Correct!' : `❌ It was: ${currentWord.word}`}
              </p>
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all"
              >
                {currentIndex < gameWords.length - 1 ? 'Next Word' : 'See Results'}
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Results */
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-card rounded-3xl border-4 border-foreground p-8 max-w-md w-full text-center shadow-[8px_8px_0px_0px] shadow-foreground animate-scale-in">
            <div className="text-6xl mb-4">🎧</div>
            <h3 className="text-3xl font-display font-black mb-2">Challenge Complete!</h3>
            <p className="text-muted-foreground mb-6">Great listening skills!</p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-gray-800">{score}</div>
                <div className="text-xs text-muted-foreground">Points</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-emerald-600">{Math.round((score / (gameWords.length * 15)) * 100)}%</div>
                <div className="text-xs text-muted-foreground">Accuracy</div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={initializeGame}
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
    </div>
  );
}
