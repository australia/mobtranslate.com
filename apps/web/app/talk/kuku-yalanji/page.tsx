import type { Metadata } from 'next';
import SharedLayout from '@/app/components/SharedLayout';
import KukuYalanjiTalkClient from './KukuYalanjiTalkClient';

export const metadata: Metadata = {
  title: 'Talk in Kuku Yalanji',
  description:
    'An early voice-listening and spoken conversation test for Kuku Yalanji.',
  alternates: { canonical: '/talk/kuku-yalanji' },
};

export default function KukuYalanjiTalkPage() {
  return (
    <SharedLayout>
      <KukuYalanjiTalkClient />
    </SharedLayout>
  );
}
