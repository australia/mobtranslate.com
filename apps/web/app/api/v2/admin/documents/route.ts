import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has appropriate role
    const { data: roleAssignments } = await supabase
      .from('user_role_assignments')
      .select(`
        role_id,
        user_roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('user_roles.name', ['super_admin', 'dictionary_admin', 'curator']);

    const hasAccess = roleAssignments && roleAssignments.length > 0;

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const languageId = searchParams.get('languageId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('document_uploads')
      .select(`
        *,
        languages!language_id(
          id,
          name,
          code
        ),
        profiles!uploaded_by(
          id,
          display_name,
          username
        ),
        approver:profiles!approved_by(
          id,
          display_name,
          username
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      query = query.eq('processing_status', status);
    }
    if (languageId) {
      query = query.eq('language_id', languageId);
    }

    const { data: documents, count, error } = await query;

    if (error) {
      console.error('Failed to fetch documents:', error);
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      documents: documents || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
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
    const supabase = createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
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

    // Check if user has permission to upload for this language
    const { data: roleAssignments } = await supabase
      .from('user_role_assignments')
      .select(`
        role_id,
        user_roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .or(`language_id.eq.${language_id},language_id.is.null`)
      .in('user_roles.name', ['contributor', 'curator', 'dictionary_admin', 'super_admin']);

    const hasPermission = roleAssignments && roleAssignments.length > 0;

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'No permission to upload documents for this language' },
        { status: 403 }
      );
    }

    // Create document upload record
    const { data: document, error } = await supabase
      .from('document_uploads')
      .insert({
        language_id,
        uploaded_by: user.id,
        file_name,
        file_type,
        file_size,
        file_url,
        storage_path,
        document_type,
        source_attribution,
        extraction_config,
        processing_status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create document upload:', error);
      return NextResponse.json(
        { error: 'Failed to create document upload' },
        { status: 500 }
      );
    }

    // Log the upload event
    await supabase.from('curator_activities').insert({
      user_id: user.id,
      language_id,
      activity_type: 'document_uploaded',
      target_type: 'document',
      target_id: document.id,
      activity_data: {
        file_name,
        file_type,
        document_type
      }
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error('Failed to upload document:', error);
    return NextResponse.json(
      { error: 'Failed to upload document' },
      { status: 500 }
    );
  }
}