import { Code, AtSign, Globe, BookOpen, Users, Sparkles, Check } from 'lucide-react';
import SharedLayout from '../components/SharedLayout';
import { ContactEmailLink } from '../components/ContactEmailLink';
import { getLanguageStats } from '@/lib/db/queries';

export const revalidate = 3600;

const BUILDING = [
  {
    icon: Globe,
    title: 'Translation for everyone',
    description:
      'A public research translator for Indigenous languages: accessible, source-aware, and explicit that machine output is an unverified draft.',
  },
  {
    icon: BookOpen,
    title: 'Living dictionaries',
    description:
      'Source-traced word lists that can grow through documented corrections and contributions without hiding provenance or review state.',
  },
  {
    icon: Sparkles,
    title: 'AI that knows its place',
    description:
      'Research models and dictionary-grounded prompts that can assist exploration without pretending to be speaker-certified translation.',
  },
  {
    icon: Users,
    title: 'Accountability first',
    description:
      'Language custodians, speakers, linguists, and learners can contribute or correct records; participation and approval are never implied.',
  },
];

const LIVE_NOW = [
  'Dictionaries for multiple Indigenous languages',
  'English to Indigenous language translation',
  'Interactive learning games and quizzes',
  'Community contribution and word rating',
  'Dark mode and a mobile-first layout',
  'Place-name mapping with geographic data',
];

export default async function About() {
  const stats = await getLanguageStats();

  return (
    <SharedLayout>
      <div className="marketing max-w-3xl">
        {/* Hero */}
        <div className="py-12 md:py-16">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary mb-5">About us</p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold tracking-[-0.025em] mb-6 leading-[1.05]">
            Learning Indigenous languages, in the open
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            Mob Translate is an independent open research project for exploring First Nations
            languages. It brings attributed records from dictionaries, grammars, archives,
            recordings, and contributions into one searchable place. Publication here does not
            make a resource official, community-owned, or community-certified.
          </p>
          <p className="mt-6 text-base text-muted-foreground leading-relaxed">
            Today that&apos;s {stats.totalLanguages} languages and{' '}
            {stats.totalWords.toLocaleString()} entries. The application code is MIT-licensed;
            language data and model artifacts retain their own source and upstream terms.
          </p>
        </div>
      </div>

      {/* What we're building */}
      <section className="marketing max-w-4xl mb-20">
        <h2 className="text-2xl sm:text-3xl font-display font-bold mb-8">What we&apos;re building</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-9">
          {BUILDING.map((goal) => (
            <div key={goal.title} className="flex gap-4">
              <goal.icon className="w-5 h-5 text-primary shrink-0 mt-1" aria-hidden="true" />
              <div>
                <h3 className="font-semibold text-base mb-1.5">{goal.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{goal.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* What's live now */}
      <section className="marketing max-w-3xl mb-20">
        <h2 className="text-2xl sm:text-3xl font-display font-bold mb-2">What&apos;s live now</h2>
        <p className="text-muted-foreground mb-8">
          Already available for communities, learners, and contributors.
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3.5">
          {LIVE_NOW.map((feature) => (
            <li key={feature} className="flex items-start gap-3">
              <Check className="w-4 h-4 text-secondary shrink-0 mt-1" aria-hidden="true" />
              <span className="text-[15px]">{feature}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Get involved */}
      <section className="marketing max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-5 mb-20">
        <div className="rounded-xl border border-border p-8">
          <h3 className="text-xl font-display font-semibold mb-2">Get in touch</h3>
          <p className="text-muted-foreground mb-6 leading-relaxed text-sm">
            Questions, collaboration ideas, or just want to say hello? Reach out.
          </p>
          <a
            href="https://twitter.com/ajaxdavis"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-btn mt-btn-secondary mt-btn-md inline-flex"
          >
            <AtSign size={18} /> @ajaxdavis
          </a>
        </div>

        <div className="rounded-xl border border-border p-8">
          <h3 className="text-xl font-display font-semibold mb-2">Contribute</h3>
          <p className="text-muted-foreground mb-6 leading-relaxed text-sm">
            We welcome developers, linguists, and community members. Every contribution counts.
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

      {/* Get in touch */}
      <section className="marketing max-w-3xl mb-24">
        <h2 className="text-2xl sm:text-3xl font-display font-bold mb-2">Get in touch</h2>
        <p className="text-muted-foreground leading-relaxed">
          Questions, corrections, or want your community&apos;s language added? Email{' '}
          <ContactEmailLink className="text-primary font-medium underline underline-offset-2" />{' '}
          and we&apos;ll get back to you.
        </p>
      </section>

    </SharedLayout>
  );
}

export async function generateMetadata() {
  return {
    title: 'About Mob Translate | Indigenous Language Translation',
    description: 'Learn about Mob Translate’s source-attributed research tools for exploring Indigenous languages.',
  };
}
