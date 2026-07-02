import type { Metadata } from 'next';
import SharedLayout from '../../components/SharedLayout';
import { latestTestableRelease, loadModelRegistry } from '@/lib/models/registry';
import { loadModelResultSamples } from '@/lib/models/results';
import TranslateV2Client from './TranslateV2Client';

export const metadata: Metadata = {
  title: 'Translate v2',
  description: 'Test versioned MobTranslate language models before public release.',
  alternates: { canonical: '/translate/v2' },
};

export default function TranslateV2Page() {
  const registry = loadModelRegistry();
  const results = loadModelResultSamples(registry);
  const firstModel = registry.models[0];
  const firstRelease = firstModel ? latestTestableRelease(firstModel) : null;

  return (
    <SharedLayout>
      <TranslateV2Client
        registry={registry}
        results={results}
        initialModelId={firstModel?.id ?? ''}
        initialVersion={firstRelease?.version ?? ''}
      />
    </SharedLayout>
  );
}
