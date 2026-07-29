import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { getSessionUser, requireRole } from '@/lib/auth-helpers';
import { documentUploads as documentUploadsT } from '@/lib/db/schema';

export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await props.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select({ id: documentUploadsT.id, languageId: documentUploadsT.languageId })
    .from(documentUploadsT)
    .where(eq(documentUploadsT.id, documentId))
    .limit(1);
  const document = rows[0];
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const { response } = await requireRole(
    ['curator', 'dictionary_admin', 'super_admin'],
    document.languageId,
  );
  if (response) return response;

  return NextResponse.json(
    {
      error: 'Document processing is not available yet. No source data or dictionary entries were changed.',
      code: 'DOCUMENT_PIPELINE_NOT_CONFIGURED',
    },
    { status: 501 },
  );
}
