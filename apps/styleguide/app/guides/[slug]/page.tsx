import { notFound } from 'next/navigation';
import { GuideDocument } from '../../../components/guide-document';
import { developerGuides } from '../../../content/developer-guides';

export const dynamicParams = false;
export function generateStaticParams() {
  return ['composition', 'contribution', 'migration'].map(slug => ({ slug }));
}
export default async function DeveloperGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!Object.hasOwn(developerGuides, slug)) notFound();
  return <GuideDocument document={developerGuides[slug]} />;
}
