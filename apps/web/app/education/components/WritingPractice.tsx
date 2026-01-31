'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, RotateCcw, ChevronRight, Trophy, Zap, Check, Lightbulb, Delete, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GameWord {
  id: string;
  word: string;
  translation: string;
}

interface WritingPracticeProps {
  words: GameWord[];
  onClose: () => void;
  languageName: string;
}

export default function WritingPractice({ words, onClose, languageName }: WritingPracticeProps) {
  const [gameWords, setGameWords] = useState<GameWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [revealedHints, setRevealedHints] = useState<number[]>([]);
  const [gameComplete, setGameComplete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initializeGame = useCallback(() => {
    const shuffled = [...words].sort(() => Math.random() - 0.5).slice(0, 10);
    setGameWords(shuffled);
    setCurrentIndex(0);
    setUserInput('');
    setScore(0);
    setStreak(0);
    setHintsUsed(0);
    setGameComplete(false);
    setIsCorrect(null);
    setShowHint(false);
    setRevealedHints([]);
  }, [words]);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  useEffect(() => {
    // Focus input on new word
    if (inputRef.current && isCorrect === null) {
      inputRef.current.focus();
    }
  }, [currentIndex, isCorrect]);

  const currentWord = gameWords[currentIndex];

  const normalizeString = (str: string) => {
    return str
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/['']/g, "'"); // Normalize apostrophes
  };

  const handleSubmit = () => {
    if (!currentWord || isCorrect !== null) return;

    const normalizedInput = normalizeString(userInput);
    const normalizedWord = normalizeString(currentWord.word);
    const correct = normalizedInput === normalizedWord;

    setIsCorrect(correct);

    if (correct) {
      const points = revealedHints.length === 0 ? 15 : Math.max(5, 15 - revealedHints.length * 2);
      setScore(prev => prev + points);
      setStreak(prev => prev + 1);
    } else {
      setStreak(0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && userInput.length > 0 && isCorrect === null) {
      handleSubmit();
    }
  };

  const handleNext = () => {
    if (currentIndex < gameWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setUserInput('');
      setIsCorrect(null);
      setShowHint(false);
      setRevealedHints([]);
    } else {
      setGameComplete(true);
    }
  };

  const handleHint = () => {
    if (!currentWord || isCorrect !== null) return;

    // Reveal next letter
    const nextHintIndex = revealedHints.length;
    if (nextHintIndex < currentWord.word.length) {
      setRevealedHints(prev => [...prev, nextHintIndex]);
      setHintsUsed(prev => prev + 1);
      setShowHint(true);
    }
  };

  const renderHintWord = () => {
    if (!currentWord) return null;

    return (
      <div className="flex justify-center gap-1 flex-wrap">
        {currentWord.word.split('').map((char, index) => {
          const isRevealed = revealedHints.includes(index);
          return (
            <span
              key={index}
              className={cn(
                "w-8 h-10 flex items-center justify-center rounded-lg border-2 font-mono text-lg font-bold",
                isRevealed
                  ? "bg-amber-100 border-amber-300 text-amber-700"
                  : "bg-muted border-muted-foreground/30 text-transparent"
              )}
            >
              {isRevealed ? char : '_'}
            </span>
          );
        })}
      </div>
    );
  };

  // Character buttons for special characters
  const specialChars = ["'", "'", "á", "é", "í", "ó", "ú", "ñ"];

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
          <h2 className="text-3xl font-display font-black">Writing Practice</h2>
          <p className="text-muted-foreground">Practice spelling {languageName} words</p>
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
          {/* Translation Prompt */}
          <div className="text-center mb-8">
            <p className="text-muted-foreground text-sm mb-2">Write the {languageName} word for:</p>
            <p className="text-3xl sm:text-4xl font-display font-black text-primary">
              "{currentWord.translation}"
            </p>
          </div>

          {/* Hint Display */}
          {showHint && (
            <div className="mb-6">
              {renderHintWord()}
              <p className="text-center text-sm text-amber-600 mt-2">
                {revealedHints.length} letter{revealedHints.length !== 1 ? 's' : ''} revealed
              </p>
            </div>
          )}

          {/* Input Area */}
          <div className="w-full max-w-md mb-6">
            <div className={cn(
              "relative rounded-2xl border-4 transition-all duration-300",
              isCorrect === true && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
              isCorrect === false && "border-rose-500 bg-rose-50 dark:bg-rose-950/30",
              isCorrect === null && "border-foreground bg-background focus-within:border-primary"
            )}>
              <input
                ref={inputRef}
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isCorrect !== null}
                placeholder="Type your answer..."
                className={cn(
                  "w-full px-6 py-4 text-2xl font-bold text-center bg-transparent outline-none",
                  isCorrect === true && "text-emerald-700",
                  isCorrect === false && "text-rose-700"
                )}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              {isCorrect === true && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Check className="w-6 h-6 text-emerald-600" />
                </div>
              )}
            </div>

            {/* Special Characters */}
            <div className="flex justify-center gap-2 mt-4 flex-wrap">
              {specialChars.map((char) => (
                <button
                  key={char}
                  onClick={() => setUserInput(prev => prev + char)}
                  disabled={isCorrect !== null}
                  className="w-10 h-10 rounded-lg border-2 border-foreground bg-card font-bold text-lg hover:bg-accent/20 disabled:opacity-50 transition-colors"
                >
                  {char}
                </button>
              ))}
              <button
                onClick={() => setUserInput(prev => prev.slice(0, -1))}
                disabled={isCorrect !== null || userInput.length === 0}
                className="w-10 h-10 rounded-lg border-2 border-foreground bg-muted hover:bg-muted/80 disabled:opacity-50 transition-colors"
              >
                <Delete className="w-5 h-5 mx-auto" />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          {isCorrect === null ? (
            <div className="flex items-center gap-4">
              <button
                onClick={handleHint}
                disabled={revealedHints.length >= currentWord.word.length}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 transition-colors"
              >
                <Lightbulb className="w-4 h-4" />
                Hint ({currentWord.word.length - revealedHints.length} left)
              </button>
              <button
                onClick={handleSubmit}
                disabled={userInput.length === 0}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all disabled:opacity-50"
              >
                Check
                <CornerDownLeft className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="text-center">
              <p className={cn(
                "text-lg font-bold mb-2",
                isCorrect ? "text-emerald-600" : "text-rose-600"
              )}>
                {isCorrect ? '✍️ Perfect spelling!' : '❌ Not quite right'}
              </p>
              {!isCorrect && (
                <p className="text-muted-foreground mb-4">
                  Correct: <span className="font-bold text-foreground">{currentWord.word}</span>
                </p>
              )}
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
            <div className="text-6xl mb-4">✍️</div>
            <h3 className="text-3xl font-display font-black mb-2">Practice Complete!</h3>
            <p className="text-muted-foreground mb-6">Great writing practice!</p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-gray-800">{score}</div>
                <div className="text-xs text-muted-foreground">Points</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-emerald-600">{Math.round((score / (gameWords.length * 15)) * 100)}%</div>
                <div className="text-xs text-muted-foreground">Score</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-amber-600">{hintsUsed}</div>
                <div className="text-xs text-muted-foreground">Hints</div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={initializeGame}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Practice Again
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
