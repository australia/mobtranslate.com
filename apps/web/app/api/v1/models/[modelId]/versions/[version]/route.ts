import type { NextRequest } from 'next/server';
import {
  modelApiError,
  modelApiOptions,
  modelApiOrigin,
  modelApiResponse,
} from '@/lib/models/apiResponse';
import { publicRelease, resolvePublicRelease } from '@/lib/models/distribution';
import { findModel, loadModelRegistry } from '@/lib/models/registry';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return modelApiOptions();
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ modelId: string; version: string }> },
) {
  try {
    const { modelId, version } = await props.params;
    const model = findModel(loadModelRegistry(), modelId);
    if (!model) {
      return modelApiError('model_not_found', `No model named "${modelId}" exists.`, 404);
    }

    const release = resolvePublicRelease(model, version);
    if (!release) {
      return modelApiError(
        'version_not_found',
        `Model "${modelId}" has no downloadable release named "${version}".`,
        404,
      );
    }

    return modelApiResponse({
      model: {
        id: model.id,
        name: model.name,
        family: model.family,
        task: model.task,
        language: model.language,
        summary: model.summary,
      },
      release: publicRelease(model.id, release, modelApiOrigin(request)),
    });
  } catch (error) {
    console.error('Failed to load model release', error);
    return modelApiError('registry_unavailable', 'The model registry is temporarily unavailable.', 500);
  }
}
