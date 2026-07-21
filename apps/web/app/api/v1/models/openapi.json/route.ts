import type { NextRequest } from 'next/server';
import { modelApiOptions, modelApiOrigin, modelApiResponse } from '@/lib/models/apiResponse';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return modelApiOptions();
}

export async function GET(request: NextRequest) {
  const origin = modelApiOrigin(request);
  return modelApiResponse({
    openapi: '3.1.0',
    info: {
      title: 'MobTranslate Model Distribution API',
      version: '1.0.0',
      description: 'Public, read-only metadata and download discovery for versioned MobTranslate research models. No API key is required. Artifact rights and release limitations remain binding.',
    },
    servers: [{ url: origin }],
    paths: {
      '/api/v1/models': {
        get: {
          operationId: 'listModels',
          summary: 'List models, versions, and the latest downloadable release',
          responses: { '200': { description: 'Model catalog' } },
        },
      },
      '/api/v1/models/{modelId}': {
        get: {
          operationId: 'getModel',
          summary: 'Get one model and all registered versions',
          parameters: [{ name: 'modelId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Model record' },
            '404': { description: 'Unknown model ID' },
          },
        },
      },
      '/api/v1/models/{modelId}/versions/{version}': {
        get: {
          operationId: 'getModelVersion',
          summary: 'Get full metadata and absolute download URLs for one immutable version',
          description: 'Use the literal version ID for reproducibility, or "latest" to resolve the newest release with a downloadable model artifact.',
          parameters: [
            { name: 'modelId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'version', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Version metadata, categorized downloads, rights, training summary, and evaluation metrics' },
            '404': { description: 'Unknown model or version' },
          },
        },
      },
    },
    components: {
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'status'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                status: { type: 'integer' },
              },
            },
          },
        },
      },
    },
    externalDocs: {
      description: 'Kuku Yalanji v21.2 model, training, and hosting guide',
      url: `${origin}/docs/kuku-v21-2-model-guide.html`,
    },
  });
}
