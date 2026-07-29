// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readWebFile = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('truthful system configuration', () => {
  it('does not render or return pretend writable global settings', () => {
    const page = readWebFile('app/admin/settings/page.tsx');
    const route = readWebFile('app/api/v2/admin/settings/route.ts');
    expect(page).not.toMatch(/Save General Settings|Clear Cache|Backup Database|Regenerate API Keys/);
    expect(route).not.toMatch(/DEFAULT_SETTINGS|Settings updated successfully/);
    expect(route).toContain('SYSTEM_SETTINGS_NOT_WRITABLE');
    expect(route).toContain('{ status: 501 }');
  });

  it('labels unavailable controls and deployment ownership explicitly', () => {
    const route = readWebFile('app/api/v2/admin/settings/route.ts');
    expect(route).toContain("configurationMode: 'deployment_managed'");
    expect(route).toContain("state: 'not_available'");
    expect(route).toContain('does not silently auto-approve language knowledge');
  });
});

describe('language curator access', () => {
  it('checks language-scoped manager access before returning account details', () => {
    const route = readWebFile('app/api/v2/admin/languages/[id]/curators/route.ts');
    const getStart = route.indexOf('export async function GET');
    const emailSelect = route.indexOf('email: userProfilesT.email', getStart);
    const roleCheck = route.indexOf('requireRole(MANAGER_ROLES, languageId)', getStart);
    expect(roleCheck).toBeGreaterThan(getStart);
    expect(roleCheck).toBeLessThan(emailSelect);
  });

  it('deactivates access and records assignment changes instead of deleting history', () => {
    const route = readWebFile('app/api/v2/admin/languages/[id]/curators/route.ts');
    expect(route).not.toContain('db.delete(assignmentsT)');
    expect(route).toContain("activityType: 'curator_access_removed'");
    expect(route).toContain("activityType: existing ? 'curator_access_restored' : 'curator_assigned'");
  });

  it('does not describe an app role as community authority', () => {
    const page = readWebFile('app/admin/languages/[id]/settings/page.tsx');
    expect(page).toContain('Role access is not community authority');
    expect(page).not.toContain('full control over');
  });
});

describe('global and language-scoped admin boundaries', () => {
  it.each([
    'app/api/v2/admin/users/route.ts',
    'app/api/v2/admin/analytics/route.ts',
    'app/api/v2/admin/stats/route.ts',
  ])('%s requires super-admin access for platform-wide data', (file) => {
    expect(readWebFile(file)).toContain("requireRole(['super_admin'])");
  });

  it('limits manual dictionary sync to super admins and confirms mutations in the UI', () => {
    const route = readWebFile('app/api/v2/admin/dictionary-sync/route.ts');
    const page = readWebFile('app/admin/dictionary-sync/page.tsx');
    expect(route).toContain("userHasRole(user.id, ['super_admin'])");
    expect(page).toContain('may insert, update, or remove database words');
    expect(page).toContain('Run confirmed action');
  });

  it('scopes language managers and reserves language creation for super admins', () => {
    const collectionRoute = readWebFile('app/api/v2/admin/languages/route.ts');
    const itemRoute = readWebFile('app/api/v2/admin/languages/[id]/route.ts');
    expect(collectionRoute).toContain('managedLanguageIds');
    expect(collectionRoute).toContain("requireRole(['super_admin'])");
    expect(itemRoute).toContain("requireRole(['super_admin', 'dictionary_admin'], params.id)");
  });

  it('requires language scope for non-super roles and records role grants', () => {
    const route = readWebFile('app/api/v2/admin/users/[userId]/assign-role/route.ts');
    expect(route).toContain("requireRole(['super_admin'])");
    expect(route).toContain("role.name !== 'super_admin' && !language_id");
    expect(route).toContain("activityType: 'user_role_assigned'");
  });

  it('hides platform-wide navigation from language managers', () => {
    const shell = readWebFile('app/admin/AdminShell.tsx');
    expect(shell).toContain('globalOnly: true');
    expect(shell).toContain('isSuperAdmin || (isLanguageManager');
    expect(shell).toContain('Language Manager');
  });

  it('checks active assignments directly so language-scoped dictionary admins stay scoped', () => {
    const helper = readWebFile('lib/auth-helpers.ts');
    expect(helper).toContain('from public.user_role_assignments ura');
    expect(helper).toContain("ura.language_id = ${langId}::uuid");
    expect(helper).toContain('ura.expires_at > now()');
    expect(helper).not.toContain('select public.user_has_role');
  });

  it('reserves cross-language request and generated-audio history for super admins', () => {
    const route = readWebFile('app/api/v2/admin/explore/route.ts');
    const audio = readWebFile('app/api/v2/admin/explore/audio/route.ts');
    const shell = readWebFile('app/admin/AdminShell.tsx');
    expect(route).toContain("requireRole(['super_admin'])");
    expect(audio).toContain("requireRole(['super_admin'])");
    expect(shell).toMatch(/title: 'Explore'.*globalOnly: true/);
  });

  it('authorizes recording work against its selected language and never with an empty scope', () => {
    const server = readWebFile('lib/recording/server.ts');
    const routeFiles = [
      'app/api/v2/admin/recordings/route.ts',
      'app/api/v2/admin/recordings/worklist/route.ts',
      'app/api/v2/admin/recordings/stats/route.ts',
      'app/api/v2/admin/recordings/sentences/route.ts',
      'app/api/v2/admin/recordings/export/route.ts',
      'app/api/v2/admin/recordings/speakers/route.ts',
      'app/api/v2/admin/recordings/targets/route.ts',
      'app/api/v2/admin/recordings/targets/[id]/route.ts',
      'app/api/v2/admin/recordings/invites/route.ts',
      'app/api/v2/admin/recordings/invites/[id]/route.ts',
      'app/api/v2/admin/recordings/[id]/route.ts',
    ];
    expect(server).toContain('requireAdmin(languageId: string)');
    expect(server).toContain('userHasRole(user.id, ADMIN_ROLES, languageId)');
    for (const file of routeFiles) {
      expect(readWebFile(file), file).not.toContain('requireAdmin()');
    }
  });

  it('limits studio and library languages to a manager’s active assignments', () => {
    const studio = readWebFile('app/admin/recordings/page.tsx');
    const library = readWebFile('app/admin/recordings/library/page.tsx');
    expect(studio).toContain("eq(rolesT.name, 'dictionary_admin')");
    expect(studio).toContain('inArray(languagesT.id, managedLanguageIds)');
    expect(library).toContain('/api/v2/admin/languages');
    expect(library).toContain('recordings?languageId=');
    expect(library).not.toContain('recordings?status=all');
  });

  it('keeps word edits inside the word and language being managed', () => {
    const getRoute = readWebFile('app/api/v2/admin/words/[id]/route.ts');
    const editRoute = readWebFile('app/api/v2/admin/words/[id]/edit/route.ts');
    const editing = readWebFile('lib/words/editing.ts');
    expect(getRoute).toContain('requireRole(ADMIN_ROLES, word.language_id)');
    expect(editRoute).toContain('requireRole(ADMIN_ROLES, word.languageId)');
    expect(editRoute).toContain('The edited row does not belong to this word.');
    expect(editing).toContain('eq(definitionsT.wordId, word_id)');
    expect(editing).toContain('eq(translationsT.wordId, word_id)');
  });
});
