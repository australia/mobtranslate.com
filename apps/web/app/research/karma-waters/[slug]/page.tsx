import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resources } from '../content';

export const metadata: Metadata = {
  title: 'Karma Waters wildlife and resource notes',
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return resources.map(({ slug }) => ({ slug }));
}

export default async function CountryResourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resource = resources.find((item) => item.slug === slug);
  if (!resource) notFound();

  return (
    <main className="min-h-screen bg-[#f5f3ec] text-[#263b34]">
      <article className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:px-12">
        <Link href="/research/karma-waters" className="text-sm text-[#496b5d] hover:underline">← Karma Waters resource notes</Link>
        <header className="mt-9 border-b border-[#cbd3c7] pb-7">
          <p className="text-sm text-[#66786d]">Karma Waters · {resource.group}</p>
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">{resource.title}</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-[#43564d]">{resource.introduction}</p>
        </header>

        <div className="mt-7 grid gap-8 md:grid-cols-[minmax(0,1fr)_230px]">
          <div className="space-y-7">
            <section>
              <h2 className="text-2xl font-semibold">Recognition</h2>
              <p className="mt-3 leading-7 text-[#43564d]">{resource.identification}</p>
            </section>
            <section>
              <h2 className="text-2xl font-semibold">Habitat and life</h2>
              <p className="mt-3 leading-7 text-[#43564d]">{resource.habitat}</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-[#43564d]">
                {resource.biology.map((fact) => <li key={fact}>{fact}</li>)}
              </ul>
            </section>
            <section>
              <h2 className="text-2xl font-semibold">Food and use</h2>
              <p className="mt-3 leading-7 text-[#43564d]">{resource.foodAndUse}</p>
            </section>
            {resource.partsAndMaterials && (
              <section>
                <h2 className="text-2xl font-semibold">Shell and other materials</h2>
                <p className="mt-3 leading-7 text-[#43564d]">{resource.partsAndMaterials}</p>
              </section>
            )}
            <section>
              <h2 className="text-2xl font-semibold">Western Yalanji knowledge</h2>
              <p className="mt-3 leading-7 text-[#43564d]">{resource.westernYalanjiRecord}</p>
            </section>
            {resource.otherCountryRecord && (
              <section>
                <h2 className="text-2xl font-semibold">{resource.otherCountryHeading ?? 'Other Country records'}</h2>
                {resource.otherCountryRecord.split('\n\n').map((paragraph) => (
                  <p key={paragraph} className="mt-3 leading-7 text-[#43564d]">{paragraph}</p>
                ))}
              </section>
            )}
          </div>

          <aside className="h-fit rounded-xl border border-[#d3d8cd] bg-[#eeeee5] p-5 text-sm">
            <h2 className="font-semibold">At a glance</h2>
            <dl className="mt-4 space-y-3">
              <div><dt className="text-[#69766c]">Group</dt><dd className="mt-0.5">{resource.group}</dd></div>
              <div><dt className="text-[#69766c]">Scientific name</dt><dd className="mt-0.5 italic">{resource.scientificName}</dd></div>
              <div><dt className="text-[#69766c]">Karma Waters record</dt><dd className="mt-0.5">{resource.status}</dd></div>
            </dl>
          </aside>
        </div>

        <footer className="mt-10 border-t border-[#cbd3c7] py-5 text-sm leading-6 text-[#65746b]">This page is being built as the local record grows. A practice documented on another Country is identified as such and is not presented as Western Yalanji knowledge.</footer>
      </article>
    </main>
  );
}
