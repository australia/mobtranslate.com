import type { Metadata } from 'next';
import SharedLayout from '../../components/SharedLayout';
import KukuYalanjiV2LabClient from '../../labs/v2/KukuYalanjiV2LabClient';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'English to Kuku Yalanji research translator',
  description:
    'Enter an English sentence and generate a research-draft Kuku Yalanji translation with model v21.2.',
  path: '/translate/v2',
});

export default function TranslateV2Page() {
  return (
    <SharedLayout>
      <KukuYalanjiV2LabClient />
    </SharedLayout>
  );
}
