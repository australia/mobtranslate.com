'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Trophy, Clock, Sparkles, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GameWord {
  id: string;
  word: string;
  translation: string;
}

interface MemoryGameProps {
  words: GameWord[];
  onClose: () => void;
  languageName: string;
}

interface Card {
  id: string;
  content: string;
  type: 'word' | 'translation';
  matchId: string;
  isFlipped: boolean;
  isMatched: boolean;
}

export default function MemoryGame({ words, onClose, languageName }: MemoryGameProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedCards, setFlippedCards] = useState<string[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<number>(0);
  const [moves, setMoves] = useState<number>(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const [timer, setTimer] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const initializeGame = useCallback(() => {
    // Take first 6 words for 12 cards (6 pairs)
    const gameWords = words.slice(0, 6);

    const newCards: Card[] = [];

    gameWords.forEach((word, index) => {
      // Word card
      newCards.push({
        id: `word-${index}`,
        content: word.word,
        type: 'word',
        matchId: word.id,
        isFlipped: false,
        isMatched: false,
      });
      // Translation card
      newCards.push({
        id: `trans-${index}`,
        content: word.translation,
        type: 'translation',
        matchId: word.id,
        isFlipped: false,
        isMatched: false,
      });
    });

    // Shuffle cards
    const shuffled = newCards.sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setFlippedCards([]);
    setMatchedPairs(0);
    setMoves(0);
    setGameStarted(false);
    setGameComplete(false);
    setTimer(0);
    setStreak(0);
  }, [words]);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameStarted && !gameComplete) {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, gameComplete]);

  const handleCardClick = (cardId: string) => {
    if (!gameStarted) setGameStarted(true);

    const card = cards.find(c => c.id === cardId);
    if (!card || card.isFlipped || card.isMatched || flippedCards.length >= 2) return;

    const newFlipped = [...flippedCards, cardId];
    setFlippedCards(newFlipped);
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, isFlipped: true } : c
    ));

    if (newFlipped.length === 2) {
      setMoves(prev => prev + 1);

      const [first, second] = newFlipped;
      const firstCard = cards.find(c => c.id === first);
      const secondCard = cards.find(c => c.id === second);

      if (firstCard && secondCard && firstCard.matchId === secondCard.matchId) {
        // Match found!
        setTimeout(() => {
          setCards(prev => prev.map(c =>
            c.matchId === firstCard.matchId ? { ...c, isMatched: true } : c
          ));
          setMatchedPairs(prev => {
            const newPairs = prev + 1;
            if (newPairs === 6) setGameComplete(true);
            return newPairs;
          });
          setStreak(prev => {
            const newStreak = prev + 1;
            if (newStreak > bestStreak) setBestStreak(newStreak);
            return newStreak;
          });
          setFlippedCards([]);
        }, 500);
      } else {
        // No match
        setStreak(0);
        setTimeout(() => {
          setCards(prev => prev.map(c =>
            newFlipped.includes(c.id) ? { ...c, isFlipped: false } : c
          ));
          setFlippedCards([]);
        }, 1000);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-display font-black">Memory Match</h2>
          <p className="text-muted-foreground">Match {languageName} words with their translations</p>
        </div>
        <button
          onClick={onClose}
          className="p-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex flex-wrap items-center gap-4 mb-8 p-4 rounded-2xl bg-muted/50">
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-background">
          <Clock className="w-4 h-4 text-gray-700" />
          <span className="font-mono font-bold">{formatTime(timer)}</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-background">
          <Trophy className="w-4 h-4 text-amber-500" />
          <span className="font-bold">{matchedPairs}/6 pairs</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-background">
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span className="font-bold">{moves} moves</span>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white">
            <Zap className="w-4 h-4" />
            <span className="font-bold">{streak} streak!</span>
          </div>
        )}
        <button
          onClick={initializeGame}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 transition-opacity"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>

      {/* Game Board */}
      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 sm:gap-4 max-w-2xl w-full">
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => handleCardClick(card.id)}
              disabled={card.isFlipped || card.isMatched}
              className={cn(
                "aspect-square rounded-2xl border-4 border-foreground transition-all duration-300 perspective-1000",
                card.isMatched && "opacity-50 scale-95",
                !card.isFlipped && !card.isMatched && "hover:scale-105 cursor-pointer"
              )}
              style={{
                boxShadow: card.isFlipped || card.isMatched ? 'none' : '4px 4px 0px 0px var(--color-foreground)',
              }}
            >
              <div
                className={cn(
                  "w-full h-full preserve-3d transition-transform duration-500",
                  card.isFlipped && "rotate-y-180"
                )}
              >
                {/* Card Back */}
                <div
                  className={cn(
                    "absolute inset-0 rounded-xl backface-hidden flex items-center justify-center",
                    "bg-gradient-to-br from-blue-600 to-gray-800"
                  )}
                >
                  <div className="text-4xl">❓</div>
                </div>

                {/* Card Front */}
                <div
                  className={cn(
                    "absolute inset-0 rounded-xl backface-hidden rotate-y-180 flex items-center justify-center p-3",
                    card.type === 'word'
                      ? "bg-gradient-to-br from-amber-400 to-orange-500"
                      : "bg-gradient-to-br from-emerald-400 to-teal-500"
                  )}
                >
                  <span className={cn(
                    "text-white font-bold text-center leading-tight",
                    card.content.length > 10 ? "text-sm" : "text-base sm:text-lg"
                  )}>
                    {card.content}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Game Complete Modal */}
      {gameComplete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-3xl border-4 border-foreground p-8 max-w-md w-full text-center shadow-[8px_8px_0px_0px] shadow-foreground animate-scale-in">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-3xl font-display font-black mb-2">Congratulations!</h3>
            <p className="text-muted-foreground mb-6">You matched all pairs!</p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-gray-800">{formatTime(timer)}</div>
                <div className="text-xs text-muted-foreground">Time</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-amber-600">{moves}</div>
                <div className="text-xs text-muted-foreground">Moves</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-emerald-600">{bestStreak}</div>
                <div className="text-xs text-muted-foreground">Best Streak</div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={initializeGame}
                className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all"
              >
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
