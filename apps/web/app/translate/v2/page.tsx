import type { Metadata } from 'next';
import SharedLayout from '../../components/SharedLayout';
import KukuYalanjiV2LabClient from '../../labs/v2/KukuYalanjiV2LabClient';

export const metadata: Metadata = {
  title: 'English to Kuku Yalanji research translator',
  description: 'Enter an English sentence and generate a research-draft Kuku Yalanji translation with model v21.2.',
  alternates: { canonical: '/translate/v2' },
};

export default function TranslateV2Page() {
  return (
    <SharedLayout>
      <KukuYalanjiV2LabClient />
    </SharedLayout>
  );
}
