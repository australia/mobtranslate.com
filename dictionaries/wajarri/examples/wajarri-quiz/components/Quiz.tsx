'use client';

import { useState, useEffect } from 'react';

interface QuizQuestion {
  id: number;
  wajarri_word: string;
  correct_answer: string;
  options: string[];
  type: 'translation' | 'definition';
}

interface QuizStats {
  correct: number;
  total: number;
  streak: number;
  bestStreak: number;
}

export default function Quiz() {
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<QuizStats>({
    correct: 0,
    total: 0,
    streak: 0,
    bestStreak: 0
  });

  const fetchNewQuestion = async () => {
    setLoading(true);
    setSelectedAnswer(null);
    setIsCorrect(null);
    
    try {
      const response = await fetch('/api/quiz/question');
      const data = await response.json();
      setQuestion(data);
    } catch (error) {
      console.error('Failed to fetch question:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNewQuestion();
  }, []);

  const handleAnswer = (answer: string) => {
    if (selectedAnswer) return; // Already answered
    
    setSelectedAnswer(answer);
    const correct = answer === question?.correct_answer;
    setIsCorrect(correct);
    
    setStats(prev => ({
      correct: prev.correct + (correct ? 1 : 0),
      total: prev.total + 1,
      streak: correct ? prev.streak + 1 : 0,
      bestStreak: correct 
        ? Math.max(prev.bestStreak, prev.streak + 1)
        : prev.bestStreak
    }));
  };

  const getButtonClass = (option: string) => {
    const baseClass = "w-full p-4 text-left rounded-lg transition-all duration-200 font-medium ";
    
    if (!selectedAnswer) {
      return baseClass + "bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-blue-400";
    }
    
    if (option === question?.correct_answer) {
      return baseClass + "bg-green-100 border-2 border-green-500 text-green-900";
    }
    
    if (option === selectedAnswer && !isCorrect) {
      return baseClass + "bg-red-100 border-2 border-red-500 text-red-900";
    }
    
    return baseClass + "bg-gray-100 border-2 border-gray-200 text-gray-500";
  };

  const accuracy = stats.total > 0 
    ? Math.round((stats.correct / stats.total) * 100) 
    : 0;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Wajarri Language Quiz
        </h1>
        <p className="text-gray-600">
          Test your knowledge of Wajarri vocabulary
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.correct}</div>
            <div className="text-sm text-gray-500">Correct</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">{stats.total}</div>
            <div className="text-sm text-gray-500">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{accuracy}%</div>
            <div className="text-sm text-gray-500">Accuracy</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.streak}</div>
            <div className="text-sm text-gray-500">Streak</div>
          </div>
        </div>

        {stats.bestStreak > 0 && (
          <div className="text-center text-sm text-gray-500 mb-4">
            Best Streak: {stats.bestStreak} 🔥
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      ) : question ? (
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="mb-8">
            <h2 className="text-lg text-gray-600 mb-2">
              What is the English translation of:
            </h2>
            <div className="text-4xl font-bold text-gray-900">
              {question.wajarri_word}
            </div>
          </div>

          <div className="space-y-3">
            {question.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswer(option)}
                disabled={selectedAnswer !== null}
                className={getButtonClass(option)}
              >
                <div className="flex items-center justify-between">
                  <span>{option}</span>
                  {selectedAnswer && option === question.correct_answer && (
                    <span className="text-green-600">✓</span>
                  )}
                  {selectedAnswer === option && !isCorrect && (
                    <span className="text-red-600">✗</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {selectedAnswer && (
            <div className="mt-6 space-y-4">
              <div className={`p-4 rounded-lg ${
                isCorrect ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}>
                {isCorrect ? (
                  <div>
                    <span className="font-semibold">Correct! </span>
                    Well done! 🎉
                  </div>
                ) : (
                  <div>
                    <span className="font-semibold">Not quite. </span>
                    The correct answer is "{question.correct_answer}"
                  </div>
                )}
              </div>

              <button
                onClick={fetchNewQuestion}
                className="w-full py-3 px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                Next Question →
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center text-gray-500">
            No questions available
          </div>
        </div>
      )}
    </div>
  );
}