import { NextRequest, NextResponse } from 'next/server';
import {
  getDatasetData,
  getDictionaryData,
  getLexemeData,
  getModelData,
  getOverviewData,
  getSentenceData,
} from '@/lib/kuku-yalanji-research.server';
import type { ResearchEnvelope, ResearchResource } from '@/lib/kuku-yalanji-research-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESOURCES = new Set<ResearchResource>([
  'overview',
  'dictionary',
  'sentences',
  'lexemes',
  'dataset',
  'model',
]);

export function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get('resource') ?? 'overview';
  if (!RESOURCES.has(requested as ResearchResource)) {
    return NextResponse.json(
      { success: false, error: 'Unknown research resource.' },
      { status: 400 },
    );
  }
  const resource = requested as ResearchResource;

  try {
    const data = (() => {
      switch (resource) {
        case 'dictionary': return getDictionaryData(request.nextUrl.searchParams);
        case 'sentences': return getSentenceData(request.nextUrl.searchParams);
        case 'lexemes': return getLexemeData(request.nextUrl.searchParams);
        case 'dataset': return getDatasetData();
        case 'model': return getModelData();
        default: return getOverviewData();
      }
    })();
    const response: ResearchEnvelope<typeof data> = {
      success: true,
      resource,
      generatedAt: new Date().toISOString(),
      data,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Kuku Yalanji research API failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'The Kuku Yalanji research archive could not be read.',
      },
      { status: 500 },
    );
  }
}
