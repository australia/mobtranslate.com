import type { Metadata } from 'next';
import SharedLayout from '../../components/SharedLayout';
import KukuPossumLexicalClient from './KukuPossumLexicalClient';

export const metadata: Metadata = {
  title: 'Kuku Possum candidate lexical model',
  description:
    'A source-backed, multi-variety Kuku Possum candidate lexical research model. Not sentence translation.',
  alternates: { canonical: '/labs/kuku-possum' },
};

export default function KukuPossumLexicalPage() {
  return (
    <SharedLayout>
      <KukuPossumLexicalClient />
    </SharedLayout>
  );
}

