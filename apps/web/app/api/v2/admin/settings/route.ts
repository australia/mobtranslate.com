import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { getSessionUser, requireRole } from '@/lib/auth-helpers';
import {
  curatorActivities as curatorActivitiesT,
  languageCurationSettings as languageCurationSettingsT,
} from '@/lib/db/schema';

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
    // Only super admins may view system settings.
    const { response } = await requireRole(['super_admin']);
    if (response) return response;

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
    // Only super admins may update system settings.
    const { user, response } = await requireRole(['super_admin']);
    if (response) return response;

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
    await db.insert(curatorActivitiesT).values({
      userId: user!.id,
      activityType: 'settings_updated',
      targetType: 'system',
      targetId: '00000000-0000-0000-0000-000000000000', // System-level action
      activityData: {
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
    // Authentication required to reach this endpoint.
    const user = await getSessionUser();
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

    // Check if user is admin for this language (language-scoped role; the SQL
    // user_has_role(uuid, roles, lang_id) also matches global/null-language grants).
    const { response } = await requireRole(['dictionary_admin', 'super_admin'], languageId);
    if (response) {
      if (response.status === 403) {
        return NextResponse.json(
          { error: 'No permission to update settings for this language' },
          { status: 403 }
        );
      }
      return response;
    }

    // The client sends snake_case column keys (mirroring the old Supabase shape);
    // Drizzle expects camelCase column properties, so map keys back.
    const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const camelSettings: Record<string, any> = {};
    for (const [k, v] of Object.entries(settings as Record<string, any>)) {
      camelSettings[toCamel(k)] = v;
    }

    // Update language curation settings (upsert on the unique language_id).
    const [updatedSettings] = await db
      .insert(languageCurationSettingsT)
      .values({
        languageId,
        ...camelSettings,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: languageCurationSettingsT.languageId,
        set: {
          ...camelSettings,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();

    // Log the update
    await db.insert(curatorActivitiesT).values({
      userId: user.id,
      languageId,
      activityType: 'language_settings_updated',
      targetType: 'language',
      targetId: languageId,
      activityData: {
        updated_fields: Object.keys(settings)
      }
    });

    return NextResponse.json({
      message: 'Language settings updated successfully',
      settings: snakeRow(updatedSettings)
    });
  } catch (error) {
    console.error('Failed to update language settings:', error);
    return NextResponse.json(
      { error: 'Failed to update language settings' },
      { status: 500 }
    );
  }
}
