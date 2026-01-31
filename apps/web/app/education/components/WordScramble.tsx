'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Lightbulb, ChevronRight, Trophy, Zap, Clock, Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GameWord {
  id: string;
  word: string;
  translation: string;
}

interface WordScrambleProps {
  words: GameWord[];
  onClose: () => void;
  languageName: string;
}

interface Letter {
  char: string;
  id: string;
  originalIndex: number;
}

export default function WordScramble({ words, onClose, languageName }: WordScrambleProps) {
  const [gameWords, setGameWords] = useState<GameWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scrambledLetters, setScrambledLetters] = useState<Letter[]>([]);
  const [selectedLetters, setSelectedLetters] = useState<Letter[]>([]);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timer, setTimer] = useState(0);
  const [gameComplete, setGameComplete] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const initializeGame = useCallback(() => {
    // Filter words that are good for scrambling (3-12 letters)
    const validWords = words.filter(w => w.word.length >= 3 && w.word.length <= 12);
    const shuffled = [...validWords].sort(() => Math.random() - 0.5).slice(0, 8);
    setGameWords(shuffled);
    setCurrentIndex(0);
    setScore(0);
    setStreak(0);
    setHintsUsed(0);
    setTimer(0);
    setGameComplete(false);
    if (shuffled.length > 0) {
      scrambleWord(shuffled[0].word);
    }
  }, [words]);

  const scrambleWord = (word: string) => {
    const letters: Letter[] = word.split('').map((char, index) => ({
      char,
      id: `${char}-${index}-${Math.random()}`,
      originalIndex: index,
    }));

    // Shuffle until it's different from original
    let shuffled = [...letters];
    do {
      shuffled = shuffled.sort(() => Math.random() - 0.5);
    } while (shuffled.map(l => l.char).join('') === word && word.length > 1);

    setScrambledLetters(shuffled);
    setSelectedLetters([]);
    setIsCorrect(null);
    setShowHint(false);
  };

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (!gameComplete && gameWords.length > 0) {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameComplete, gameWords.length]);

  const currentWord = gameWords[currentIndex];

  const handleLetterClick = (letter: Letter, fromSelected: boolean) => {
    if (isCorrect !== null) return;

    if (fromSelected) {
      // Move back to scrambled
      setSelectedLetters(prev => prev.filter(l => l.id !== letter.id));
      setScrambledLetters(prev => [...prev, letter]);
    } else {
      // Move to selected
      setScrambledLetters(prev => prev.filter(l => l.id !== letter.id));
      setSelectedLetters(prev => [...prev, letter]);
    }
  };

  useEffect(() => {
    if (!currentWord) return;

    // Check if answer is complete
    if (selectedLetters.length === currentWord.word.length) {
      const answer = selectedLetters.map(l => l.char).join('');
      const correct = answer.toLowerCase() === currentWord.word.toLowerCase();
      setIsCorrect(correct);

      if (correct) {
        setScore(prev => prev + (showHint ? 5 : 10));
        setStreak(prev => prev + 1);
      } else {
        setStreak(0);
      }
    }
  }, [selectedLetters, currentWord, showHint]);

  const handleNext = () => {
    if (currentIndex < gameWords.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      scrambleWord(gameWords[nextIndex].word);
    } else {
      setGameComplete(true);
    }
  };

  const handleHint = () => {
    if (!currentWord || showHint) return;
    setShowHint(true);
    setHintsUsed(prev => prev + 1);
  };

  const handleReshuffle = () => {
    if (!currentWord || isCorrect !== null) return;
    // Put all letters back and reshuffle
    const allLetters = [...scrambledLetters, ...selectedLetters];
    setSelectedLetters([]);
    const shuffled = allLetters.sort(() => Math.random() - 0.5);
    setScrambledLetters(shuffled);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
          <h2 className="text-3xl font-display font-black">Word Scramble</h2>
          <p className="text-muted-foreground">Unscramble {languageName} words</p>
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
          <Clock className="w-4 h-4 text-gray-700" />
          <span className="font-mono font-bold">{formatTime(timer)}</span>
        </div>
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
          {/* Translation Hint */}
          <div className="text-center mb-8">
            <p className="text-muted-foreground text-sm mb-2">Unscramble to spell:</p>
            <p className="text-2xl font-bold text-primary">"{currentWord.translation}"</p>
            {showHint && (
              <p className="mt-2 text-sm text-amber-600">
                First letter: <span className="font-bold">{currentWord.word[0].toUpperCase()}</span>
              </p>
            )}
          </div>

          {/* Selected Letters (Answer) */}
          <div className="w-full mb-8">
            <div className="flex justify-center gap-2 min-h-[72px] p-4 rounded-2xl border-4 border-dashed border-muted-foreground/30 bg-muted/30">
              {selectedLetters.length === 0 ? (
                <span className="text-muted-foreground self-center">Tap letters below to spell the word</span>
              ) : (
                selectedLetters.map((letter, index) => (
                  <button
                    key={letter.id}
                    onClick={() => handleLetterClick(letter, true)}
                    disabled={isCorrect !== null}
                    className={cn(
                      "w-12 h-14 sm:w-14 sm:h-16 rounded-xl border-2 font-bold text-xl sm:text-2xl uppercase transition-all",
                      isCorrect === true && "bg-emerald-500 border-emerald-600 text-white",
                      isCorrect === false && "bg-rose-500 border-rose-600 text-white",
                      isCorrect === null && "bg-primary text-primary-foreground border-foreground hover:scale-105 cursor-pointer"
                    )}
                    style={{
                      boxShadow: isCorrect === null ? '3px 3px 0px 0px var(--color-foreground)' : 'none',
                      animationDelay: `${index * 50}ms`,
                    }}
                  >
                    {letter.char}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Scrambled Letters */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {scrambledLetters.map((letter) => (
              <button
                key={letter.id}
                onClick={() => handleLetterClick(letter, false)}
                disabled={isCorrect !== null}
                className="w-12 h-14 sm:w-14 sm:h-16 rounded-xl border-2 border-foreground bg-card font-bold text-xl sm:text-2xl uppercase transition-all hover:scale-105 hover:bg-accent/20 disabled:opacity-50"
                style={{ boxShadow: '3px 3px 0px 0px var(--color-foreground)' }}
              >
                {letter.char}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-4">
            {isCorrect === null ? (
              <>
                <button
                  onClick={handleReshuffle}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
                >
                  <Shuffle className="w-4 h-4" />
                  Reshuffle
                </button>
                <button
                  onClick={handleHint}
                  disabled={showHint}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 transition-colors"
                >
                  <Lightbulb className="w-4 h-4" />
                  Hint
                </button>
              </>
            ) : (
              <div className="text-center">
                <p className={cn(
                  "text-lg font-bold mb-4",
                  isCorrect ? "text-emerald-600" : "text-rose-600"
                )}>
                  {isCorrect ? '🎉 Correct!' : `❌ The word was: ${currentWord.word}`}
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
        </div>
      ) : (
        /* Results */
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-card rounded-3xl border-4 border-foreground p-8 max-w-md w-full text-center shadow-[8px_8px_0px_0px] shadow-foreground animate-scale-in">
            <div className="text-6xl mb-4">🧩</div>
            <h3 className="text-3xl font-display font-black mb-2">Game Complete!</h3>
            <p className="text-muted-foreground mb-6">Great unscrambling skills!</p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-gray-800">{score}</div>
                <div className="text-xs text-muted-foreground">Points</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-amber-600">{formatTime(timer)}</div>
                <div className="text-xs text-muted-foreground">Time</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-emerald-600">{hintsUsed}</div>
                <div className="text-xs text-muted-foreground">Hints</div>
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
