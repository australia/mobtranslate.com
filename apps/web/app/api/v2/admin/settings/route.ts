import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { getSessionUser, requireRole } from '@/lib/auth-helpers';
import {
  curatorActivities as curatorActivitiesT,
  languageCurationSettings as languageCurationSettingsT,
} from '@/lib/db/schema';

export async function GET() {
  try {
    const { response } = await requireRole(['super_admin']);
    if (response) return response;

    return NextResponse.json({
      configurationMode: 'deployment_managed',
      writable: false,
      runtime: {
        databaseConfigured: Boolean(process.env.DATABASE_URL),
        authenticationSecretConfigured: Boolean(process.env.BETTER_AUTH_SECRET),
        transactionalEmailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
      },
      controls: [
        {
          id: 'identity',
          name: 'Product identity and public copy',
          state: 'deployment_managed',
          detail: 'Versioned in the application so public promises change through reviewed code and deployment.',
        },
        {
          id: 'language_roles',
          name: 'Language-scoped curator access',
          state: 'available',
          detail: 'Managed per language with scoped roles and an audit trail.',
          href: '/admin/languages',
        },
        {
          id: 'global_curation',
          name: 'Global auto-approval switches',
          state: 'not_available',
          detail: 'No global switch is wired. Mob Translate does not silently auto-approve language knowledge.',
        },
        {
          id: 'notifications',
          name: 'Admin activity notifications',
          state: 'not_available',
          detail: 'Password-reset delivery exists when email is configured; submission and weekly-report notifications are not implemented.',
        },
        {
          id: 'operations',
          name: 'Cache, backup, and API-key operations',
          state: 'deployment_managed',
          detail: 'These operations are handled by infrastructure tooling, not unimplemented dashboard buttons.',
        },
      ],
    });
  } catch (error) {
    console.error('Failed to inspect system configuration:', error);
    return NextResponse.json({ error: 'Failed to inspect system configuration' }, { status: 500 });
  }
}

export async function PUT() {
  const { response } = await requireRole(['super_admin']);
  if (response) return response;
  return NextResponse.json(
    {
      error: 'System configuration is deployment-managed and cannot be changed from this dashboard.',
      code: 'SYSTEM_SETTINGS_NOT_WRITABLE',
    },
    { status: 501 },
  );
}

// Language-specific settings remain a real, language-scoped persistence path.
export async function PATCH(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      languageId?: unknown;
      settings?: unknown;
    };
    const languageId = typeof body.languageId === 'string' ? body.languageId : '';
    const settings = body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)
      ? body.settings as Record<string, unknown>
      : null;
    if (!languageId || !settings) {
      return NextResponse.json({ error: 'Language ID and settings are required' }, { status: 400 });
    }

    const { response } = await requireRole(['dictionary_admin', 'super_admin'], languageId);
    if (response) return response;

    const update: Partial<typeof languageCurationSettingsT.$inferInsert> = {};
    const accepted: string[] = [];
    const takeBoolean = (key: string, property: 'allowPublicComments' | 'allowPublicImprovements' | 'requireApprovalForNewWords' | 'requireApprovalForEdits') => {
      if (typeof settings[key] === 'boolean') {
        update[property] = settings[key];
        accepted.push(key);
      }
    };
    takeBoolean('allow_public_comments', 'allowPublicComments');
    takeBoolean('allow_public_improvements', 'allowPublicImprovements');
    takeBoolean('require_approval_for_new_words', 'requireApprovalForNewWords');
    takeBoolean('require_approval_for_edits', 'requireApprovalForEdits');

    if (Number.isInteger(settings.auto_approve_threshold) && Number(settings.auto_approve_threshold) >= 0) {
      update.autoApproveThreshold = Number(settings.auto_approve_threshold);
      accepted.push('auto_approve_threshold');
    }
    if (Number.isInteger(settings.minimum_curator_level) && Number(settings.minimum_curator_level) >= 0) {
      update.minimumCuratorLevel = Number(settings.minimum_curator_level);
      accepted.push('minimum_curator_level');
    }
    if (typeof settings.quality_guidelines === 'string' || settings.quality_guidelines === null) {
      update.qualityGuidelines = settings.quality_guidelines;
      accepted.push('quality_guidelines');
    }
    if (typeof settings.style_guide_url === 'string' || settings.style_guide_url === null) {
      update.styleGuideUrl = settings.style_guide_url;
      accepted.push('style_guide_url');
    }
    if (Array.isArray(settings.custom_fields)) {
      update.customFields = settings.custom_fields;
      accepted.push('custom_fields');
    }
    for (const [key, property] of [['import_rules', 'importRules'], ['notification_settings', 'notificationSettings']] as const) {
      const value = settings[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        update[property] = value;
        accepted.push(key);
      }
    }
    if (accepted.length === 0) {
      return NextResponse.json({ error: 'No supported language settings were supplied' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const [saved] = await db
      .insert(languageCurationSettingsT)
      .values({ languageId, ...update, updatedAt: now })
      .onConflictDoUpdate({ target: languageCurationSettingsT.languageId, set: { ...update, updatedAt: now } })
      .returning();

    await db.insert(curatorActivitiesT).values({
      userId: user.id,
      languageId,
      activityType: 'language_settings_updated',
      targetType: 'language',
      targetId: languageId,
      activityData: { updated_fields: accepted },
    });

    return NextResponse.json({ message: 'Language settings updated', settings: snakeRow(saved) });
  } catch (error) {
    console.error('Failed to update language settings:', error);
    return NextResponse.json({ error: 'Failed to update language settings' }, { status: 500 });
  }
}
