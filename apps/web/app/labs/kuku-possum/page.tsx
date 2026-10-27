import type { Metadata } from 'next';
import SharedLayout from '../../components/SharedLayout';
import KukuPossumLexicalClient from './KukuPossumLexicalClient';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Kuku Possum candidate lexical model',
  description:
    'A source-backed, multi-variety Kuku Possum candidate lexical research model. Not sentence translation.',
  path: '/labs/kuku-possum',
});

export default function KukuPossumLexicalPage() {
  return (
    <SharedLayout>
      <KukuPossumLexicalClient />
    </SharedLayout>
  );
}

