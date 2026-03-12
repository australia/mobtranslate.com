import { Github, Twitter, Globe, Code, BookOpen, Users, Heart, Sparkles, CheckCircle } from 'lucide-react';
import SharedLayout from '../components/SharedLayout';
import { Card, CardContent, Button } from '@mobtranslate/ui';
import { getLanguageStats } from '@/lib/supabase/queries';

export const revalidate = 3600;

export default async function About() {
  const stats = await getLanguageStats();

  return (
    <SharedLayout>
      {/* Hero */}
      <div className="py-12 md:py-20">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-sm font-semibold mb-6 border border-amber-200 dark:border-amber-800/50">
          <Heart className="w-4 h-4 fill-current" />
          Our Mission
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-black tracking-tight mb-6 leading-tight">
          Preserving Languages,{' '}
          <span className="bg-gradient-to-r from-amber-600 via-orange-500 to-rose-500 dark:from-amber-400 dark:via-orange-400 dark:to-rose-400 bg-clip-text text-transparent">
            Preserving Worlds
          </span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl leading-relaxed">
          Mob Translate is a community-driven open-source project building the tools
          that give Indigenous languages a digital future. We believe every language
          carries a unique way of understanding the world &mdash; and deserves to thrive.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-20">
        {[
          { value: stats.totalLanguages, label: 'Languages', accent: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40' },
          { value: stats.totalWords.toLocaleString(), label: 'Dictionary Words', accent: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/40' },
          { value: '100%', label: 'Open Source', accent: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40' },
        ].map((stat) => (
          <Card key={stat.label} className={`border ${stat.accent}`}>
            <CardContent className="p-6 sm:p-8 text-center">
              <div className="text-4xl sm:text-5xl font-display font-black text-foreground mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
                {stat.label}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Goals */}
      <section className="mb-20">
        <h2 className="text-2xl sm:text-3xl font-display font-bold mb-2">What We&apos;re Building</h2>
        <p className="text-muted-foreground mb-8 max-w-2xl">
          Tools and platforms to ensure Indigenous languages flourish in the digital age.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[
            {
              icon: Globe,
              title: 'Translation for Everyone',
              description: 'A "Google Translate" for Indigenous languages &mdash; free, open, and accessible to all.',
              borderColor: 'border-l-amber-500',
              iconBg: 'bg-amber-50 dark:bg-amber-950/40',
              iconColor: 'text-amber-600 dark:text-amber-400',
            },
            {
              icon: BookOpen,
              title: 'Living Dictionaries',
              description: 'Community-curated word lists that grow and evolve, preserving authentic meaning and pronunciation.',
              borderColor: 'border-l-orange-500',
              iconBg: 'bg-orange-50 dark:bg-orange-950/40',
              iconColor: 'text-orange-600 dark:text-orange-400',
            },
            {
              icon: Sparkles,
              title: 'AI-Powered Tools',
              description: 'Language models trained on real dictionary data, providing contextual translations with cultural sensitivity.',
              borderColor: 'border-l-rose-500',
              iconBg: 'bg-rose-50 dark:bg-rose-950/40',
              iconColor: 'text-rose-600 dark:text-rose-400',
            },
            {
              icon: Users,
              title: 'Community First',
              description: 'Built with and for Indigenous communities, linguists, and language learners around the world.',
              borderColor: 'border-l-emerald-500',
              iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
              iconColor: 'text-emerald-600 dark:text-emerald-400',
            },
          ].map((goal) => (
            <Card key={goal.title} className={`border-l-4 ${goal.borderColor}`}>
              <CardContent className="p-5 sm:p-6">
                <div className="flex gap-4">
                  <div className={`w-11 h-11 rounded-xl ${goal.iconBg} flex items-center justify-center shrink-0`}>
                    <goal.icon className={`w-5 h-5 ${goal.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base mb-1">{goal.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: goal.description }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Current Features */}
      <section className="mb-20">
        <h2 className="text-2xl sm:text-3xl font-display font-bold mb-2">What&apos;s Live Now</h2>
        <p className="text-muted-foreground mb-8 max-w-2xl">
          Features already available for communities, learners, and contributors.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            'Dictionary support for multiple Indigenous languages',
            'AI-powered English to Indigenous language translation',
            'Interactive language learning games and quizzes',
            'Community contribution and word rating system',
            'Dark mode and mobile-responsive design',
            'Place name mapping with geographic data',
          ].map((feature) => (
            <Card key={feature}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-sm font-medium">{feature}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Contact & Get Involved - side by side */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-20">
        <Card className="border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-8">
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center mb-5">
              <Twitter className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <h3 className="text-xl font-display font-bold mb-2">Get in Touch</h3>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Questions, collaboration ideas, or just want to say hello?
              Reach out on Twitter.
            </p>
            <Button asChild>
              <a
                href="https://twitter.com/ajaxdavis"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2"
              >
                <Twitter size={18} />
                @ajaxdavis
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-8">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mb-5">
              <Code className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
            </div>
            <h3 className="text-xl font-display font-bold mb-2">Contribute</h3>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              We welcome developers, linguists, and community members.
              Every contribution makes a difference.
            </p>
            <Button asChild>
              <a
                href="https://github.com/australia/mobtranslate.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2"
              >
                <Github size={18} />
                View on GitHub
              </a>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Cultural Acknowledgement */}
      <section className="mb-16">
        <Card className="border-amber-200 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 via-orange-50/50 to-rose-50/30 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-rose-950/10">
          <CardContent className="p-8 sm:p-10">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-200/60 dark:bg-amber-800/40 flex items-center justify-center shrink-0 mt-1">
                <Heart className="w-5 h-5 text-amber-700 dark:text-amber-400 fill-current" />
              </div>
              <div>
                <h3 className="text-lg font-display font-bold mb-2 text-amber-900 dark:text-amber-300">
                  Cultural Acknowledgement
                </h3>
                <p className="text-amber-800/80 dark:text-amber-400/70 leading-relaxed text-sm">
                  We acknowledge the Traditional Custodians of the lands on which we work and live.
                  We pay our respects to Elders past, present, and emerging, and recognise the
                  ongoing connection of Indigenous peoples to their languages, cultures, and Country.
                  This project exists to support &mdash; not replace &mdash; the vital work of
                  Indigenous communities in preserving and revitalising their languages.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </SharedLayout>
  );
}

export async function generateMetadata() {
  return {
    title: 'About Mob Translate | Indigenous Language Translation',
    description: 'Learn about our mission to preserve and promote Indigenous languages through open-source translation tools and community collaboration.',
  };
}
