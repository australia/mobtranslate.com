'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, ChevronRight, Trophy, Zap, Lightbulb, Delete } from 'lucide-react';
import { cn, Button } from '@mobtranslate/ui';

interface GameWord {
  id: string;
  word: string;
  translation: string;
}

interface WordBuilderProps {
  words: GameWord[];
  onClose: () => void;
  languageName: string;
}

interface LetterButton {
  char: string;
  id: string;
  used: boolean;
}

export default function WordBuilder({ words, onClose, languageName }: WordBuilderProps) {
  const [gameWords, setGameWords] = useState<GameWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [letterButtons, setLetterButtons] = useState<LetterButton[]>([]);
  const [placedLetters, setPlacedLetters] = useState<(LetterButton | null)[]>([]);
  const [currentSlot, setCurrentSlot] = useState(0);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [shakeSlot, setShakeSlot] = useState<number | null>(null);
  const [gameComplete, setGameComplete] = useState(false);

  const initializeGame = useCallback(() => {
    const validWords = words.filter(w => w.word.length >= 3 && w.word.length <= 15);
    const shuffled = [...validWords].sort(() => Math.random() - 0.5).slice(0, 8);
    setGameWords(shuffled);
    setCurrentIndex(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setHintsUsed(0);
    setGameComplete(false);
    if (shuffled.length > 0) {
      setupWord(shuffled[0]);
    }
  }, [words]);

  const setupWord = (word: GameWord) => {
    const chars = word.word.split('');
    const totalLetters = chars.length;

    // Create letter buttons: the correct letters plus some extras
    const extraChars = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const extraCount = Math.min(4, Math.max(2, Math.floor(totalLetters * 0.5)));
    const extras = extraChars
      .filter(c => !chars.includes(c.toLowerCase()))
      .sort(() => Math.random() - 0.5)
      .slice(0, extraCount);

    const allChars = [...chars, ...extras];
    const buttons: LetterButton[] = allChars
      .sort(() => Math.random() - 0.5)
      .map((char, index) => ({
        char,
        id: `${char}-${index}-${Math.random()}`,
        used: false,
      }));

    setLetterButtons(buttons);
    setPlacedLetters(new Array(totalLetters).fill(null));
    setCurrentSlot(0);
    setIsCorrect(null);
    setShakeSlot(null);
  };

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  const currentWord = gameWords[currentIndex];

  const handleLetterClick = (letter: LetterButton) => {
    if (isCorrect !== null || letter.used) return;
    if (!currentWord) return;

    const targetChar = currentWord.word[currentSlot];

    // Check if the letter is correct for current position
    if (letter.char.toLowerCase() === targetChar.toLowerCase()) {
      // Correct letter placement
      const newPlaced = [...placedLetters];
      newPlaced[currentSlot] = letter;
      setPlacedLetters(newPlaced);

      setLetterButtons(prev =>
        prev.map(l => l.id === letter.id ? { ...l, used: true } : l)
      );

      const nextSlot = currentSlot + 1;

      // Check if word is complete
      if (nextSlot >= currentWord.word.length) {
        setIsCorrect(true);
        const points = Math.max(5, 15 - hintsUsed * 2);
        setScore(prev => prev + points);
        const newStreak = streak + 1;
        setStreak(newStreak);
        if (newStreak > bestStreak) setBestStreak(newStreak);
      } else {
        setCurrentSlot(nextSlot);
      }
    } else {
      // Wrong letter - shake animation
      setShakeSlot(currentSlot);
      setTimeout(() => setShakeSlot(null), 500);
    }
  };

  const handleRemoveLast = () => {
    if (isCorrect !== null || currentSlot === 0) return;

    const prevSlot = currentSlot - 1;
    const removedLetter = placedLetters[prevSlot];

    if (removedLetter) {
      setLetterButtons(prev =>
        prev.map(l => l.id === removedLetter.id ? { ...l, used: false } : l)
      );
    }

    const newPlaced = [...placedLetters];
    newPlaced[prevSlot] = null;
    setPlacedLetters(newPlaced);
    setCurrentSlot(prevSlot);
  };

  const handleHint = () => {
    if (!currentWord || isCorrect !== null) return;

    // Reveal the next letter
    const targetChar = currentWord.word[currentSlot];
    const matchingButton = letterButtons.find(
      l => !l.used && l.char.toLowerCase() === targetChar.toLowerCase()
    );

    if (matchingButton) {
      setHintsUsed(prev => prev + 1);
      handleLetterClick(matchingButton);
    }
  };

  const handleNext = () => {
    if (currentIndex < gameWords.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setupWord(gameWords[nextIndex]);
    } else {
      setGameComplete(true);
    }
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
          <h2 className="text-3xl font-display font-black">Word Builder</h2>
          <p className="text-muted-foreground">Build {languageName} words letter by letter</p>
        </div>
        <Button
          variant="ghost"
          onClick={onClose}
          className="p-3 rounded-xl bg-muted hover:bg-muted/80"
        >
          <X className="w-6 h-6" />
        </Button>
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

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${((currentIndex + (isCorrect ? 1 : 0)) / gameWords.length) * 100}%` }}
          />
        </div>
      </div>

      {!gameComplete && currentWord ? (
        <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
          {/* Translation Prompt */}
          <div className="text-center mb-8">
            <p className="text-muted-foreground text-sm mb-2">Build the {languageName} word for:</p>
            <p className="text-3xl sm:text-4xl font-display font-black text-primary">
              &quot;{currentWord.translation}&quot;
            </p>
          </div>

          {/* Letter Slots */}
          <div className="flex justify-center gap-2 flex-wrap mb-10">
            {placedLetters.map((letter, index) => {
              const isCurrent = index === currentSlot && isCorrect === null;
              const isFilled = letter !== null;
              const isShaking = shakeSlot === index;

              return (
                <div
                  key={index}
                  className={cn(
                    "w-12 h-14 sm:w-14 sm:h-16 rounded-xl border-3 flex items-center justify-center font-bold text-xl sm:text-2xl uppercase transition-all duration-200",
                    isFilled && "bg-primary/10 border-primary text-primary",
                    !isFilled && isCurrent && "bg-muted border-primary border-dashed animate-pulse",
                    !isFilled && !isCurrent && "bg-muted border-muted-foreground/30 text-transparent",
                    isCorrect === true && "bg-emerald-100 border-emerald-500 text-emerald-700",
                    isShaking && "animate-shake border-rose-500 bg-rose-50"
                  )}
                >
                  {isFilled ? letter.char : isCurrent ? '_' : '_'}
                </div>
              );
            })}
          </div>

          {/* Letter Buttons */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {letterButtons.map((letter) => (
              <Button
                key={letter.id}
                onClick={() => handleLetterClick(letter)}
                disabled={letter.used || isCorrect !== null}
                className={cn(
                  "w-12 h-14 sm:w-14 sm:h-16 rounded-xl border-2 font-bold text-xl sm:text-2xl uppercase transition-all",
                  letter.used
                    ? "bg-muted border-muted-foreground/20 text-muted-foreground/30 cursor-not-allowed"
                    : "border-foreground bg-card hover:scale-105 hover:bg-accent/20 cursor-pointer"
                )}
                style={{
                  boxShadow: letter.used ? 'none' : '3px 3px 0px 0px var(--color-foreground)',
                }}
              >
                {letter.char}
              </Button>
            ))}
          </div>

          {/* Action Buttons */}
          {isCorrect === null ? (
            <div className="flex items-center gap-4">
              <Button
                onClick={handleRemoveLast}
                disabled={currentSlot === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 disabled:opacity-50"
              >
                <Delete className="w-4 h-4" />
                Undo
              </Button>
              <Button
                onClick={handleHint}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-100 text-amber-700 hover:bg-amber-200"
              >
                <Lightbulb className="w-4 h-4" />
                Hint ({currentWord.word.length - currentSlot} left)
              </Button>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-600 mb-4">
                Well done!
              </p>
              <Button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all"
              >
                {currentIndex < gameWords.length - 1 ? 'Next Word' : 'See Results'}
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Results */
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-card rounded-3xl border-4 border-foreground p-8 max-w-md w-full text-center shadow-[8px_8px_0px_0px] shadow-foreground animate-scale-in">
            <div className="text-6xl mb-4">
              {score >= 100 ? '🏗️' : score >= 60 ? '🧱' : '💪'}
            </div>
            <h3 className="text-3xl font-display font-black mb-2">Building Complete!</h3>
            <p className="text-muted-foreground mb-6">
              {score >= 100 ? 'Master builder!' :
               score >= 60 ? 'Great construction!' :
               'Keep building your skills!'}
            </p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-foreground">{score}</div>
                <div className="text-xs text-muted-foreground">Points</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-amber-600">{bestStreak}</div>
                <div className="text-xs text-muted-foreground">Best Streak</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-emerald-600">{hintsUsed}</div>
                <div className="text-xs text-muted-foreground">Hints Used</div>
              </div>
            </div>

            <div className="flex gap-4">
              <Button
                onClick={initializeGame}
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

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
