/**
 * SM-2 Spaced Repetition Algorithm Implementation
 * Based on the original SuperMemo-2 algorithm with mobile-friendly adaptations
 */

export interface SpacedRepetitionState {
  id: string;
  userId: string;
  wordId: string;
  bucket: number; // 0=new, 1-2=learning, 3-4=review, 5=mastered
  ef: number; // easiness factor (1.3-2.5+)
  intervalDays: number;
  dueDate: Date;
  lastSeen: Date | null;
  totalAttempts: number;
  correctAttempts: number;
  streak: number;
}

export interface QuizAttempt {
  wordId: string;
  isCorrect: boolean;
  responseTimeMs: number;
  selectedAnswer: string;
  correctAnswer: string;
  distractors: string[];
}

export interface QuizCard {
  id: string;
  wordId: string;
  word: string;
  meaning: string;
  audioUrl?: string;
  choices: string[];
  correctIndex: number;
  bucket: number;
  timeLimit: number;
}

export class SpacedRepetitionEngine {
  private static readonly BUCKET_NAMES = [
    'New',
    'Learning-1', 
    'Learning-2',
    'Review-1',
    'Review-2', 
    'Mastered'
  ] as const;

  private static readonly REVIEW_INTERVALS = {
    0: 0,      // New: immediate
    1: 0,      // Learning-1: same session
    2: 0.17,   // Learning-2: 4 hours (in days)
    3: 1,      // Review-1: 1 day
    4: 4,      // Review-2: 4 days
    5: null    // Mastered: calculated
  } as const;

  /**
   * Calculate quality score based on correctness and response time
   */
  static calculateQuality(isCorrect: boolean, responseTimeMs: number, timeLimit: number = 3000): number {
    if (!isCorrect) return 2; // Poor: incorrect
    
    // Scale based on response time (faster = better)
    const speedRatio = Math.min(responseTimeMs / timeLimit, 1);
    
    if (speedRatio <= 0.5) return 5; // Perfect: correct and very fast
    if (speedRatio <= 0.8) return 4; // Good: correct and reasonably fast
    return 3; // OK: correct but slow
  }

  /**
   * Update easiness factor using SM-2 formula
   */
  static updateEasinessFactory(currentEF: number, quality: number): number {
    const newEF = currentEF + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
    return Math.max(1.3, newEF);
  }

  /**
   * Calculate next review interval based on current state and performance
   */
  static calculateNextInterval(
    currentBucket: number,
    currentInterval: number,
    ef: number,
    isCorrect: boolean
  ): { bucket: number; interval: number } {
    if (!isCorrect) {
      // Reset on failure - go back to learning
      return {
        bucket: Math.max(0, currentBucket - 1),
        interval: 0
      };
    }

    // Advance on success
    const newBucket = Math.min(5, currentBucket + 1);
    
    let newInterval: number;
    if (newBucket <= 2) {
      newInterval = 0; // Same session
    } else if (newBucket === 3) {
      newInterval = 1; // 1 day
    } else if (newBucket === 4) {
      newInterval = 4; // 4 days
    } else {
      // Mastered: use SM-2 formula with minimum 2 weeks
      newInterval = Math.max(Math.round(currentInterval * ef), 14);
    }

    return { bucket: newBucket, interval: newInterval };
  }

  /**
   * Calculate due date based on bucket and interval
   */
  static calculateDueDate(bucket: number, intervalDays: number): Date {
    const now = new Date();
    
    if (bucket <= 1) {
      return now; // Immediate or same session
    }
    
    const interval = this.REVIEW_INTERVALS[bucket as keyof typeof this.REVIEW_INTERVALS];
    if (interval === null) {
      // Mastered: use calculated interval
      return new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    }
    
    return new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
  }

  /**
   * Update spaced repetition state after an attempt
   */
  static updateState(
    currentState: SpacedRepetitionState,
    attempt: QuizAttempt
  ): Partial<SpacedRepetitionState> {
    const quality = this.calculateQuality(attempt.isCorrect, attempt.responseTimeMs);
    const newEF = this.updateEasinessFactory(currentState.ef, quality);
    const { bucket, interval } = this.calculateNextInterval(
      currentState.bucket,
      currentState.intervalDays,
      newEF,
      attempt.isCorrect
    );

    return {
      bucket,
      ef: newEF,
      intervalDays: interval,
      dueDate: this.calculateDueDate(bucket, interval),
      lastSeen: new Date(),
      totalAttempts: currentState.totalAttempts + 1,
      correctAttempts: currentState.correctAttempts + (attempt.isCorrect ? 1 : 0),
      streak: attempt.isCorrect ? currentState.streak + 1 : 0
    };
  }

  /**
   * Select words for quiz session using weighted sampling
   * Prioritizes words that are due and have lower performance
   */
  static selectWordsForSession(
    states: SpacedRepetitionState[],
    sessionSize: number = 20
  ): string[] {
    const now = new Date();
    
    // Filter to due words and calculate weights
    const candidatesWithWeights = states
      .filter(state => state.dueDate <= now || state.bucket === 0)
      .map(state => {
        // Weight = (5 - bucket)² to prioritize weaker items
        const bucketWeight = Math.pow(5 - state.bucket, 2);
        
        // Boost weight for overdue items
        const overdueDays = Math.max(0, (now.getTime() - state.dueDate.getTime()) / (24 * 60 * 60 * 1000));
        const overdueBoost = 1 + (overdueDays * 0.1);
        
        // Reduce weight for recently seen items to add variety
        const timeSinceLastSeen = state.lastSeen 
          ? (now.getTime() - state.lastSeen.getTime()) / (60 * 60 * 1000) // hours
          : 24; // If never seen, treat as 24 hours ago
        const varietyFactor = Math.min(1, timeSinceLastSeen / 4); // Reduce weight if seen within 4 hours
        
        return {
          wordId: state.wordId,
          weight: bucketWeight * overdueBoost * varietyFactor
        };
      });

    // If we don't have enough candidates, include some new words
    if (candidatesWithWeights.length < sessionSize) {
      // This would typically involve fetching new words from the database
      // For now, we'll work with what we have
    }

    // Weighted random sampling using reservoir sampling
    const selected: string[] = [];
    let totalWeight = 0;

    for (const candidate of candidatesWithWeights) {
      totalWeight += candidate.weight;
      
      if (selected.length < sessionSize) {
        selected.push(candidate.wordId);
      } else {
        // Reservoir sampling: replace existing item with probability
        const probability = candidate.weight / totalWeight;
        if (Math.random() < probability) {
          const replaceIndex = Math.floor(Math.random() * selected.length);
          selected[replaceIndex] = candidate.wordId;
        }
      }
    }

    // Shuffle the final selection
    return this.shuffleArray(selected);
  }

  /**
   * Generate performance insights for user
   */
  static generateInsights(states: SpacedRepetitionState[]): {
    totalWords: number;
    mastered: number;
    dueForReview: number;
    averageAccuracy: number;
    longestStreak: number;
    weakestBucket: number;
    strengths: string[];
    recommendations: string[];
  } {
    const now = new Date();
    const mastered = states.filter(s => s.bucket === 5).length;
    const dueForReview = states.filter(s => s.dueDate <= now).length;
    
    const totalAttempts = states.reduce((sum, s) => sum + s.totalAttempts, 0);
    const totalCorrect = states.reduce((sum, s) => sum + s.correctAttempts, 0);
    const averageAccuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;
    
    const longestStreak = Math.max(...states.map(s => s.streak), 0);
    
    // Find weakest bucket (most words with low performance)
    const bucketCounts = states.reduce((counts, state) => {
      counts[state.bucket] = (counts[state.bucket] || 0) + 1;
      return counts;
    }, {} as Record<number, number>);
    
    const weakestBucket = Object.entries(bucketCounts)
      .filter(([bucket]) => parseInt(bucket) < 5)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 0;

    const strengths: string[] = [];
    const recommendations: string[] = [];

    // Generate insights
    if (averageAccuracy > 0.8) {
      strengths.push("High accuracy rate");
    }
    if (longestStreak > 10) {
      strengths.push("Great consistency");
    }
    if (mastered > states.length * 0.3) {
      strengths.push("Strong vocabulary retention");
    }

    if (dueForReview > 20) {
      recommendations.push("You have many words due for review - try a longer session");
    }
    if (averageAccuracy < 0.6) {
      recommendations.push("Focus on accuracy over speed");
    }
    if (states.filter(s => s.bucket === 0).length > 50) {
      recommendations.push("Many new words available - try learning some new vocabulary");
    }

    return {
      totalWords: states.length,
      mastered,
      dueForReview,
      averageAccuracy,
      longestStreak,
      weakestBucket: parseInt(weakestBucket.toString()),
      strengths,
      recommendations
    };
  }

  /**
   * Utility: Shuffle array using Fisher-Yates algorithm
   */
  public static shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get bucket name for display
   */
  static getBucketName(bucket: number): string {
    return this.BUCKET_NAMES[bucket] || 'Unknown';
  }

  /**
   * Calculate when a word will be due next
   */
  static getNextReviewTime(state: SpacedRepetitionState): string {
    const now = new Date();
    const diffMs = state.dueDate.getTime() - now.getTime();
    
    if (diffMs <= 0) return "Due now";
    
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    if (diffHours < 1) {
      const mins = Math.round(diffMs / (1000 * 60));
      return `Due in ${mins} minute${mins !== 1 ? 's' : ''}`;
    }
    
    if (diffDays < 1) {
      const hours = Math.round(diffHours);
      return `Due in ${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    
    if (diffDays < 7) {
      const days = Math.round(diffDays);
      return `Due in ${days} day${days !== 1 ? 's' : ''}`;
    }
    
    const weeks = Math.round(diffDays / 7);
    return `Due in ${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
}