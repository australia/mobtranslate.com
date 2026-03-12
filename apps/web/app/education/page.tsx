import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';
import { Card, CardContent } from '@mobtranslate/ui';
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
    iconBg: 'bg-violet-50 dark:bg-violet-950/40',
    iconColor: 'text-violet-600 dark:text-violet-400',
    borderColor: 'border-l-violet-500',
  },
  {
    id: 'quiz',
    name: 'Word Quiz',
    description: 'Test your vocabulary with multiple choice',
    icon: Target,
    iconBg: 'bg-amber-50 dark:bg-amber-950/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
    borderColor: 'border-l-amber-500',
  },
  {
    id: 'flashcards',
    name: 'Flashcards',
    description: 'Study with interactive flip cards',
    icon: BookOpen,
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-l-emerald-500',
  },
  {
    id: 'scramble',
    name: 'Word Scramble',
    description: 'Unscramble letters to form words',
    icon: Puzzle,
    iconBg: 'bg-rose-50 dark:bg-rose-950/40',
    iconColor: 'text-rose-600 dark:text-rose-400',
    borderColor: 'border-l-rose-500',
  },
  {
    id: 'listening',
    name: 'Listening Challenge',
    description: 'Train your ear with audio recognition',
    icon: Volume2,
    iconBg: 'bg-cyan-50 dark:bg-cyan-950/40',
    iconColor: 'text-cyan-600 dark:text-cyan-400',
    borderColor: 'border-l-cyan-500',
  },
  {
    id: 'writing',
    name: 'Writing Practice',
    description: 'Learn to write words correctly',
    icon: PenTool,
    iconBg: 'bg-orange-50 dark:bg-orange-950/40',
    iconColor: 'text-orange-600 dark:text-orange-400',
    borderColor: 'border-l-orange-500',
  },
];

const CURRICULUM_CATEGORIES = [
  { name: 'Basics', icon: BookOpen, lessons: 5, color: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400' },
  { name: 'Family', icon: Users, lessons: 4, color: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/40 text-blue-700 dark:text-blue-400' },
  { name: 'Animals', icon: Sparkles, lessons: 6, color: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400' },
  { name: 'Nature', icon: Target, lessons: 5, color: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-400' },
  { name: 'Food', icon: Brain, lessons: 4, color: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/40 text-orange-700 dark:text-orange-400' },
  { name: 'Numbers', icon: Puzzle, lessons: 3, color: 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-400' },
];

export default async function EducationPage() {
  const languages = await getActiveLanguages();

  return (
    <SharedLayout>
      {/* Hero Section */}
      <div className="py-12 md:py-20">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-sm font-semibold mb-6 border border-amber-200 dark:border-amber-800/50">
          <Sparkles className="w-4 h-4" />
          Interactive Language Learning
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-black tracking-tight mb-6 leading-tight">
          Learn Through{' '}
          <span className="bg-gradient-to-r from-amber-600 via-orange-500 to-rose-500 dark:from-amber-400 dark:via-orange-400 dark:to-rose-400 bg-clip-text text-transparent">
            Play & Discovery
          </span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl leading-relaxed mb-10">
          Fun ways to explore Indigenous languages together.
          Games, lessons, and interactive experiences for all skill levels.
        </p>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 max-w-lg">
          {[
            { value: languages.length, label: 'Languages' },
            { value: '6', label: 'Game Types' },
            { value: '27+', label: 'Lessons' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl sm:text-4xl font-display font-black text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Games Section */}
      <section id="games" className="mb-20">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl sm:text-3xl font-display font-bold">Learn by Playing</h2>
        </div>
        <p className="text-muted-foreground mb-8 max-w-2xl">
          Six different game modes designed to make language learning fun and effective.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {GAME_TYPES.map((game) => (
            <Card key={game.id} className={`border-l-4 ${game.borderColor} hover:-translate-y-1 transition-transform duration-200`}>
              <CardContent className="p-5 sm:p-6">
                <div className={`w-12 h-12 rounded-xl ${game.iconBg} flex items-center justify-center mb-4`}>
                  <game.icon className={`w-6 h-6 ${game.iconColor}`} />
                </div>
                <h3 className="text-lg font-display font-bold mb-1">{game.name}</h3>
                <p className="text-sm text-muted-foreground">{game.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Languages Section */}
      <section id="languages" className="mb-20">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 text-sm font-semibold mb-4 border border-orange-200 dark:border-orange-800/50">
          <GraduationCap className="w-4 h-4" />
          Choose Your Language
        </div>
        <h2 className="text-2xl sm:text-3xl font-display font-bold mb-2">Start Your Journey</h2>
        <p className="text-muted-foreground mb-8 max-w-2xl">
          Select a language to begin exploring its rich vocabulary and cultural heritage.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {languages.map((language, index) => {
            const accentColors = [
              { border: 'border-l-amber-500', badge: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' },
              { border: 'border-l-orange-500', badge: 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400' },
              { border: 'border-l-emerald-500', badge: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' },
            ];
            const accent = accentColors[index % 3];

            return (
              <Link key={language.id} href={`/education/${language.code}`} className="group block">
                <Card className={`border-l-4 ${accent.border} h-full hover:-translate-y-1 transition-transform duration-200`}>
                  <CardContent className="p-6">
                    <h3 className="text-2xl font-display font-bold mb-2 group-hover:text-primary transition-colors">
                      {language.name}
                    </h3>

                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {language.description || `Learn the beautiful language of the ${language.name} people`}
                    </p>

                    <div className="flex flex-wrap gap-2 mb-5">
                      {language.region && (
                        <span className="px-3 py-1 bg-muted rounded-full text-xs font-medium">
                          {language.region}
                        </span>
                      )}
                      {language.status && (
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          language.status === 'severely endangered'
                            ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400'
                            : language.status === 'vulnerable'
                            ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
                            : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                        }`}>
                          {language.status}
                        </span>
                      )}
                    </div>

                    {/* Features */}
                    <div className="flex items-center gap-4 pt-4 border-t border-border mb-4">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Gamepad2 className="w-3.5 h-3.5" />
                        <span>6 Games</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Lessons</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Trophy className="w-3.5 h-3.5" />
                        <span>Progress</span>
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-primary group-hover:underline">Start Learning</span>
                      <ChevronRight className="w-4 h-4 text-primary group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Curriculum Preview */}
      <section className="mb-20">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-sm font-semibold mb-4 border border-emerald-200 dark:border-emerald-800/50">
          <BookOpen className="w-4 h-4" />
          Structured Curriculum
        </div>
        <h2 className="text-2xl sm:text-3xl font-display font-bold mb-2">Learn Step by Step</h2>
        <p className="text-muted-foreground mb-8 max-w-2xl">
          Our lessons are organized into thematic categories, from basic greetings to advanced conversations.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {CURRICULUM_CATEGORIES.map((category) => (
            <Card key={category.name} className={`${category.color} border hover:scale-105 transition-transform duration-200 cursor-pointer`}>
              <CardContent className="p-5 text-center">
                <div className="w-10 h-10 rounded-xl bg-white/60 dark:bg-white/10 flex items-center justify-center mx-auto mb-3">
                  <category.icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm mb-0.5">{category.name}</h3>
                <p className="text-xs opacity-70">{category.lessons} lessons</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Why Learn With Us */}
      <section className="mb-20">
        <Card className="border-amber-200 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 via-orange-50/50 to-rose-50/30 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-rose-950/10">
          <CardContent className="p-8 sm:p-10">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-sm font-semibold mb-5 border border-amber-200 dark:border-amber-700/50">
                  <Zap className="w-4 h-4" />
                  Why Learn With Us
                </div>
                <h2 className="text-3xl sm:text-4xl font-display font-black mb-4">
                  More Than Just{' '}
                  <span className="bg-gradient-to-r from-amber-600 to-orange-500 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
                    Translation
                  </span>
                </h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  We&apos;re building tools that help preserve and revitalize Indigenous languages
                  through engaging, community-driven education.
                </p>

                <div className="space-y-3">
                  {[
                    { icon: Brain, text: 'Spaced repetition for long-term memory' },
                    { icon: Gamepad2, text: 'Game-based learning keeps you engaged' },
                    { icon: Users, text: 'Community-contributed content' },
                    { icon: Trophy, text: 'Track your progress with achievements' },
                  ].map((feature, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                        <feature.icon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <span className="text-sm font-medium">{feature.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                {/* Progress Card Preview */}
                <Card>
                  <CardContent className="p-6">
                    <div className="text-center mb-5">
                      <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center mx-auto mb-3">
                        <Target className="w-7 h-7 text-amber-600 dark:text-amber-400" />
                      </div>
                      <h3 className="text-xl font-bold mb-1">Daily Goal</h3>
                      <p className="text-sm text-muted-foreground">Learn 10 new words today</p>
                    </div>

                    <div className="bg-muted/50 rounded-xl p-4 mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Progress</span>
                        <span className="text-sm text-amber-600 dark:text-amber-400 font-bold">7/10</span>
                      </div>
                      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full w-[70%] bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-muted/50 rounded-xl p-3 text-center">
                        <div className="text-xl font-bold text-amber-600 dark:text-amber-400">12</div>
                        <div className="text-xs text-muted-foreground">Day Streak</div>
                      </div>
                      <div className="bg-muted/50 rounded-xl p-3 text-center">
                        <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">89%</div>
                        <div className="text-xs text-muted-foreground">Accuracy</div>
                      </div>
                      <div className="bg-muted/50 rounded-xl p-3 text-center">
                        <div className="text-xl font-bold text-muted-foreground">156</div>
                        <div className="text-xs text-muted-foreground">Words</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* CTA Section */}
      <section className="mb-16 text-center">
        <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight mb-4">
          Ready to Start?
        </h2>
        <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
          Choose a language and begin your journey into the beautiful world of Indigenous languages.
        </p>
        <Link
          href="#languages"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition-opacity"
        >
          <Sparkles className="w-5 h-5" />
          Start Learning Now
          <ChevronRight className="w-5 h-5" />
        </Link>
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
