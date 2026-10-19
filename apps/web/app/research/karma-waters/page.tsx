import type { Metadata } from 'next';
import Link from 'next/link';
import { resources } from './content';

export const metadata: Metadata = {
  title: 'Karma Waters wildlife and resource notes',
  description: 'A growing encyclopedia of the animals, plants and materials of Karma Waters Country.',
  robots: { index: false, follow: false },
};

export default function KarmaWatersResearchIndex() {
  return (
    <main className="min-h-screen bg-[#f5f3ec] text-[#263b34]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-12">
        <Link href="/" className="text-sm text-[#496b5d] hover:underline">Mobtranslate</Link>
        <header className="mt-10 max-w-3xl border-b border-[#cbd3c7] pb-8">
          <p className="text-sm text-[#66786d]">Country encyclopedia · Western Yalanji</p>
          <h1 className="mt-3 font-display text-5xl leading-tight sm:text-6xl">Karma Waters</h1>
          <p className="mt-5 text-lg leading-8 text-[#43564d]">Wildlife and resource notes for Karma Waters Station and the surrounding Mitchell River country. The collection is growing; these first pages cover three animals named or pictured by the station.</p>
        </header>

        <section className="py-8" aria-labelledby="resource-pages">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="resource-pages" className="text-2xl font-semibold">Animals</h2>
            <span className="text-sm text-[#687c74]">{resources.length} pages</span>
          </div>
          <div className="mt-5 divide-y divide-[#d5dbd1] border-y border-[#d5dbd1]">
            {resources.map((resource) => (
              <Link key={resource.slug} href={`/research/karma-waters/${resource.slug}`} className="group flex flex-col gap-2 py-5 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <h3 className="text-xl font-semibold group-hover:text-[#9a4f2e]">{resource.title}</h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-[#53645e]">{resource.introduction}</p>
                </div>
                <span className="shrink-0 text-sm text-[#77877f]">{resource.group} →</span>
              </Link>
            ))}
          </div>
        </section>
        <footer className="border-t border-[#cbd3c7] py-5 text-sm leading-6 text-[#65746b]">Wildlife records and cultural knowledge are kept distinct. Shared knowledge from other Countries is labelled and does not stand in for a local account.</footer>
      </div>
    </main>
  );
}
