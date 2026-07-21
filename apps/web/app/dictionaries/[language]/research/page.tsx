import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SharedLayout from '../../../components/SharedLayout';
import { getOverviewData } from '@/lib/kuku-yalanji-research.server';
import KukuYalanjiResearchClient from './KukuYalanjiResearchClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kuku Yalanji Corpus Workbench',
  description: 'Explore the Kuku Yalanji dictionary, verified synthetic sentence corpus, lexeme ledger, corpus audits, and v2 model evidence.',
  alternates: { canonical: '/dictionaries/kuku_yalanji/research' },
};

export default async function KukuYalanjiResearchPage({
  params,
}: {
  params: Promise<{ language: string }>;
}) {
  const { language } = await params;
  if (language !== 'kuku_yalanji') notFound();

  const overview = getOverviewData();

  return (
    <SharedLayout>
      <KukuYalanjiResearchClient initialOverview={overview} />
    </SharedLayout>
  );
}
