import type { Metadata } from 'next';
import SharedLayout from '../../components/SharedLayout';
import KukuYalanjiV2LabClient from './KukuYalanjiV2LabClient';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Kuku Yalanji v2 — research preview',
  description:
    'Live English to Kuku Yalanji machine translation from the experimental v21.2 model. A research preview, not elder-verified.',
  path: '/labs/v2',
  noindex: true,
});

export default function LabsV2Page() {
  return (
    <SharedLayout>
      <KukuYalanjiV2LabClient />
    </SharedLayout>
  );
}
