import type { NextRequest } from 'next/server';
import {
  modelApiError,
  modelApiOptions,
  modelApiOrigin,
  modelApiResponse,
} from '@/lib/models/apiResponse';
import { publicModel } from '@/lib/models/distribution';
import { findModel, loadModelRegistry } from '@/lib/models/registry';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return modelApiOptions();
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await props.params;
    const model = findModel(loadModelRegistry(), modelId);
    if (!model) {
      return modelApiError('model_not_found', `No model named "${modelId}" exists.`, 404);
    }
    return modelApiResponse(publicModel(model, modelApiOrigin(request)));
  } catch (error) {
    console.error('Failed to load model registry entry', error);
    return modelApiError('registry_unavailable', 'The model registry is temporarily unavailable.', 500);
  }
}
