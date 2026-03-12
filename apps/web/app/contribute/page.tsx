import SharedLayout from '../components/SharedLayout';
import { Card, CardContent, Button } from '@mobtranslate/ui';
import {
  Github,
  Code,
  Users,
  Heart,
  Globe,
  CheckCircle,
  GitPullRequest,
  Bug,
  Lightbulb,
} from 'lucide-react';

export default function ContributePage() {
  return (
    <SharedLayout>
      {/* Hero */}
      <div className="py-12 md:py-20">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-sm font-semibold mb-6 border border-emerald-200 dark:border-emerald-800/50">
          <Heart className="w-4 h-4 fill-current" />
          Open Source
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-black tracking-tight mb-6 leading-tight">
          Help Preserve{' '}
          <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 dark:from-emerald-400 dark:via-teal-400 dark:to-cyan-400 bg-clip-text text-transparent">
            Indigenous Languages
          </span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl leading-relaxed">
          Mob Translate is built by the community, for the community. Whether you write code,
          speak an Indigenous language, or want to learn &mdash; there&apos;s a way for you to help.
        </p>
      </div>

      {/* Steps to Contribute */}
      <section className="mb-20">
        <h2 className="text-2xl sm:text-3xl font-display font-bold mb-2">How to Contribute</h2>
        <p className="text-muted-foreground mb-8 max-w-2xl">
          Getting started is easy. Follow these steps to make your first contribution.
        </p>

        <div className="space-y-4">
          {[
            {
              step: 1,
              title: 'Fork the Repository',
              description: 'Head to our GitHub repository and fork it to your own account. This creates your personal copy to work with.',
              icon: Github,
              color: 'bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300',
              borderColor: 'border-l-gray-500',
            },
            {
              step: 2,
              title: 'Set Up Your Environment',
              description: 'Clone your fork, install dependencies with pnpm, and start the dev server. Our README has detailed setup instructions.',
              icon: Code,
              color: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400',
              borderColor: 'border-l-amber-500',
            },
            {
              step: 3,
              title: 'Pick an Issue or Idea',
              description: 'Browse open issues labeled "good first issue" or "help wanted". Or propose your own improvement.',
              icon: Lightbulb,
              color: 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400',
              borderColor: 'border-l-orange-500',
            },
            {
              step: 4,
              title: 'Submit a Pull Request',
              description: 'Make your changes, write clear commit messages, and open a PR. We review contributions promptly and appreciate every one.',
              icon: GitPullRequest,
              color: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400',
              borderColor: 'border-l-emerald-500',
            },
          ].map((item) => (
            <Card key={item.step} className={`border-l-4 ${item.borderColor}`}>
              <CardContent className="p-5 sm:p-6">
                <div className="flex gap-4 items-start">
                  <div className={`w-11 h-11 rounded-xl ${item.color} flex items-center justify-center shrink-0`}>
                    <span className="font-display font-black text-lg">{item.step}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-base mb-1">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Ways to Help */}
      <section className="mb-20">
        <h2 className="text-2xl sm:text-3xl font-display font-bold mb-2">Ways to Help</h2>
        <p className="text-muted-foreground mb-8 max-w-2xl">
          You don&apos;t need to be a developer to contribute. Here are the many ways you can support the project.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: Code,
              title: 'Code & Engineering',
              items: [
                'Fix bugs and improve performance',
                'Build new features and components',
                'Write tests and documentation',
                'Review pull requests',
              ],
              iconBg: 'bg-violet-50 dark:bg-violet-950/40',
              iconColor: 'text-violet-600 dark:text-violet-400',
              borderColor: 'border-t-violet-500',
            },
            {
              icon: Globe,
              title: 'Linguistics & Language',
              items: [
                'Add words and translations',
                'Verify existing dictionary entries',
                'Record pronunciations',
                'Provide cultural context',
              ],
              iconBg: 'bg-amber-50 dark:bg-amber-950/40',
              iconColor: 'text-amber-600 dark:text-amber-400',
              borderColor: 'border-t-amber-500',
            },
            {
              icon: Users,
              title: 'Community & Outreach',
              items: [
                'Share the project with others',
                'Connect us with language communities',
                'Report issues and suggest features',
                'Help moderate contributions',
              ],
              iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
              iconColor: 'text-emerald-600 dark:text-emerald-400',
              borderColor: 'border-t-emerald-500',
            },
          ].map((category) => (
            <Card key={category.title} className={`border-t-4 ${category.borderColor}`}>
              <CardContent className="p-6">
                <div className={`w-12 h-12 rounded-xl ${category.iconBg} flex items-center justify-center mb-4`}>
                  <category.icon className={`w-6 h-6 ${category.iconColor}`} />
                </div>
                <h3 className="text-lg font-display font-bold mb-3">{category.title}</h3>
                <ul className="space-y-2">
                  {category.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Quick Links */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-20">
        <Card className="border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-8">
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center mb-5">
              <Bug className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <h3 className="text-xl font-display font-bold mb-2">Report an Issue</h3>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Found a bug or something that could be better? Open an issue on GitHub
              and let us know.
            </p>
            <Button asChild>
              <a
                href="https://github.com/australia/mobtranslate.com/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2"
              >
                <Bug size={18} />
                New Issue
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-8">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mb-5">
              <Github className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
            </div>
            <h3 className="text-xl font-display font-bold mb-2">View Source Code</h3>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Browse the full source code, read the docs, and explore the codebase
              on GitHub.
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
    title: 'Contribute | Mob Translate',
    description: 'Help preserve Indigenous languages by contributing to Mob Translate. Code, linguistics, or community support -- every contribution matters.',
  };
}
