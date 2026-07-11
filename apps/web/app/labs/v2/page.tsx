import type { Metadata } from 'next';
import SharedLayout from '../../components/SharedLayout';
import KukuYalanjiV2LabClient from './KukuYalanjiV2LabClient';

export const metadata: Metadata = {
  title: 'Kuku Yalanji v2 — research preview',
  description:
    'Live English to Kuku Yalanji machine translation from the experimental v21.2 model. A research preview, not elder-verified.',
  alternates: { canonical: '/labs/v2' },
  robots: { index: false, follow: false },
};

export default function LabsV2Page() {
  return (
    <SharedLayout>
      <KukuYalanjiV2LabClient />
    </SharedLayout>
  );
}
