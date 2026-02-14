import Link from 'next/link';
import { Github, Twitter, Globe, Code, BookOpen, Users, Heart, Target, Sparkles, CheckCircle } from 'lucide-react';
import SharedLayout from '../components/SharedLayout';
import { Card, CardContent, Button } from '@mobtranslate/ui';
import { getLanguageStats } from '@/lib/supabase/queries';

export const revalidate = 3600;

export default async function About() {
  const stats = await getLanguageStats();

  return (
    <SharedLayout>
      {/* Hero */}
      <div className="py-10 md:py-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
          <Heart className="w-3.5 h-3.5" />
          Our Mission
        </div>
        <h1 className="text-4xl md:text-5xl font-display font-black tracking-tight mb-4">
          Preserving Languages,{' '}
          <span className="text-primary">Preserving Worlds</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl leading-relaxed">
          Mob Translate is a community-driven open-source project building the tools
          that give Indigenous languages a digital future. We believe every language
          carries a unique way of understanding the world &mdash; and deserves to thrive.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-6 mb-16">
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-display font-black text-primary">{stats.totalLanguages}</div>
            <div className="text-sm text-muted-foreground mt-1">Languages</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-display font-black text-primary">{stats.totalWords.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground mt-1">Dictionary Words</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-display font-black text-primary">100%</div>
            <div className="text-sm text-muted-foreground mt-1">Open Source</div>
          </CardContent>
        </Card>
      </div>

      {/* Goals */}
      <section className="mb-16">
        <h2 className="text-2xl font-display font-bold mb-8">What We&apos;re Building</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            {
              icon: Globe,
              title: 'Translation for Everyone',
              description: 'A "Google Translate" for Indigenous languages &mdash; free, open, and accessible to all.',
            },
            {
              icon: BookOpen,
              title: 'Living Dictionaries',
              description: 'Community-curated word lists that grow and evolve, preserving authentic meaning and pronunciation.',
            },
            {
              icon: Sparkles,
              title: 'AI-Powered Tools',
              description: 'Language models trained on real dictionary data, providing contextual translations with cultural sensitivity.',
            },
            {
              icon: Users,
              title: 'Community First',
              description: 'Built with and for Indigenous communities, linguists, and language learners around the world.',
            },
          ].map((goal) => (
            <div key={goal.title} className="flex gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <goal.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold mb-1">{goal.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: goal.description }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Current Features */}
      <section className="mb-16">
        <h2 className="text-2xl font-display font-bold mb-8">What&apos;s Live Now</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            'Dictionary support for multiple Indigenous languages',
            'AI-powered English to Indigenous language translation',
            'Interactive language learning games and quizzes',
            'Community contribution and word rating system',
            'Dark mode and mobile-responsive design',
            'Place name mapping with geographic data',
          ].map((feature) => (
            <div key={feature} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <span className="text-sm">{feature}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Contact & Get Involved - side by side */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
        <Card>
          <CardContent className="p-8">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <Twitter className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-xl font-display font-bold mb-2">Get in Touch</h3>
            <p className="text-muted-foreground mb-6">
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

        <Card>
          <CardContent className="p-8">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <Code className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-xl font-display font-bold mb-2">Contribute</h3>
            <p className="text-muted-foreground mb-6">
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
    </SharedLayout>
  );
}

export async function generateMetadata() {
  return {
    title: 'About Mob Translate | Indigenous Language Translation',
    description: 'Learn about our mission to preserve and promote Indigenous languages through open-source translation tools and community collaboration.',
  };
}
