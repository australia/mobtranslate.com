import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { getSessionUser, requireRole } from '@/lib/auth-helpers';
import {
  curatorActivities as curatorActivitiesT,
  documentUploads as documentUploadsT,
  languages as languagesT,
  userProfiles as userProfilesT,
} from '@/lib/db/schema';

export async function GET(request: NextRequest) {
  try {
    // Authentication required.
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Any active super_admin / dictionary_admin / curator assignment (any language).
    const { response } = await requireRole(['super_admin', 'dictionary_admin', 'curator']);
    if (response) return response;

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const languageId = searchParams.get('languageId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Build filters
    const filters = [];
    if (status) {
      filters.push(eq(documentUploadsT.processingStatus, status));
    }
    if (languageId) {
      filters.push(eq(documentUploadsT.languageId, languageId));
    }
    const where = filters.length ? and(...filters) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(documentUploadsT)
        .where(where)
        .orderBy(desc(documentUploadsT.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(documentUploadsT).where(where),
    ]);

    const total = totalRows[0]?.value ?? 0;

    // Resolve nested language + uploader/approver profiles for the page.
    const languageIds = Array.from(
      new Set(rows.map((r) => r.languageId).filter((id): id is string => !!id))
    );
    const profileIds = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.uploadedBy, r.approvedBy])
          .filter((id): id is string => !!id)
      )
    );

    const [langRows, profileRows] = await Promise.all([
      languageIds.length
        ? db
            .select({ id: languagesT.id, name: languagesT.name, code: languagesT.code })
            .from(languagesT)
            .where(inArray(languagesT.id, languageIds))
        : Promise.resolve([] as Array<{ id: string; name: string; code: string }>),
      profileIds.length
        ? db
            .select({
              id: userProfilesT.userId,
              display_name: userProfilesT.displayName,
              username: userProfilesT.username,
            })
            .from(userProfilesT)
            .where(inArray(userProfilesT.userId, profileIds))
        : Promise.resolve([] as Array<{ id: string; display_name: string | null; username: string }>),
    ]);

    const langById = new Map(langRows.map((l) => [l.id, l]));
    const profileById = new Map(profileRows.map((p) => [p.id, p]));

    const documents = rows.map((r) => ({
      ...snakeRow(r),
      languages: r.languageId ? langById.get(r.languageId) ?? null : null,
      profiles: r.uploadedBy ? profileById.get(r.uploadedBy) ?? null : null,
      approver: r.approvedBy ? profileById.get(r.approvedBy) ?? null : null,
    }));

    return NextResponse.json({
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Failed to fetch documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authentication required.
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const {
      language_id,
      file_name,
      file_type,
      file_size,
      file_url,
      storage_path,
      document_type,
      source_attribution,
      extraction_config
    } = body;

    // Validate required fields
    if (!language_id || !file_name || !file_type || !file_url || !storage_path) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if user has permission to upload for this language (language-scoped role).
    const { response } = await requireRole(
      ['contributor', 'curator', 'dictionary_admin', 'super_admin'],
      language_id
    );
    if (response) {
      if (response.status === 403) {
        return NextResponse.json(
          { error: 'No permission to upload documents for this language' },
          { status: 403 }
        );
      }
      return response;
    }

    // Create document upload record
    const [document] = await db
      .insert(documentUploadsT)
      .values({
        languageId: language_id,
        uploadedBy: user.id,
        fileName: file_name,
        fileType: file_type,
        fileSize: file_size,
        fileUrl: file_url,
        storagePath: storage_path,
        documentType: document_type,
        sourceAttribution: source_attribution,
        extractionConfig: extraction_config,
        processingStatus: 'pending',
      })
      .returning();

    // Log the upload event
    await db.insert(curatorActivitiesT).values({
      userId: user.id,
      languageId: language_id,
      activityType: 'document_uploaded',
      targetType: 'document',
      targetId: document.id,
      activityData: {
        file_name,
        file_type,
        document_type
      }
    });

    return NextResponse.json({ document: snakeRow(document) }, { status: 201 });
  } catch (error) {
    console.error('Failed to upload document:', error);
    return NextResponse.json(
      { error: 'Failed to upload document' },
      { status: 500 }
    );
  }
}
