import { notFound } from 'next/navigation';
import { GuideDocument } from '../../../components/guide-document';
import { foundations } from '../../../content/foundations';

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(foundations).filter(slug => !['typography', 'spacing', 'elevation', 'motion'].includes(slug)).map(slug => ({ slug }));
}
export default async function FoundationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!Object.hasOwn(foundations, slug)) notFound();
  return <GuideDocument document={foundations[slug]} />;
}
