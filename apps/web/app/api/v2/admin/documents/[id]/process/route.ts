import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const documentId = params.id;
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get document details
    const { data: document, error: docError } = await supabase
      .from('document_uploads')
      .select(`
        *,
        languages!language_id(
          id,
          name,
          code
        )
      `)
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Check if user has permission to process documents for this language
    const { data: roleAssignments } = await supabase
      .from('user_role_assignments')
      .select(`
        role_id,
        user_roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .or(`language_id.eq.${document.language_id},language_id.is.null`)
      .in('user_roles.name', ['curator', 'dictionary_admin', 'super_admin']);

    const hasPermission = roleAssignments && roleAssignments.length > 0;

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'No permission to process documents for this language' },
        { status: 403 }
      );
    }

    // Check document status
    if (document.processing_status !== 'pending' && document.processing_status !== 'failed') {
      return NextResponse.json(
        { error: 'Document is already being processed or completed' },
        { status: 400 }
      );
    }

    // Update document status to processing
    const { error: updateError } = await supabase.rpc('update_document_processing_status', {
      doc_id: documentId,
      new_status: 'processing',
      stage_name: 'initialization',
      stage_status: 'started',
      stage_data: { started_by: user.id }
    });

    if (updateError) {
      console.error('Failed to update document status:', updateError);
      return NextResponse.json(
        { error: 'Failed to start processing' },
        { status: 500 }
      );
    }

    // In a real implementation, this would trigger an async job
    // For now, we'll simulate the processing pipeline
    
    // Stage 1: Text extraction
    await supabase.rpc('update_document_processing_status', {
      doc_id: documentId,
      new_status: 'processing',
      stage_name: 'text_extraction',
      stage_status: 'in_progress',
      stage_data: { method: 'pdf_parser' }
    });

    // Simulate extraction (in production, this would call the actual extraction service)
    const extractedText = `Sample extracted text from ${document.file_name}`;
    const extractedWords = ['sample', 'word', 'example'];

    await supabase.rpc('update_document_processing_status', {
      doc_id: documentId,
      new_status: 'processing',
      stage_name: 'text_extraction',
      stage_status: 'completed',
      stage_data: { 
        method: 'pdf_parser',
        text_length: extractedText.length,
        pages_processed: 1
      }
    });

    // Stage 2: Language detection
    await supabase.rpc('update_document_processing_status', {
      doc_id: documentId,
      new_status: 'processing',
      stage_name: 'language_detection',
      stage_status: 'completed',
      stage_data: { 
        detected_language: document.languages.code,
        confidence: 0.95
      }
    });

    // Stage 3: Word tokenization
    await supabase.rpc('update_document_processing_status', {
      doc_id: documentId,
      new_status: 'processing',
      stage_name: 'tokenization',
      stage_status: 'completed',
      stage_data: { 
        tokens_found: extractedWords.length,
        unique_tokens: extractedWords.length
      }
    });

    // Stage 4: Dictionary matching
    let wordsFound = 0;
    let wordsNew = 0;
    let wordsUpdated = 0;

    for (const word of extractedWords) {
      // Check if word exists
      const { data: existingWord } = await supabase
        .from('words')
        .select('id')
        .eq('word', word)
        .eq('language_id', document.language_id)
        .single();

      if (existingWord) {
        wordsFound++;
        // In production, this would create improvement suggestions
      } else {
        wordsNew++;
        // In production, this would queue the word for creation
      }
    }

    await supabase.rpc('update_document_processing_status', {
      doc_id: documentId,
      new_status: 'processing',
      stage_name: 'matching',
      stage_status: 'completed',
      stage_data: { 
        words_found: wordsFound,
        words_new: wordsNew,
        words_updated: wordsUpdated
      }
    });

    // Update final document stats
    const { error: finalUpdateError } = await supabase
      .from('document_uploads')
      .update({
        processing_status: 'completed',
        processing_completed_at: new Date().toISOString(),
        words_found: extractedWords.length,
        words_new: wordsNew,
        words_updated: wordsUpdated,
        extraction_results: {
          total_words_found: extractedWords.length,
          new_words_added: wordsNew,
          existing_words_updated: wordsUpdated,
          processing_duration_ms: 5000 // Simulated
        }
      })
      .eq('id', documentId);

    if (finalUpdateError) {
      console.error('Failed to update final document stats:', finalUpdateError);
    }

    // Log the processing completion
    await supabase.from('curator_activities').insert({
      user_id: user.id,
      language_id: document.language_id,
      activity_type: 'document_processed',
      target_type: 'document',
      target_id: documentId,
      activity_data: {
        words_found: extractedWords.length,
        words_new: wordsNew,
        processing_duration_ms: 5000
      }
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