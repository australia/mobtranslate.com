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
    const status = searchParams.get('status') || 'flagged'; // flagged, all, deleted
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Check if user is a curator
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

    // Get languages user can moderate
    const curatorLanguages = roleAssignments
      .filter(ra => ra.language_id || (ra.user_roles as any).name === 'super_admin' || (ra.user_roles as any).name === 'dictionary_admin')
      .map(ra => ra.language_id)
      .filter(Boolean);

    const isSuperAdmin = roleAssignments.some(ra =>
      (ra.user_roles as any).name === 'super_admin' || (ra.user_roles as any).name === 'dictionary_admin'
    );

    // Build comments query
    let query = supabase
      .from('word_comments')
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
        profiles!user_id(
          id,
          display_name,
          username,
          reputation_score
        ),
        parent:word_comments!parent_id(
          id,
          comment_text,
          user_id
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters based on status
    if (status === 'flagged') {
      // Comments with high downvotes or reported by users
      query = query.or('downvotes.gte.3,is_flagged.eq.true');
    } else if (status === 'deleted') {
      query = query.eq('is_deleted', true);
    }
    // For 'all', no additional filters

    // Filter by language if specified
    if (languageId && !isSuperAdmin) {
      query = query.eq('words.language_id', languageId);
    } else if (!isSuperAdmin && curatorLanguages.length > 0) {
      query = query.in('words.language_id', curatorLanguages);
    }

    const { data: comments, count, error } = await query;

    if (error) {
      console.error('Failed to fetch comments for moderation:', error);
      return NextResponse.json(
        { error: 'Failed to fetch comments' },
        { status: 500 }
      );
    }

    // Calculate engagement metrics for each comment
    const enrichedComments = (comments || []).map(comment => {
      const totalVotes = comment.upvotes + comment.downvotes;
      const controversyScore = totalVotes > 0 
        ? Math.min(comment.upvotes, comment.downvotes) / Math.max(comment.upvotes, comment.downvotes)
        : 0;

      return {
        ...comment,
        engagement: {
          totalVotes,
          ratio: totalVotes > 0 ? comment.upvotes / totalVotes : 0.5,
          controversyScore,
          flaggedForReview: comment.downvotes >= 3 || comment.is_flagged || controversyScore > 0.4
        }
      };
    });

    // Get moderation statistics
    const { count: totalFlagged } = await supabase
      .from('word_comments')
      .select('*', { count: 'exact', head: true })
      .or('downvotes.gte.3,is_flagged.eq.true')
      .eq('is_deleted', false);

    const { count: totalDeleted } = await supabase
      .from('word_comments')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', true);

    return NextResponse.json({
      comments: enrichedComments,
      stats: {
        totalFlagged: totalFlagged || 0,
        totalDeleted: totalDeleted || 0,
        currentlyViewing: count || 0
      },
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Failed to fetch comments for moderation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

// Moderate a comment (delete, restore, warn user)
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { commentId, action, reason, warnUser } = body;

    if (!commentId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['delete', 'restore', 'approve'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    // Get comment details
    const { data: comment } = await supabase
      .from('word_comments')
      .select(`
        *,
        words!word_id(
          id,
          word,
          language_id
        )
      `)
      .eq('id', commentId)
      .single();

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Check curator permission for this language
    const { data: hasPermission } = await supabase.rpc('user_has_role', {
      user_uuid: user.id,
      role_names: ['curator', 'dictionary_admin', 'super_admin'],
      language_uuid: comment.words.language_id
    });

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'No permission to moderate comments for this language' },
        { status: 403 }
      );
    }

    // Perform moderation action
    if (action === 'delete') {
      const { error } = await supabase
        .from('word_comments')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: user.id
        })
        .eq('id', commentId);

      if (error) throw error;

      // Log activity
      await supabase.from('curator_activities').insert({
        user_id: user.id,
        language_id: comment.words.language_id,
        activity_type: 'comment_deleted',
        target_type: 'comment',
        target_id: commentId,
        activity_data: {
          reason,
          comment_preview: comment.comment_text.substring(0, 100),
          warned_user: warnUser || false
        }
      });

      // If warnUser is true, you could send a notification or update user metrics
      if (warnUser) {
        // In production, implement warning system
        console.log(`Warning issued to user ${comment.user_id} for comment ${commentId}`);
      }
    } else if (action === 'restore') {
      const { error } = await supabase
        .from('word_comments')
        .update({
          is_deleted: false,
          deleted_at: null,
          deleted_by: null
        })
        .eq('id', commentId);

      if (error) throw error;

      // Log activity
      await supabase.from('curator_activities').insert({
        user_id: user.id,
        language_id: comment.words.language_id,
        activity_type: 'comment_restored',
        target_type: 'comment',
        target_id: commentId,
        activity_data: {
          comment_preview: comment.comment_text.substring(0, 100)
        }
      });
    } else if (action === 'approve') {
      // Clear any flags on the comment
      const { error } = await supabase
        .from('word_comments')
        .update({
          is_flagged: false,
          moderated_at: new Date().toISOString(),
          moderated_by: user.id
        })
        .eq('id', commentId);

      if (error) throw error;

      // Log activity
      await supabase.from('curator_activities').insert({
        user_id: user.id,
        language_id: comment.words.language_id,
        activity_type: 'comment_approved',
        target_type: 'comment',
        target_id: commentId,
        activity_data: {
          comment_preview: comment.comment_text.substring(0, 100)
        }
      });
    }

    return NextResponse.json({
      message: `Comment ${action}d successfully`,
      commentId,
      action
    });
  } catch (error) {
    console.error('Failed to moderate comment:', error);
    return NextResponse.json(
      { error: 'Failed to moderate comment' },
      { status: 500 }
    );
  }
}

// Bulk moderation actions
export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { commentIds, action, reason } = body;

    if (!commentIds || !Array.isArray(commentIds) || commentIds.length === 0 || !action) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    // Check if user is a curator
    const { data: roleAssignments } = await supabase
      .from('user_role_assignments')
      .select(`
        role_id,
        user_roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('user_roles.name', ['curator', 'dictionary_admin', 'super_admin']);

    if (!roleAssignments || roleAssignments.length === 0) {
      return NextResponse.json({ error: 'Not a curator' }, { status: 403 });
    }

    // Perform bulk action
    let updateData: any = {};
    
    if (action === 'delete') {
      updateData = {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: user.id
      };
    } else if (action === 'approve') {
      updateData = {
        is_flagged: false,
        moderated_at: new Date().toISOString(),
        moderated_by: user.id
      };
    }

    const { error } = await supabase
      .from('word_comments')
      .update(updateData)
      .in('id', commentIds);

    if (error) throw error;

    // Log bulk activity
    await supabase.from('curator_activities').insert({
      user_id: user.id,
      activity_type: `bulk_comments_${action}d`,
      target_type: 'comments',
      target_id: commentIds[0], // Use first ID as reference
      activity_data: {
        total_comments: commentIds.length,
        action,
        reason
      }
    });

    return NextResponse.json({
      message: `${commentIds.length} comments ${action}d successfully`,
      count: commentIds.length,
      action
    });
  } catch (error) {
    console.error('Failed to perform bulk moderation:', error);
    return NextResponse.json(
      { error: 'Failed to perform bulk moderation' },
      { status: 500 }
    );
  }
}