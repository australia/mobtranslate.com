import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SharedLayout from '@/app/components/SharedLayout';
import { findModel, findRelease, loadModelRegistry } from '@/lib/models/registry';
import { loadModelResultSamples } from '@/lib/models/results';
import TranslateV2Client from '../../TranslateV2Client';

type PageParams = {
  modelId: string;
  version: string;
};

export function generateStaticParams(): PageParams[] {
  const registry = loadModelRegistry();
  return registry.models.flatMap((model) =>
    model.releases.map((release) => ({
      modelId: model.id,
      version: release.version,
    })),
  );
}

export async function generateMetadata(
  { params }: { params: Promise<PageParams> },
): Promise<Metadata> {
  const { modelId, version } = await params;
  const registry = loadModelRegistry();
  const model = findModel(registry, modelId);
  const release = model ? findRelease(model, version) : null;

  if (!model || !release) {
    return {
      title: 'Model version not found',
    };
  }

  return {
    title: `${model.name} ${release.version} | Translate v2`,
    description: `Review saved evals for ${model.name} ${release.version}, trained from ${release.dataset}.`,
    alternates: { canonical: `/translate/v2/${model.id}/${release.version}` },
  };
}

export default async function TranslateV2VersionPage(
  { params }: { params: Promise<PageParams> },
) {
  const { modelId, version } = await params;
  const registry = loadModelRegistry();
  const model = findModel(registry, modelId);
  const release = model ? findRelease(model, version) : null;

  if (!model || !release) notFound();

  const results = loadModelResultSamples(registry);

  return (
    <SharedLayout>
      <TranslateV2Client
        registry={registry}
        results={results}
        initialModelId={model.id}
        initialVersion={release.version}
      />
    </SharedLayout>
  );
}
