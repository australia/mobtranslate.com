import SharedLayout from '../components/SharedLayout';
import {
  Code,
  Users,
  Globe,
  Check,
  Bug,
} from 'lucide-react';

const STEPS = [
  {
    title: 'Fork the repository',
    description:
      'Head to our GitHub repository and fork it to your own account. This gives you a personal copy to work with.',
  },
  {
    title: 'Set up your environment',
    description:
      'Clone your fork, install dependencies with pnpm, and start the dev server. The README has detailed setup instructions.',
  },
  {
    title: 'Pick an issue or idea',
    description:
      'Browse open issues labelled “good first issue” or “help wanted”, or propose your own improvement.',
  },
  {
    title: 'Submit a pull request',
    description:
      'Make your changes, write clear commit messages, and open a PR. We review contributions promptly and appreciate every one.',
  },
];

const WAYS = [
  {
    icon: Code,
    title: 'Code & engineering',
    items: ['Fix bugs and improve performance', 'Build features and components', 'Write tests and docs', 'Review pull requests'],
  },
  {
    icon: Globe,
    title: 'Linguistics & language',
    items: ['Add words and translations', 'Verify existing entries', 'Record pronunciations', 'Provide cultural context'],
  },
  {
    icon: Users,
    title: 'Community & outreach',
    items: ['Share the project', 'Connect us with communities', 'Report issues, suggest features', 'Help moderate contributions'],
  },
];

export default function ContributePage() {
  return (
    <SharedLayout>
      <div className="marketing max-w-3xl">
        {/* Hero */}
        <div className="py-12 md:py-16">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary mb-5">Open source</p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold tracking-[-0.025em] mb-6 leading-[1.05]">
            Help build it
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            Mob Translate is built by the community, for the community. Whether you write code,
            speak an Indigenous language, or just want to learn, there&apos;s a way for you to help.
          </p>
        </div>
      </div>

      {/* How to contribute — numbered editorial steps, no side-stripe cards */}
      <section className="marketing max-w-3xl mb-20">
        <h2 className="text-2xl sm:text-3xl font-display font-bold mb-2">How to contribute</h2>
        <p className="text-muted-foreground mb-10">
          Getting started is straightforward. Four steps to your first contribution.
        </p>

        <ol className="space-y-9">
          {STEPS.map((item, i) => (
            <li key={item.title} className="flex gap-5">
              <span className="font-display text-3xl font-bold text-primary/80 leading-none tabular-nums w-10 shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="pt-0.5">
                <h3 className="font-semibold text-base mb-1.5">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">{item.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Ways to help */}
      <section className="marketing max-w-5xl mb-20">
        <h2 className="text-2xl sm:text-3xl font-display font-bold mb-2">Ways to help</h2>
        <p className="text-muted-foreground mb-10 max-w-2xl">
          You don&apos;t need to be a developer. There are many ways to support the project.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-10">
          {WAYS.map((category) => (
            <div key={category.title}>
              <category.icon className="w-5 h-5 text-primary mb-3" aria-hidden="true" />
              <h3 className="text-base font-semibold mb-3">{category.title}</h3>
              <ul className="space-y-2.5">
                {category.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-secondary shrink-0 mt-1" aria-hidden="true" />
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Quick links */}
      <section className="marketing max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-5 mb-20">
        <div className="rounded-xl border border-border p-8">
          <h3 className="text-xl font-display font-semibold mb-2">Report an issue</h3>
          <p className="text-muted-foreground mb-6 leading-relaxed text-sm">
            Found a bug or something that could be better? Open an issue and let us know.
          </p>
          <a
            href="https://github.com/australia/mobtranslate.com/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-btn mt-btn-secondary mt-btn-md inline-flex"
          >
            <Bug size={18} /> New issue
          </a>
        </div>

        <div className="rounded-xl border border-border p-8">
          <h3 className="text-xl font-display font-semibold mb-2">View source code</h3>
          <p className="text-muted-foreground mb-6 leading-relaxed text-sm">
            Browse the full source, read the docs, and explore the codebase on GitHub.
          </p>
          <a
            href="https://github.com/australia/mobtranslate.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-btn mt-btn-primary mt-btn-md inline-flex"
          >
            <Code size={18} /> View on GitHub
          </a>
        </div>
      </section>
    </SharedLayout>
  );
}

export async function generateMetadata() {
  return {
    title: 'Contribute | Mob Translate',
    description: 'Help build Mob Translate by contributing code, linguistics, or community support. Every contribution matters.',
  };
}
