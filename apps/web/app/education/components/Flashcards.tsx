'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, RotateCcw, Check, X as XIcon, Shuffle, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GameWord {
  id: string;
  word: string;
  translation: string;
  definition?: string;
  wordClass?: string;
}

interface FlashcardsProps {
  words: GameWord[];
  onClose: () => void;
  languageName: string;
}

export default function Flashcards({ words, onClose, languageName }: FlashcardsProps) {
  const [cards, setCards] = useState<GameWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCards, setKnownCards] = useState<Set<string>>(new Set());
  const [learningCards, setLearningCards] = useState<Set<string>>(new Set());
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);

  const initializeCards = useCallback(() => {
    const shuffled = [...words.slice(0, 15)].sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
    setKnownCards(new Set());
    setLearningCards(new Set());
  }, [words]);

  useEffect(() => {
    initializeCards();
  }, [initializeCards]);

  const currentCard = cards[currentIndex];
  const progress = ((knownCards.size + learningCards.size) / cards.length) * 100;

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleKnown = () => {
    if (!currentCard) return;
    setKnownCards(prev => new Set([...prev, currentCard.id]));
    goToNext('right');
  };

  const handleLearning = () => {
    if (!currentCard) return;
    setLearningCards(prev => new Set([...prev, currentCard.id]));
    goToNext('left');
  };

  const goToNext = (dir: 'left' | 'right') => {
    setDirection(dir);
    setTimeout(() => {
      if (currentIndex < cards.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setIsFlipped(false);
      }
      setDirection(null);
    }, 200);
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setDirection('left');
      setTimeout(() => {
        setCurrentIndex(prev => prev - 1);
        setIsFlipped(false);
        setDirection(null);
      }, 200);
    }
  };

  const shuffleCards = () => {
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const isComplete = currentIndex === cards.length - 1 && (knownCards.has(currentCard?.id) || learningCards.has(currentCard?.id));

  if (!currentCard && !isComplete) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-muted-foreground">No cards available</p>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-display font-black">Flashcards</h2>
          <p className="text-muted-foreground">Study {languageName} words</p>
        </div>
        <button
          onClick={onClose}
          className="p-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="font-medium">Card {currentIndex + 1} of {cards.length}</span>
          <div className="flex items-center gap-4">
            <span className="text-emerald-600 font-medium">{knownCards.size} known</span>
            <span className="text-amber-600 font-medium">{learningCards.size} learning</span>
          </div>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden flex">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${(knownCards.size / cards.length) * 100}%` }}
          />
          <div
            className="h-full bg-amber-500 transition-all duration-300"
            style={{ width: `${(learningCards.size / cards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 mb-8">
        <button
          onClick={shuffleCards}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
        >
          <Shuffle className="w-4 h-4" />
          <span className="font-medium">Shuffle</span>
        </button>
        <button
          onClick={initializeCards}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          <span className="font-medium">Reset</span>
        </button>
      </div>

      {/* Card Area */}
      {!isComplete ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          {/* Navigation */}
          <div className="flex items-center gap-6 w-full max-w-3xl">
            <button
              onClick={goToPrevious}
              disabled={currentIndex === 0}
              className="p-4 rounded-full bg-muted hover:bg-muted/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* Flashcard */}
            <div
              className={cn(
                "flex-1 perspective-1000 cursor-pointer transition-transform duration-200",
                direction === 'left' && "-translate-x-full opacity-0",
                direction === 'right' && "translate-x-full opacity-0"
              )}
              onClick={handleFlip}
            >
              <div
                className={cn(
                  "relative w-full aspect-[3/2] preserve-3d transition-transform duration-500",
                  isFlipped && "rotate-y-180"
                )}
              >
                {/* Front - Word */}
                <div className="absolute inset-0 backface-hidden rounded-3xl border-4 border-foreground bg-gradient-to-br from-blue-600 to-gray-800 p-8 flex flex-col items-center justify-center shadow-[8px_8px_0px_0px] shadow-foreground">
                  {currentCard.wordClass && (
                    <span className="absolute top-6 left-6 px-3 py-1 bg-white/20 rounded-full text-white/90 text-sm font-medium">
                      {currentCard.wordClass}
                    </span>
                  )}
                  <span className="text-white/60 text-sm mb-4 uppercase tracking-wider">{languageName}</span>
                  <h3 className="text-4xl sm:text-5xl lg:text-6xl font-display font-black text-white text-center">
                    {currentCard.word}
                  </h3>
                  <span className="absolute bottom-6 text-white/50 text-sm">Tap to flip</span>
                </div>

                {/* Back - Translation */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-3xl border-4 border-foreground bg-gradient-to-br from-amber-400 to-orange-500 p-8 flex flex-col items-center justify-center shadow-[8px_8px_0px_0px] shadow-foreground">
                  <span className="text-white/60 text-sm mb-4 uppercase tracking-wider">English</span>
                  <h3 className="text-3xl sm:text-4xl lg:text-5xl font-display font-black text-white text-center mb-4">
                    {currentCard.translation}
                  </h3>
                  {currentCard.definition && currentCard.definition !== currentCard.translation && (
                    <p className="text-white/80 text-center text-lg max-w-md">
                      {currentCard.definition}
                    </p>
                  )}
                  <span className="absolute bottom-6 text-white/50 text-sm">Tap to flip back</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => goToNext('right')}
              disabled={currentIndex === cards.length - 1}
              className="p-4 rounded-full bg-muted hover:bg-muted/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-6 mt-8">
            <button
              onClick={handleLearning}
              className="flex items-center gap-2 px-6 py-3 bg-amber-100 text-amber-700 rounded-2xl font-bold border-2 border-amber-300 hover:bg-amber-200 transition-colors"
            >
              <XIcon className="w-5 h-5" />
              Still Learning
            </button>
            <button
              onClick={handleKnown}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-100 text-emerald-700 rounded-2xl font-bold border-2 border-emerald-300 hover:bg-emerald-200 transition-colors"
            >
              <Check className="w-5 h-5" />
              Got It!
            </button>
          </div>
        </div>
      ) : (
        /* Completion Screen */
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-card rounded-3xl border-4 border-foreground p-8 max-w-md w-full text-center shadow-[8px_8px_0px_0px] shadow-foreground animate-scale-in">
            <div className="text-6xl mb-4">🎴</div>
            <h3 className="text-3xl font-display font-black mb-2">Session Complete!</h3>
            <p className="text-muted-foreground mb-6">Great job reviewing the flashcards!</p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-4 border-2 border-emerald-200">
                <div className="text-3xl font-bold text-emerald-600">{knownCards.size}</div>
                <div className="text-sm text-emerald-600/70">Known</div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 border-2 border-amber-200">
                <div className="text-3xl font-bold text-amber-600">{learningCards.size}</div>
                <div className="text-sm text-amber-600/70">Learning</div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={initializeCards}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Study Again
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
