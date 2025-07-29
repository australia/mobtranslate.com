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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const languageId = searchParams.get('languageId');
    const type = searchParams.get('type') || 'all'; // all, words, improvements
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Check if user is a curator for the specified language
    const { data: roleAssignments } = await supabase
      .from('user_role_assignments')
      .select(`
        language_id,
        role_id,
        user_roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('user_roles.name', ['curator', 'dictionary_admin', 'super_admin']);

    if (!roleAssignments || roleAssignments.length === 0) {
      return NextResponse.json({ error: 'Not a curator' }, { status: 403 });
    }

    // Get languages user can curate
    const curatorLanguages = roleAssignments
      .filter(ra => ra.language_id || ra.user_roles.name === 'super_admin' || ra.user_roles.name === 'dictionary_admin')
      .map(ra => ra.language_id)
      .filter(Boolean);

    const isSuperAdmin = roleAssignments.some(ra => 
      ra.user_roles.name === 'super_admin' || ra.user_roles.name === 'dictionary_admin'
    );

    let results: any[] = [];
    let totalCount = 0;

    if (type === 'all' || type === 'words') {
      // Fetch pending words
      let wordsQuery = supabase
        .from('words')
        .select(`
          *,
          languages!language_id(
            id,
            name,
            code
          ),
          profiles!created_by(
            id,
            display_name,
            username
          ),
          definitions!inner(
            id,
            definition
          ),
          translations!inner(
            id,
            translation
          )
        `, { count: 'exact' })
        .eq('is_verified', false)
        .order('created_at', { ascending: false });

      // Filter by language if specified
      if (languageId && !isSuperAdmin) {
        wordsQuery = wordsQuery.eq('language_id', languageId);
      } else if (!isSuperAdmin && curatorLanguages.length > 0) {
        wordsQuery = wordsQuery.in('language_id', curatorLanguages);
      }

      if (type === 'words') {
        wordsQuery = wordsQuery.range(offset, offset + limit - 1);
      }

      const { data: pendingWords, count: wordsCount } = await wordsQuery;

      if (pendingWords) {
        results.push(...pendingWords.map(word => ({
          ...word,
          type: 'word',
          priority: word.created_at ? 
            Math.max(0, 10 - Math.floor((Date.now() - new Date(word.created_at).getTime()) / (1000 * 60 * 60 * 24))) 
            : 5
        })));
        totalCount += wordsCount || 0;
      }
    }

    if (type === 'all' || type === 'improvements') {
      // Fetch pending improvements
      let improvementsQuery = supabase
        .from('word_improvement_suggestions')
        .select(`
          *,
          words!word_id(
            id,
            word,
            language_id,
            languages!language_id(
              id,
              name,
              code
            )
          ),
          profiles!submitted_by(
            id,
            display_name,
            username,
            reputation_score
          )
        `, { count: 'exact' })
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      // Filter by language if specified
      if (languageId && !isSuperAdmin) {
        improvementsQuery = improvementsQuery.eq('words.language_id', languageId);
      } else if (!isSuperAdmin && curatorLanguages.length > 0) {
        improvementsQuery = improvementsQuery.in('words.language_id', curatorLanguages);
      }

      if (type === 'improvements') {
        improvementsQuery = improvementsQuery.range(offset, offset + limit - 1);
      }

      const { data: pendingImprovements, count: improvementsCount } = await improvementsQuery;

      if (pendingImprovements) {
        results.push(...pendingImprovements.map(improvement => ({
          ...improvement,
          type: 'improvement',
          priority: improvement.confidence_score ? 
            Math.round(improvement.confidence_score * 10) 
            : 5
        })));
        totalCount += improvementsCount || 0;
      }
    }

    // Sort by priority and created_at if fetching all
    if (type === 'all') {
      results.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      
      // Apply pagination to combined results
      results = results.slice(offset, offset + limit);
    }

    return NextResponse.json({
      items: results,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Failed to fetch pending items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending items' },
      { status: 500 }
    );
  }
}

// Review a pending item (approve/reject)
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { itemId, itemType, action, reason, notes } = body;

    if (!itemId || !itemType || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject', 'request_changes'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    // Handle different item types
    if (itemType === 'word') {
      // Get word details
      const { data: word } = await supabase
        .from('words')
        .select('*, language_id')
        .eq('id', itemId)
        .single();

      if (!word) {
        return NextResponse.json({ error: 'Word not found' }, { status: 404 });
      }

      // Check curator permission for this language
      const { data: hasPermission } = await supabase.rpc('user_has_role', {
        user_uuid: user.id,
        role_names: ['curator', 'dictionary_admin', 'super_admin'],
        language_uuid: word.language_id
      });

      if (!hasPermission) {
        return NextResponse.json({ error: 'No permission to review this word' }, { status: 403 });
      }

      // Update word based on action
      if (action === 'approve') {
        const { error } = await supabase
          .from('words')
          .update({
            is_verified: true,
            verified_by: user.id,
            verified_at: new Date().toISOString(),
            last_reviewed_at: new Date().toISOString(),
            last_reviewed_by: user.id,
            review_count: (word.review_count || 0) + 1
          })
          .eq('id', itemId);

        if (error) throw error;

        // Log activity
        await supabase.from('curator_activities').insert({
          user_id: user.id,
          language_id: word.language_id,
          activity_type: 'word_approved',
          target_type: 'word',
          target_id: itemId,
          activity_data: { word: word.word, notes }
        });
      } else if (action === 'reject') {
        // In production, you might want to move rejected words to a separate table
        // or add a rejection reason field
        const { error } = await supabase
          .from('words')
          .update({
            last_reviewed_at: new Date().toISOString(),
            last_reviewed_by: user.id,
            review_count: (word.review_count || 0) + 1,
            community_notes: reason || notes
          })
          .eq('id', itemId);

        if (error) throw error;

        // Log activity
        await supabase.from('curator_activities').insert({
          user_id: user.id,
          language_id: word.language_id,
          activity_type: 'word_rejected',
          target_type: 'word',
          target_id: itemId,
          activity_data: { word: word.word, reason, notes }
        });
      }
    } else if (itemType === 'improvement') {
      // Get improvement details
      const { data: improvement } = await supabase
        .from('word_improvement_suggestions')
        .select(`
          *,
          words!word_id(
            id,
            word,
            language_id
          )
        `)
        .eq('id', itemId)
        .single();

      if (!improvement) {
        return NextResponse.json({ error: 'Improvement not found' }, { status: 404 });
      }

      // Check curator permission for this language
      const { data: hasPermission } = await supabase.rpc('user_has_role', {
        user_uuid: user.id,
        role_names: ['curator', 'dictionary_admin', 'super_admin'],
        language_uuid: improvement.words.language_id
      });

      if (!hasPermission) {
        return NextResponse.json({ error: 'No permission to review this improvement' }, { status: 403 });
      }

      // Update improvement status
      const newStatus = action === 'approve' ? 'approved' : 
                       action === 'reject' ? 'rejected' : 'under_review';

      const { error } = await supabase
        .from('word_improvement_suggestions')
        .update({
          status: newStatus,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_comment: notes || reason
        })
        .eq('id', itemId);

      if (error) throw error;

      // If approved, apply the improvement
      if (action === 'approve' && improvement.field_name) {
        const updateData: any = {};
        updateData[improvement.field_name] = improvement.suggested_value;
        
        await supabase
          .from('words')
          .update(updateData)
          .eq('id', improvement.word_id);

        // Update improvement as implemented
        await supabase
          .from('word_improvement_suggestions')
          .update({
            status: 'implemented',
            implemented_at: new Date().toISOString(),
            implementation_notes: 'Auto-applied after approval'
          })
          .eq('id', itemId);
      }

      // Log activity
      await supabase.from('curator_activities').insert({
        user_id: user.id,
        language_id: improvement.words.language_id,
        activity_type: action === 'approve' ? 'improvement_approved' : 'improvement_rejected',
        target_type: 'improvement',
        target_id: itemId,
        activity_data: { 
          word: improvement.words.word,
          improvement_type: improvement.improvement_type,
          action,
          notes 
        }
      });
    }

    return NextResponse.json({
      message: `Item ${action}ed successfully`,
      itemId,
      action
    });
  } catch (error) {
    console.error('Failed to review item:', error);
    return NextResponse.json(
      { error: 'Failed to review item' },
      { status: 500 }
    );
  }
}