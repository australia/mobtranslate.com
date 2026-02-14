import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface SystemSettings {
  general: {
    siteName: string;
    siteDescription: string;
    maintenanceMode: boolean;
    registrationEnabled: boolean;
  };
  curation: {
    autoApprovalEnabled: boolean;
    autoApprovalThreshold: number;
    requireApprovalForNewWords: boolean;
    requireApprovalForEdits: boolean;
    minimumWordLength: number;
    maximumWordLength: number;
  };
  security: {
    requireEmailVerification: boolean;
    passwordMinLength: number;
    require2FA: boolean;
    sessionTimeout: number;
  };
  notifications: {
    emailNotificationsEnabled: boolean;
    notifyOnNewSubmission: boolean;
    notifyOnApproval: boolean;
    notifyOnRejection: boolean;
    notifyOnComment: boolean;
  };
}

// In production, these would be stored in a database table
const DEFAULT_SETTINGS: SystemSettings = {
  general: {
    siteName: 'MobTranslate',
    siteDescription: 'Preserving Indigenous Languages Through Technology',
    maintenanceMode: false,
    registrationEnabled: true
  },
  curation: {
    autoApprovalEnabled: false,
    autoApprovalThreshold: 3,
    requireApprovalForNewWords: true,
    requireApprovalForEdits: true,
    minimumWordLength: 1,
    maximumWordLength: 100
  },
  security: {
    requireEmailVerification: true,
    passwordMinLength: 8,
    require2FA: false,
    sessionTimeout: 86400 // 24 hours in seconds
  },
  notifications: {
    emailNotificationsEnabled: true,
    notifyOnNewSubmission: true,
    notifyOnApproval: true,
    notifyOnRejection: true,
    notifyOnComment: false
  }
};

export async function GET(_request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super admin
    const { data: roleAssignments } = await supabase
      .from('user_role_assignments')
      .select(`
        role_id,
        user_roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('user_roles.name', 'super_admin');

    const isSuperAdmin = roleAssignments && roleAssignments.length > 0;

    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // In production, fetch settings from database
    // For now, return default settings
    return NextResponse.json(DEFAULT_SETTINGS);
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super admin
    const { data: roleAssignments } = await supabase
      .from('user_role_assignments')
      .select(`
        role_id,
        user_roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('user_roles.name', 'super_admin');

    const isSuperAdmin = roleAssignments && roleAssignments.length > 0;

    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get updated settings from request body
    const updatedSettings = await request.json();

    // Validate settings structure
    const validateSettings = (settings: any): settings is SystemSettings => {
      return (
        settings.general &&
        settings.curation &&
        settings.security &&
        settings.notifications &&
        typeof settings.general.siteName === 'string' &&
        typeof settings.general.maintenanceMode === 'boolean' &&
        typeof settings.curation.autoApprovalThreshold === 'number' &&
        typeof settings.security.passwordMinLength === 'number'
      );
    };

    if (!validateSettings(updatedSettings)) {
      return NextResponse.json(
        { error: 'Invalid settings format' },
        { status: 400 }
      );
    }

    // Log the settings update
    await supabase.from('curator_activities').insert({
      user_id: user.id,
      activity_type: 'settings_updated',
      target_type: 'system',
      target_id: '00000000-0000-0000-0000-000000000000', // System-level action
      activity_data: {
        updated_sections: Object.keys(updatedSettings),
        timestamp: new Date().toISOString()
      }
    });

    // In production, save settings to database
    // For now, just return the updated settings
    return NextResponse.json({
      message: 'Settings updated successfully',
      settings: updatedSettings
    });
  } catch (error) {
    console.error('Failed to update settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

// Language-specific settings endpoint
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { languageId, settings } = await request.json();

    if (!languageId || !settings) {
      return NextResponse.json(
        { error: 'Language ID and settings are required' },
        { status: 400 }
      );
    }

    // Check if user is admin for this language
    const { data: roleAssignments } = await supabase
      .from('user_role_assignments')
      .select(`
        role_id,
        user_roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .or(`language_id.eq.${languageId},language_id.is.null`)
      .in('user_roles.name', ['dictionary_admin', 'super_admin']);

    const hasPermission = roleAssignments && roleAssignments.length > 0;

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'No permission to update settings for this language' },
        { status: 403 }
      );
    }

    // Update language curation settings
    const { data: updatedSettings, error } = await supabase
      .from('language_curation_settings')
      .upsert({
        language_id: languageId,
        ...settings,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to update language settings:', error);
      return NextResponse.json(
        { error: 'Failed to update language settings' },
        { status: 500 }
      );
    }

    // Log the update
    await supabase.from('curator_activities').insert({
      user_id: user.id,
      language_id: languageId,
      activity_type: 'language_settings_updated',
      target_type: 'language',
      target_id: languageId,
      activity_data: {
        updated_fields: Object.keys(settings)
      }
    });

    return NextResponse.json({
      message: 'Language settings updated successfully',
      settings: updatedSettings
    });
  } catch (error) {
    console.error('Failed to update language settings:', error);
    return NextResponse.json(
      { error: 'Failed to update language settings' },
      { status: 500 }
    );
  }
}