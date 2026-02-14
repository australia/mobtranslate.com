import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';
import { getActiveLanguages } from '@/lib/supabase/queries';
import {
  BookOpen,
  Gamepad2,
  Brain,
  Sparkles,
  GraduationCap,
  Trophy,
  Users,
  Zap,
  ChevronRight,
  Play,
  Target,
  Puzzle,
  Volume2,
  PenTool
} from 'lucide-react';

export const revalidate = 3600;

const GAME_TYPES = [
  {
    id: 'memory',
    name: 'Memory Match',
    description: 'Match words to their English translations',
    icon: Brain,
    color: 'from-blue-600 to-gray-800',
    bgPattern: 'radial-gradient(circle at 20% 80%, rgba(139, 92, 246, 0.3) 0%, transparent 50%)',
  },
  {
    id: 'quiz',
    name: 'Word Quiz',
    description: 'Test your vocabulary with multiple choice',
    icon: Target,
    color: 'from-amber-500 to-orange-600',
    bgPattern: 'radial-gradient(circle at 80% 20%, rgba(245, 158, 11, 0.3) 0%, transparent 50%)',
  },
  {
    id: 'flashcards',
    name: 'Flashcards',
    description: 'Study with interactive flip cards',
    icon: BookOpen,
    color: 'from-emerald-500 to-teal-600',
    bgPattern: 'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.3) 0%, transparent 50%)',
  },
  {
    id: 'scramble',
    name: 'Word Scramble',
    description: 'Unscramble letters to form words',
    icon: Puzzle,
    color: 'from-rose-500 to-red-600',
    bgPattern: 'radial-gradient(circle at 30% 70%, rgba(244, 63, 94, 0.3) 0%, transparent 50%)',
  },
  {
    id: 'listening',
    name: 'Listening Challenge',
    description: 'Train your ear with audio recognition',
    icon: Volume2,
    color: 'from-cyan-500 to-blue-600',
    bgPattern: 'radial-gradient(circle at 70% 30%, rgba(6, 182, 212, 0.3) 0%, transparent 50%)',
  },
  {
    id: 'writing',
    name: 'Writing Practice',
    description: 'Learn to write words correctly',
    icon: PenTool,
    color: 'from-gray-600 to-gray-800',
    bgPattern: 'radial-gradient(circle at 40% 60%, rgba(217, 70, 239, 0.3) 0%, transparent 50%)',
  },
];

const CURRICULUM_CATEGORIES = [
  { name: 'Basics', icon: '🌱', lessons: 5, color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { name: 'Family', icon: '👨‍👩‍👧‍👦', lessons: 4, color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { name: 'Animals', icon: '🦘', lessons: 6, color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { name: 'Nature', icon: '🌿', lessons: 5, color: 'bg-green-100 text-green-800 border-green-300' },
  { name: 'Food', icon: '🍇', lessons: 4, color: 'bg-gray-100 text-gray-800 border-gray-300' },
  { name: 'Numbers', icon: '🔢', lessons: 3, color: 'bg-rose-100 text-rose-800 border-rose-300' },
];

export default async function EducationPage() {
  const languages = await getActiveLanguages();

  return (
    <SharedLayout>
      {/* Hero Section */}
      <section className="relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16 -mt-6 sm:-mt-8 lg:-mt-12">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
          {/* Geometric Pattern Overlay */}
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
          {/* Floating Orbs */}
          <div className="absolute top-20 left-10 w-72 h-72 bg-gray-500/30 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-gray-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gray-600/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
          <div className="text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white/90 text-sm font-medium mb-8">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Interactive Language Learning</span>
            </div>

            {/* Title */}
            <h1 className="text-5xl sm:text-6xl lg:text-8xl font-display font-black text-white mb-6 tracking-tight">
              <span className="block">Learn Through</span>
              <span className="block bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400 bg-clip-text text-transparent">
                Play & Discovery
              </span>
            </h1>

            <p className="text-xl sm:text-2xl text-white/70 max-w-3xl mx-auto mb-12 font-light leading-relaxed">
              Fun ways to learn. Play ways to explore Indigenous languages together.
              Games, lessons, and interactive experiences for all skill levels.
            </p>

            {/* Stats Row */}
            <div className="flex flex-wrap justify-center gap-8 sm:gap-12 mb-12">
              <div className="text-center">
                <div className="text-4xl sm:text-5xl font-black text-white mb-1">{languages.length}</div>
                <div className="text-white/60 text-sm uppercase tracking-wider">Languages</div>
              </div>
              <div className="text-center">
                <div className="text-4xl sm:text-5xl font-black text-white mb-1">6</div>
                <div className="text-white/60 text-sm uppercase tracking-wider">Game Types</div>
              </div>
              <div className="text-center">
                <div className="text-4xl sm:text-5xl font-black text-white mb-1">27+</div>
                <div className="text-white/60 text-sm uppercase tracking-wider">Lessons</div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="#languages"
                className="group inline-flex items-center gap-2 px-8 py-4 bg-card text-foreground rounded-2xl font-bold text-lg shadow-2xl shadow-foreground/25 hover:shadow-foreground/40 hover:scale-105 transition-all duration-300"
              >
                <Play className="w-5 h-5" />
                Start Learning
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="#games"
                className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 backdrop-blur-sm text-white border-2 border-white/30 rounded-2xl font-bold text-lg hover:bg-white/20 hover:border-white/50 transition-all duration-300"
              >
                <Gamepad2 className="w-5 h-5" />
                Explore Games
              </Link>
            </div>
          </div>
        </div>

        {/* Wave Divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
            <path d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 37.5C840 45 960 60 1080 67.5C1200 75 1320 75 1380 75L1440 75V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" fill="currentColor" className="text-background"/>
          </svg>
        </div>
      </section>

      {/* Games Section */}
      <section id="games" className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-foreground text-sm font-bold mb-4 border-2 border-border">
              <Gamepad2 className="w-4 h-4" />
              INTERACTIVE GAMES
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-display font-black tracking-tight mb-4">
              Learn by Playing
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Six different game modes designed to make language learning fun and effective
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {GAME_TYPES.map((game, index) => (
              <div
                key={game.id}
                className="group relative overflow-hidden rounded-3xl border-4 border-foreground bg-card p-8 transition-all duration-500 hover:-translate-y-2 cursor-pointer"
                style={{
                  boxShadow: '8px 8px 0px 0px var(--color-foreground)',
                  animationDelay: `${index * 100}ms`,
                }}
              >
                {/* Background Gradient */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: game.bgPattern }}
                />

                {/* Icon */}
                <div className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br ${game.color} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>
                  <game.icon className="w-8 h-8 text-white" />
                </div>

                <h3 className="relative text-2xl font-display font-bold mb-2">{game.name}</h3>
                <p className="relative text-muted-foreground">{game.description}</p>

                {/* Hover Arrow */}
                <div className="absolute bottom-8 right-8 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-300">
                  <ChevronRight className="w-6 h-6 text-foreground" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Languages Section */}
      <section id="languages" className="py-16 sm:py-24 bg-muted/30 -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-800 text-sm font-bold mb-4 border-2 border-amber-200">
              <GraduationCap className="w-4 h-4" />
              CHOOSE YOUR LANGUAGE
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-display font-black tracking-tight mb-4">
              Start Your Journey
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Select a language to begin exploring its rich vocabulary and cultural heritage
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {languages.map((language, index) => (
              <Link
                key={language.id}
                href={`/education/${language.code}`}
                className="group block"
              >
                <div
                  className="relative overflow-hidden rounded-3xl border-4 border-foreground bg-card transition-all duration-500 hover:-translate-y-2"
                  style={{
                    boxShadow: '8px 8px 0px 0px var(--color-foreground)',
                  }}
                >
                  {/* Header with gradient */}
                  <div className={`relative h-32 bg-gradient-to-br ${
                    index % 3 === 0 ? 'from-blue-600 to-gray-800' :
                    index % 3 === 1 ? 'from-amber-500 to-orange-600' :
                    'from-emerald-500 to-teal-600'
                  } p-6 flex items-end`}>
                    {/* Pattern Overlay */}
                    <div className="absolute inset-0 opacity-20" style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.5' fill-rule='evenodd'%3E%3Ccircle cx='3' cy='3' r='3'/%3E%3Ccircle cx='13' cy='13' r='3'/%3E%3C/g%3E%3C/svg%3E")`,
                    }} />

                    <h3 className="relative text-3xl font-display font-black text-white uppercase tracking-wide">
                      {language.name}
                    </h3>
                  </div>

                  <div className="p-6">
                    <p className="text-muted-foreground mb-4 line-clamp-2">
                      {language.description || `Learn the beautiful language of the ${language.name} people`}
                    </p>

                    <div className="flex flex-wrap gap-2 mb-6">
                      {language.region && (
                        <span className="px-3 py-1 bg-muted rounded-full text-sm font-medium">
                          {language.region}
                        </span>
                      )}
                      {language.status && (
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          language.status === 'severely endangered'
                            ? 'bg-rose-100 text-rose-800'
                            : language.status === 'vulnerable'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {language.status}
                        </span>
                      )}
                    </div>

                    {/* Features Preview */}
                    <div className="flex items-center gap-4 pt-4 border-t border-border">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Gamepad2 className="w-4 h-4" />
                        <span>6 Games</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <BookOpen className="w-4 h-4" />
                        <span>Lessons</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Trophy className="w-4 h-4" />
                        <span>Progress</span>
                      </div>
                    </div>

                    {/* Hover CTA */}
                    <div className="mt-6 flex items-center justify-between">
                      <span className="font-bold text-primary group-hover:underline">Start Learning</span>
                      <ChevronRight className="w-5 h-5 text-primary group-hover:translate-x-2 transition-transform" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Curriculum Preview */}
      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-800 text-sm font-bold mb-4 border-2 border-emerald-200">
              <BookOpen className="w-4 h-4" />
              STRUCTURED CURRICULUM
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-display font-black tracking-tight mb-4">
              Learn Step by Step
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Our lessons are organized into thematic categories, from basic greetings to advanced conversations
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {CURRICULUM_CATEGORIES.map((category) => (
              <div
                key={category.name}
                className={`relative p-6 rounded-2xl border-2 ${category.color} text-center transition-all duration-300 hover:scale-105 cursor-pointer`}
              >
                <div className="text-4xl mb-3">{category.icon}</div>
                <h3 className="font-bold mb-1">{category.name}</h3>
                <p className="text-sm opacity-70">{category.lessons} lessons</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 sm:py-24 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm text-white/90 text-sm font-medium mb-6">
                <Zap className="w-4 h-4 text-amber-400" />
                WHY LEARN WITH US
              </div>
              <h2 className="text-4xl sm:text-5xl font-display font-black mb-6">
                More Than Just<br />
                <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
                  Translation
                </span>
              </h2>
              <p className="text-xl text-white/70 mb-8">
                We're building tools that help preserve and revitalize Indigenous languages
                through engaging, community-driven education.
              </p>

              <div className="space-y-4">
                {[
                  { icon: Brain, text: 'Spaced repetition for long-term memory' },
                  { icon: Gamepad2, text: 'Game-based learning keeps you engaged' },
                  { icon: Users, text: 'Community-contributed content' },
                  { icon: Trophy, text: 'Track your progress with achievements' },
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                      <feature.icon className="w-6 h-6 text-amber-400" />
                    </div>
                    <span className="text-lg text-white/90">{feature.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              {/* Decorative Card Stack */}
              <div className="relative">
                <div className="absolute -top-4 -left-4 w-full h-full rounded-3xl bg-white/5 border border-white/10" />
                <div className="absolute -top-2 -left-2 w-full h-full rounded-3xl bg-white/10 border border-white/20" />
                <div className="relative bg-white/15 backdrop-blur-sm rounded-3xl border border-white/30 p-8">
                  <div className="text-center mb-6">
                    <div className="text-6xl mb-4">🎯</div>
                    <h3 className="text-2xl font-bold mb-2">Daily Goal</h3>
                    <p className="text-white/70">Learn 10 new words today</p>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-white/10 rounded-xl p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">Progress</span>
                        <span className="text-amber-400 font-bold">7/10</span>
                      </div>
                      <div className="h-3 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full w-[70%] bg-gradient-to-r from-amber-400 to-orange-500 rounded-full" />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-1 bg-white/10 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-amber-400">12</div>
                        <div className="text-xs text-white/60">Day Streak</div>
                      </div>
                      <div className="flex-1 bg-white/10 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-emerald-400">89%</div>
                        <div className="text-xs text-white/60">Accuracy</div>
                      </div>
                      <div className="flex-1 bg-white/10 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-muted-foreground">156</div>
                        <div className="text-xs text-white/60">Words</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-24">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-display font-black tracking-tight mb-6">
            Ready to Start?
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Choose a language and begin your journey into the beautiful world of Indigenous languages.
          </p>
          <Link
            href="#languages"
            className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-lg border-4 border-foreground shadow-[6px_6px_0px_0px] shadow-foreground hover:shadow-[8px_8px_0px_0px] hover:-translate-y-1 transition-all duration-300"
          >
            <Sparkles className="w-5 h-5" />
            Start Learning Now
            <ChevronRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </SharedLayout>
  );
}

export async function generateMetadata() {
  return {
    title: 'Education - Learn Indigenous Languages | Mob Translate',
    description: 'Interactive games, lessons, and learning tools to help you master Indigenous languages. Memory games, quizzes, flashcards, and more.',
    openGraph: {
      title: 'Education - Learn Indigenous Languages | Mob Translate',
      description: 'Interactive games, lessons, and learning tools for Indigenous language learning.',
      type: 'website',
    },
  };
}
