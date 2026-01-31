'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  ChevronRight,
  Gamepad2,
  GraduationCap,
  Play,
  Puzzle,
  Sparkles,
  Target,
  Trophy,
  Volume2,
  PenTool,
  Clock,
  Star,
  Zap,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';

// Game Components
import MemoryGame from '../components/MemoryGame';
import WordQuiz from '../components/WordQuiz';
import Flashcards from '../components/Flashcards';
import WordScramble from '../components/WordScramble';
import ListeningChallenge from '../components/ListeningChallenge';
import WritingPractice from '../components/WritingPractice';

interface Language {
  id: string;
  code: string;
  name: string;
  native_name?: string;
  description?: string;
  region?: string;
  status?: string;
  family?: string;
}

interface Word {
  id: string;
  word: string;
  definitions: { definition: string }[];
  translations: { translation: string }[];
  word_class?: { name: string };
}

const GAME_TYPES = [
  {
    id: 'memory',
    name: 'Memory Match',
    description: 'Match words to their English translations',
    icon: Brain,
    color: 'from-blue-600 to-gray-800',
    difficulty: 'Easy',
    time: '5-10 min',
  },
  {
    id: 'quiz',
    name: 'Word Quiz',
    description: 'Test your vocabulary with multiple choice',
    icon: Target,
    color: 'from-amber-500 to-orange-600',
    difficulty: 'Medium',
    time: '5-15 min',
  },
  {
    id: 'flashcards',
    name: 'Flashcards',
    description: 'Study with interactive flip cards',
    icon: BookOpen,
    color: 'from-emerald-500 to-teal-600',
    difficulty: 'Easy',
    time: '5-10 min',
  },
  {
    id: 'scramble',
    name: 'Word Scramble',
    description: 'Unscramble letters to form words',
    icon: Puzzle,
    color: 'from-rose-500 to-red-600',
    difficulty: 'Hard',
    time: '10-15 min',
  },
  {
    id: 'listening',
    name: 'Listening',
    description: 'Train your ear with audio',
    icon: Volume2,
    color: 'from-cyan-500 to-blue-600',
    difficulty: 'Medium',
    time: '5-10 min',
  },
  {
    id: 'writing',
    name: 'Writing',
    description: 'Practice writing words',
    icon: PenTool,
    color: 'from-gray-600 to-gray-800',
    difficulty: 'Hard',
    time: '10-15 min',
  },
];

const CURRICULUM = [
  {
    id: 'basics',
    name: 'Basics',
    icon: '🌱',
    color: 'from-emerald-400 to-green-500',
    lessons: [
      { id: 'greetings', name: 'Basic Greetings', words: 10, duration: '3-4 min', completed: true },
      { id: 'polite', name: 'Polite Phrases', words: 8, duration: '3-4 min', completed: true },
      { id: 'numbers-1-5', name: 'Numbers 1-5', words: 5, duration: '2-3 min', completed: false },
      { id: 'numbers-6-10', name: 'Numbers 6-10', words: 5, duration: '2-3 min', completed: false },
      { id: 'time-of-day', name: 'Time of Day', words: 6, duration: '3-4 min', completed: false },
    ],
  },
  {
    id: 'family',
    name: 'Family',
    icon: '👨‍👩‍👧‍👦',
    color: 'from-blue-400 to-indigo-500',
    lessons: [
      { id: 'immediate-family', name: 'Immediate Family', words: 8, duration: '3-4 min', completed: false },
      { id: 'grandparents', name: 'Grandparents', words: 4, duration: '2-3 min', completed: false },
      { id: 'extended-family', name: 'Extended Family', words: 10, duration: '4-5 min', completed: false },
      { id: 'relationships', name: 'Relationships', words: 6, duration: '3-4 min', completed: false },
    ],
  },
  {
    id: 'animals',
    name: 'Animals',
    icon: '🦘',
    color: 'from-amber-400 to-orange-500',
    lessons: [
      { id: 'land-animals', name: 'Land Animals', words: 12, duration: '4-5 min', completed: false },
      { id: 'water-animals', name: 'Water Animals', words: 8, duration: '3-4 min', completed: false },
      { id: 'birds', name: 'Birds', words: 10, duration: '4-5 min', completed: false },
      { id: 'insects', name: 'Insects', words: 6, duration: '3-4 min', completed: false },
      { id: 'pets', name: 'Pets', words: 5, duration: '2-3 min', completed: false },
      { id: 'wildlife', name: 'Wildlife', words: 8, duration: '3-4 min', completed: false },
    ],
  },
  {
    id: 'nature',
    name: 'Nature',
    icon: '🌿',
    color: 'from-green-400 to-teal-500',
    lessons: [
      { id: 'elements', name: 'Natural Elements', words: 8, duration: '3-4 min', completed: false },
      { id: 'weather', name: 'Weather', words: 10, duration: '4-5 min', completed: false },
      { id: 'colors', name: 'Colors', words: 10, duration: '4-5 min', completed: false },
      { id: 'plants', name: 'Plants & Trees', words: 8, duration: '3-4 min', completed: false },
      { id: 'landscape', name: 'Landscape', words: 6, duration: '3-4 min', completed: false },
    ],
  },
  {
    id: 'body',
    name: 'Body',
    icon: '🫀',
    color: 'from-rose-400 to-red-500',
    lessons: [
      { id: 'face', name: 'Face', words: 8, duration: '3-4 min', completed: false },
      { id: 'body-parts', name: 'Body Parts', words: 12, duration: '4-5 min', completed: false },
      { id: 'actions', name: 'Physical Actions', words: 10, duration: '4-5 min', completed: false },
    ],
  },
  {
    id: 'food',
    name: 'Food',
    icon: '🍇',
    color: 'from-gray-500 to-gray-700',
    lessons: [
      { id: 'berries', name: 'Berries & Fruits', words: 8, duration: '3-4 min', completed: false },
      { id: 'vegetables', name: 'Vegetables', words: 8, duration: '3-4 min', completed: false },
      { id: 'cooking', name: 'Cooking', words: 6, duration: '3-4 min', completed: false },
      { id: 'meals', name: 'Meals', words: 6, duration: '3-4 min', completed: false },
    ],
  },
];

export default function LanguageEducationPage() {
  const params = useParams();
  const router = useRouter();
  const languageCode = params.language as string;

  const [language, setLanguage] = useState<Language | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('games');

  useEffect(() => {
    fetchLanguageData();
    fetchWords();
  }, [languageCode]);

  const fetchLanguageData = async () => {
    try {
      const response = await fetch('/api/v2/languages');
      const languages = await response.json();
      const lang = languages.find((l: Language) => l.code === languageCode);
      if (lang) {
        setLanguage(lang);
      } else {
        router.push('/education');
      }
    } catch (error) {
      console.error('Error fetching language:', error);
    }
  };

  const fetchWords = async () => {
    try {
      const response = await fetch(`/api/v2/words?language=${languageCode}&limit=200`);
      const data = await response.json();
      setWords(data.words || []);
    } catch (error) {
      console.error('Error fetching words:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderGame = () => {
    if (!activeGame || words.length === 0) return null;

    const gameWords = words.slice(0, 20).map(w => ({
      id: w.id,
      word: w.word,
      translation: w.translations?.[0]?.translation || w.definitions?.[0]?.definition || 'Unknown',
      definition: w.definitions?.[0]?.definition || '',
      wordClass: w.word_class?.name || '',
    }));

    switch (activeGame) {
      case 'memory':
        return <MemoryGame words={gameWords} onClose={() => setActiveGame(null)} languageName={language?.name || ''} />;
      case 'quiz':
        return <WordQuiz words={gameWords} onClose={() => setActiveGame(null)} languageName={language?.name || ''} />;
      case 'flashcards':
        return <Flashcards words={gameWords} onClose={() => setActiveGame(null)} languageName={language?.name || ''} />;
      case 'scramble':
        return <WordScramble words={gameWords} onClose={() => setActiveGame(null)} languageName={language?.name || ''} />;
      case 'listening':
        return <ListeningChallenge words={gameWords} onClose={() => setActiveGame(null)} languageName={language?.name || ''} />;
      case 'writing':
        return <WritingPractice words={gameWords} onClose={() => setActiveGame(null)} languageName={language?.name || ''} />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <SharedLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
            </div>
            <p className="text-xl text-muted-foreground">Loading education content...</p>
          </div>
        </div>
      </SharedLayout>
    );
  }

  // If a game is active, show the game full screen
  if (activeGame) {
    return (
      <SharedLayout>
        {renderGame()}
      </SharedLayout>
    );
  }

  const totalLessons = CURRICULUM.reduce((acc, cat) => acc + cat.lessons.length, 0);
  const completedLessons = CURRICULUM.reduce((acc, cat) => acc + cat.lessons.filter(l => l.completed).length, 0);

  return (
    <SharedLayout>
      {/* Hero Section */}
      <section className="relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16 -mt-6 sm:-mt-8 lg:-mt-12 mb-12">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
          <div className="absolute top-20 left-10 w-72 h-72 bg-gray-500/30 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-gray-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          {/* Back Button */}
          <Link
            href="/education"
            className="inline-flex items-center gap-2 text-white/70 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Education</span>
          </Link>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white/90 text-sm font-medium mb-4">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Interactive Learning</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-black text-white mb-4 tracking-tight">
                Learn {language?.name}
              </h1>

              {language?.native_name && (
                <p className="text-2xl text-white/60 mb-4 font-light">{language.native_name}</p>
              )}

              <p className="text-lg text-white/70 max-w-2xl mb-6">
                {language?.description || `Explore the beautiful language of the ${language?.name} people through interactive games and structured lessons.`}
              </p>

              <div className="flex flex-wrap gap-3">
                {language?.region && (
                  <span className="px-4 py-2 bg-white/10 rounded-lg text-white/90 text-sm">
                    📍 {language.region}
                  </span>
                )}
                {language?.family && (
                  <span className="px-4 py-2 bg-white/10 rounded-lg text-white/90 text-sm">
                    🌳 {language.family}
                  </span>
                )}
                <span className="px-4 py-2 bg-white/10 rounded-lg text-white/90 text-sm">
                  📚 {words.length} words available
                </span>
              </div>
            </div>

            {/* Progress Card */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 p-6 min-w-[280px]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-white font-bold">Your Progress</div>
                  <div className="text-white/60 text-sm">{completedLessons}/{totalLessons} lessons</div>
                </div>
              </div>
              <div className="h-3 bg-white/20 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                  style={{ width: `${(completedLessons / totalLessons) * 100}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="text-xl font-bold text-amber-400">0</div>
                  <div className="text-xs text-white/60">Streak</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-emerald-400">0%</div>
                  <div className="text-xs text-white/60">Accuracy</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-gray-600">0</div>
                  <div className="text-xs text-white/60">Words</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Wave Divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
            <path d="M0 80L60 70C120 60 240 40 360 30C480 20 600 20 720 25C840 30 960 40 1080 45C1200 50 1320 50 1380 50L1440 50V80H1380C1320 80 1200 80 1080 80C960 80 840 80 720 80C600 80 480 80 360 80C240 80 120 80 60 80H0Z" fill="currentColor" className="text-background"/>
          </svg>
        </div>
      </section>

      {/* Main Content Tabs */}
      <div className="max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-12 p-1 bg-muted rounded-xl">
            <TabsTrigger
              value="games"
              className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm py-3"
            >
              <Gamepad2 className="w-4 h-4" />
              Games
            </TabsTrigger>
            <TabsTrigger
              value="curriculum"
              className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm py-3"
            >
              <GraduationCap className="w-4 h-4" />
              Curriculum
            </TabsTrigger>
          </TabsList>

          {/* Games Tab */}
          <TabsContent value="games" className="mt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {GAME_TYPES.map((game, index) => (
                <button
                  key={game.id}
                  onClick={() => words.length > 0 && setActiveGame(game.id)}
                  disabled={words.length === 0}
                  className="group relative text-left overflow-hidden rounded-3xl border-4 border-foreground bg-card p-6 transition-all duration-300 hover:-translate-y-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    boxShadow: '6px 6px 0px 0px var(--color-foreground)',
                  }}
                >
                  {/* Background Gradient on Hover */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${game.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />

                  <div className="relative">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${game.color} flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>
                        <game.icon className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                          game.difficulty === 'Easy' ? 'bg-emerald-100 text-emerald-700' :
                          game.difficulty === 'Medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-rose-100 text-rose-700'
                        }`}>
                          {game.difficulty}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {game.time}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-xl font-display font-bold mb-2">{game.name}</h3>
                    <p className="text-muted-foreground text-sm mb-4">{game.description}</p>

                    {/* Play Button */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-primary group-hover:underline">
                        {words.length > 0 ? 'Play Now' : 'No words available'}
                      </span>
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${game.color} flex items-center justify-center opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-300`}>
                        <Play className="w-4 h-4 text-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {words.length === 0 && (
              <div className="mt-8 text-center p-8 rounded-2xl bg-muted/50 border-2 border-dashed border-muted-foreground/30">
                <p className="text-muted-foreground">
                  No words available for this language yet. Check back soon!
                </p>
              </div>
            )}
          </TabsContent>

          {/* Curriculum Tab */}
          <TabsContent value="curriculum" className="mt-0">
            <div className="space-y-8">
              {CURRICULUM.map((category, catIndex) => (
                <div key={category.id} className="relative">
                  {/* Category Header */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${category.color} flex items-center justify-center text-2xl shadow-lg`}>
                      {category.icon}
                    </div>
                    <div>
                      <h3 className="text-2xl font-display font-bold">{category.name}</h3>
                      <p className="text-muted-foreground text-sm">
                        {category.lessons.length} lessons • {category.lessons.filter(l => l.completed).length} completed
                      </p>
                    </div>
                  </div>

                  {/* Lessons Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pl-0 sm:pl-[72px]">
                    {category.lessons.map((lesson, lessonIndex) => {
                      const isLocked = catIndex > 0 && !CURRICULUM[catIndex - 1].lessons.every(l => l.completed);

                      return (
                        <div
                          key={lesson.id}
                          className={`group relative rounded-2xl border-2 p-5 transition-all duration-300 ${
                            lesson.completed
                              ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
                              : isLocked
                              ? 'bg-muted/50 border-muted-foreground/20 opacity-60'
                              : 'bg-card border-border hover:border-primary hover:-translate-y-1 cursor-pointer'
                          }`}
                        >
                          {/* Lesson Number */}
                          <div className={`absolute -top-3 -left-3 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            lesson.completed
                              ? 'bg-emerald-500 text-white'
                              : isLocked
                              ? 'bg-muted-foreground/30 text-muted-foreground'
                              : 'bg-primary text-primary-foreground'
                          }`}>
                            {lesson.completed ? (
                              <CheckCircle2 className="w-5 h-5" />
                            ) : isLocked ? (
                              <Lock className="w-4 h-4" />
                            ) : (
                              lessonIndex + 1
                            )}
                          </div>

                          <h4 className="font-bold mb-2 pr-8">{lesson.name}</h4>

                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <BookOpen className="w-3.5 h-3.5" />
                              {lesson.words} words
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {lesson.duration}
                            </span>
                          </div>

                          {lesson.completed && (
                            <div className="absolute top-4 right-4">
                              <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                            </div>
                          )}

                          {!lesson.completed && !isLocked && (
                            <div className="mt-4 pt-3 border-t border-border">
                              <span className="text-sm font-medium text-primary group-hover:underline flex items-center gap-1">
                                Start Lesson
                                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Quick Actions */}
      <section className="mt-16 py-12 bg-muted/30 -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-2xl font-display font-bold mb-2">Continue Learning</h3>
              <p className="text-muted-foreground">Pick up where you left off or try something new</p>
            </div>
            <div className="flex flex-wrap gap-4">
              <Link
                href={`/learn/${languageCode}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all duration-200"
              >
                <Zap className="w-4 h-4" />
                Quick Practice
              </Link>
              <Link
                href={`/dictionaries/${languageCode}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-background text-foreground rounded-xl font-bold border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:shadow-[6px_6px_0px_0px] hover:-translate-y-1 transition-all duration-200"
              >
                <BookOpen className="w-4 h-4" />
                Browse Dictionary
              </Link>
            </div>
          </div>
        </div>
      </section>
    </SharedLayout>
  );
}
