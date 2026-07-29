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
