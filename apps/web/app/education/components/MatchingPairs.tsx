'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Trophy, Clock, Zap, ChevronRight } from 'lucide-react';
import { cn, Button } from '@mobtranslate/ui';

interface GameWord {
  id: string;
  word: string;
  translation: string;
}

interface MatchingPairsProps {
  words: GameWord[];
  onClose: () => void;
  languageName: string;
}

interface MatchItem {
  id: string;
  content: string;
  type: 'word' | 'translation';
  pairId: string;
  isMatched: boolean;
}

export default function MatchingPairs({ words, onClose, languageName }: MatchingPairsProps) {
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(1);
  const [leftItems, setLeftItems] = useState<MatchItem[]>([]);
  const [rightItems, setRightItems] = useState<MatchItem[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [wrongPair, setWrongPair] = useState<{ left: string; right: string } | null>(null);
  const [timer, setTimer] = useState(0);
  const [gameComplete, setGameComplete] = useState(false);
  const [totalMatched, setTotalMatched] = useState(0);
  const [mistakes, setMistakes] = useState(0);

  const PAIRS_PER_ROUND = 5;

  const initializeRound = useCallback((roundNum: number, allWords: GameWord[]) => {
    const start = ((roundNum - 1) * PAIRS_PER_ROUND) % allWords.length;
    const roundWords: GameWord[] = [];
    for (let i = 0; i < PAIRS_PER_ROUND; i++) {
      roundWords.push(allWords[(start + i) % allWords.length]);
    }

    const left: MatchItem[] = roundWords.map(w => ({
      id: `left-${w.id}`,
      content: w.word,
      type: 'word',
      pairId: w.id,
      isMatched: false,
    }));

    const right: MatchItem[] = roundWords.map(w => ({
      id: `right-${w.id}`,
      content: w.translation,
      type: 'translation',
      pairId: w.id,
      isMatched: false,
    }));

    // Shuffle both sides independently
    setLeftItems(left.sort(() => Math.random() - 0.5));
    setRightItems(right.sort(() => Math.random() - 0.5));
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatchedCount(0);
    setWrongPair(null);
  }, []);

  const initializeGame = useCallback(() => {
    const shuffled = [...words].sort(() => Math.random() - 0.5).slice(0, 15);
    const rounds = Math.ceil(shuffled.length / PAIRS_PER_ROUND);
    setTotalRounds(rounds);
    setRound(1);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setTimer(0);
    setGameComplete(false);
    setTotalMatched(0);
    setMistakes(0);
    initializeRound(1, shuffled);
  }, [words, initializeRound]);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (!gameComplete && leftItems.length > 0) {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameComplete, leftItems.length]);

  const handleLeftClick = (itemId: string) => {
    if (wrongPair) return;
    const item = leftItems.find(i => i.id === itemId);
    if (!item || item.isMatched) return;

    setSelectedLeft(itemId);

    // If right is already selected, check match
    if (selectedRight) {
      checkMatch(itemId, selectedRight);
    }
  };

  const handleRightClick = (itemId: string) => {
    if (wrongPair) return;
    const item = rightItems.find(i => i.id === itemId);
    if (!item || item.isMatched) return;

    setSelectedRight(itemId);

    // If left is already selected, check match
    if (selectedLeft) {
      checkMatch(selectedLeft, itemId);
    }
  };

  const checkMatch = (leftId: string, rightId: string) => {
    const leftItem = leftItems.find(i => i.id === leftId);
    const rightItem = rightItems.find(i => i.id === rightId);

    if (!leftItem || !rightItem) return;

    if (leftItem.pairId === rightItem.pairId) {
      // Correct match
      setLeftItems(prev => prev.map(i =>
        i.id === leftId ? { ...i, isMatched: true } : i
      ));
      setRightItems(prev => prev.map(i =>
        i.id === rightId ? { ...i, isMatched: true } : i
      ));
      setSelectedLeft(null);
      setSelectedRight(null);

      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak > bestStreak) setBestStreak(newStreak);
      setScore(prev => prev + (10 + newStreak * 2));
      setTotalMatched(prev => prev + 1);

      const newMatched = matchedCount + 1;
      setMatchedCount(newMatched);

      // Check if round is complete
      if (newMatched >= PAIRS_PER_ROUND) {
        if (round < totalRounds) {
          setTimeout(() => {
            setRound(prev => prev + 1);
            const shuffled = [...words].sort(() => Math.random() - 0.5).slice(0, 15);
            initializeRound(round + 1, shuffled);
          }, 800);
        } else {
          setTimeout(() => setGameComplete(true), 800);
        }
      }
    } else {
      // Wrong match
      setStreak(0);
      setMistakes(prev => prev + 1);
      setWrongPair({ left: leftId, right: rightId });

      setTimeout(() => {
        setWrongPair(null);
        setSelectedLeft(null);
        setSelectedRight(null);
      }, 600);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (leftItems.length === 0 && !gameComplete) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-4 border-border border-t-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading matching game...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-display font-black">Matching Pairs</h2>
          <p className="text-muted-foreground">Match {languageName} words to their meanings</p>
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
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted">
          <Clock className="w-4 h-4 text-foreground" />
          <span className="font-mono font-bold">{formatTime(timer)}</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted">
          <Trophy className="w-4 h-4 text-amber-500" />
          <span className="font-bold">{score} pts</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted">
          <span className="font-medium">Round {round}/{totalRounds}</span>
        </div>
        {streak > 1 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white animate-pulse">
            <Zap className="w-4 h-4" />
            <span className="font-bold">{streak} streak!</span>
          </div>
        )}
        <Button
          onClick={initializeGame}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </Button>
      </div>

      {!gameComplete ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-3xl">
            {/* Instructions */}
            <p className="text-center text-muted-foreground mb-6">
              Click a word on the left, then click its matching meaning on the right
            </p>

            {/* Matching Grid */}
            <div className="grid grid-cols-2 gap-4 sm:gap-8">
              {/* Left Column - Indigenous Words */}
              <div className="space-y-3">
                <div className="text-sm font-bold text-center text-muted-foreground uppercase tracking-wider mb-2">
                  {languageName}
                </div>
                {leftItems.map((item) => {
                  const isSelected = selectedLeft === item.id;
                  const isWrong = wrongPair?.left === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleLeftClick(item.id)}
                      disabled={item.isMatched}
                      className={cn(
                        "w-full p-4 rounded-2xl border-3 font-bold text-lg transition-all duration-300 text-center",
                        item.isMatched && "bg-emerald-50 border-emerald-300 text-emerald-600 opacity-50 scale-95",
                        !item.isMatched && !isSelected && !isWrong && "bg-card border-border hover:border-primary hover:bg-muted cursor-pointer",
                        isSelected && !isWrong && "bg-primary/10 border-primary scale-105 shadow-lg",
                        isWrong && "bg-rose-50 border-rose-500 animate-shake"
                      )}
                    >
                      {item.content}
                    </button>
                  );
                })}
              </div>

              {/* Right Column - English Meanings */}
              <div className="space-y-3">
                <div className="text-sm font-bold text-center text-muted-foreground uppercase tracking-wider mb-2">
                  English
                </div>
                {rightItems.map((item) => {
                  const isSelected = selectedRight === item.id;
                  const isWrong = wrongPair?.right === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleRightClick(item.id)}
                      disabled={item.isMatched}
                      className={cn(
                        "w-full p-4 rounded-2xl border-3 font-bold text-lg transition-all duration-300 text-center",
                        item.isMatched && "bg-emerald-50 border-emerald-300 text-emerald-600 opacity-50 scale-95",
                        !item.isMatched && !isSelected && !isWrong && "bg-card border-border hover:border-amber-500 hover:bg-muted cursor-pointer",
                        isSelected && !isWrong && "bg-amber-50 border-amber-500 scale-105 shadow-lg",
                        isWrong && "bg-rose-50 border-rose-500 animate-shake"
                      )}
                    >
                      {item.content}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Results */
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-card rounded-3xl border-4 border-foreground p-8 max-w-md w-full text-center shadow-[8px_8px_0px_0px] shadow-foreground animate-scale-in">
            <div className="text-6xl mb-4">
              {mistakes === 0 ? '🏆' : mistakes <= 3 ? '🎯' : '💪'}
            </div>
            <h3 className="text-3xl font-display font-black mb-2">All Matched!</h3>
            <p className="text-muted-foreground mb-6">
              {mistakes === 0 ? 'Perfect score - no mistakes!' :
               mistakes <= 3 ? 'Great matching skills!' :
               'Keep practicing to improve!'}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-foreground">{score}</div>
                <div className="text-xs text-muted-foreground">Points</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-amber-600">{formatTime(timer)}</div>
                <div className="text-xs text-muted-foreground">Time</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-emerald-600">{totalMatched}</div>
                <div className="text-xs text-muted-foreground">Matched</div>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold text-rose-600">{mistakes}</div>
                <div className="text-xs text-muted-foreground">Mistakes</div>
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
