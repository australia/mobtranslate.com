import type { NextRequest } from 'next/server';
import {
  modelApiError,
  modelApiOptions,
  modelApiOrigin,
  modelApiResponse,
} from '@/lib/models/apiResponse';
import { publicCatalog } from '@/lib/models/distribution';
import { loadModelRegistry } from '@/lib/models/registry';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return modelApiOptions();
}

export async function GET(request: NextRequest) {
  try {
    return modelApiResponse(publicCatalog(loadModelRegistry(), modelApiOrigin(request)));
  } catch (error) {
    console.error('Failed to load model registry', error);
    return modelApiError('registry_unavailable', 'The model registry is temporarily unavailable.', 500);
  }
}
