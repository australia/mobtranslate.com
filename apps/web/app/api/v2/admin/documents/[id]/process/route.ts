import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { getSessionUser, requireRole } from '@/lib/auth-helpers';
import {
  curatorActivities as curatorActivitiesT,
  documentUploads as documentUploadsT,
  languages as languagesT,
  words as wordsT,
} from '@/lib/db/schema';

// The SQL function update_document_processing_status(doc_id uuid, new_status text,
// stage_name text, stage_status text, stage_data jsonb, error_details jsonb) still
// exists — call it via raw SQL. The original passed 5 named args (no error_details),
// so we pass null for the 6th positional arg.
async function updateProcessingStatus(
  docId: string,
  newStatus: string,
  stageName: string,
  stageStatus: string,
  stageData: Record<string, unknown>
) {
  await db.execute(
    sql`select public.update_document_processing_status(
      ${docId}::uuid,
      ${newStatus},
      ${stageName},
      ${stageStatus},
      ${JSON.stringify(stageData)}::jsonb,
      ${null}::jsonb
    )`
  );
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const documentId = params.id;

    // Authentication required.
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get document details + its language code.
    const docRows = await db
      .select({
        id: documentUploadsT.id,
        language_id: documentUploadsT.languageId,
        file_name: documentUploadsT.fileName,
        processing_status: documentUploadsT.processingStatus,
        language_code: languagesT.code,
      })
      .from(documentUploadsT)
      .leftJoin(languagesT, eq(documentUploadsT.languageId, languagesT.id))
      .where(eq(documentUploadsT.id, documentId))
      .limit(1);
    const document = docRows[0];

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Check if user has permission to process documents for this language (scoped role).
    const { response } = await requireRole(
      ['curator', 'dictionary_admin', 'super_admin'],
      document.language_id
    );
    if (response) {
      if (response.status === 403) {
        return NextResponse.json(
          { error: 'No permission to process documents for this language' },
          { status: 403 }
        );
      }
      return response;
    }

    // Check document status
    if (document.processing_status !== 'pending' && document.processing_status !== 'failed') {
      return NextResponse.json(
        { error: 'Document is already being processed or completed' },
        { status: 400 }
      );
    }

    // Update document status to processing
    try {
      await updateProcessingStatus(documentId, 'processing', 'initialization', 'started', {
        started_by: user.id,
      });
    } catch (updateError) {
      console.error('Failed to update document status:', updateError);
      return NextResponse.json(
        { error: 'Failed to start processing' },
        { status: 500 }
      );
    }

    // In a real implementation, this would trigger an async job
    // For now, we'll simulate the processing pipeline

    // Stage 1: Text extraction
    await updateProcessingStatus(documentId, 'processing', 'text_extraction', 'in_progress', {
      method: 'pdf_parser',
    });

    // Simulate extraction (in production, this would call the actual extraction service)
    const extractedText = `Sample extracted text from ${document.file_name}`;
    const extractedWords = ['sample', 'word', 'example'];

    await updateProcessingStatus(documentId, 'processing', 'text_extraction', 'completed', {
      method: 'pdf_parser',
      text_length: extractedText.length,
      pages_processed: 1,
    });

    // Stage 2: Language detection
    await updateProcessingStatus(documentId, 'processing', 'language_detection', 'completed', {
      detected_language: document.language_code,
      confidence: 0.95,
    });

    // Stage 3: Word tokenization
    await updateProcessingStatus(documentId, 'processing', 'tokenization', 'completed', {
      tokens_found: extractedWords.length,
      unique_tokens: extractedWords.length,
    });

    // Stage 4: Dictionary matching
    let wordsFound = 0;
    let wordsNew = 0;
    const wordsUpdated = 0;

    for (const word of extractedWords) {
      // Check if word exists
      const existingWord = await db
        .select({ id: wordsT.id })
        .from(wordsT)
        .where(and(eq(wordsT.word, word), eq(wordsT.languageId, document.language_id!)))
        .limit(1);

      if (existingWord.length > 0) {
        wordsFound++;
        // In production, this would create improvement suggestions
      } else {
        wordsNew++;
        // In production, this would queue the word for creation
      }
    }

    await updateProcessingStatus(documentId, 'processing', 'matching', 'completed', {
      words_found: wordsFound,
      words_new: wordsNew,
      words_updated: wordsUpdated,
    });

    // Update final document stats
    try {
      await db
        .update(documentUploadsT)
        .set({
          processingStatus: 'completed',
          processingCompletedAt: new Date().toISOString(),
          wordsFound: extractedWords.length,
          wordsNew,
          wordsUpdated,
          extractionResults: {
            total_words_found: extractedWords.length,
            new_words_added: wordsNew,
            existing_words_updated: wordsUpdated,
            processing_duration_ms: 5000, // Simulated
          },
        })
        .where(eq(documentUploadsT.id, documentId));
    } catch (finalUpdateError) {
      console.error('Failed to update final document stats:', finalUpdateError);
    }

    // Log the processing completion
    await db.insert(curatorActivitiesT).values({
      userId: user.id,
      languageId: document.language_id,
      activityType: 'document_processed',
      targetType: 'document',
      targetId: documentId,
      activityData: {
        words_found: extractedWords.length,
        words_new: wordsNew,
        processing_duration_ms: 5000,
      },
    });

    return NextResponse.json({
      message: 'Document processing started',
      documentId,
      status: 'processing'
    });
  } catch (error) {
    console.error('Failed to process document:', error);
    return NextResponse.json(
      { error: 'Failed to process document' },
      { status: 500 }
    );
  }
}
