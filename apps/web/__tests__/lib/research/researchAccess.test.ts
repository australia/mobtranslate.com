// @vitest-environment node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const OPERATOR_EMAIL = 'operator@example.org';
const POLICY_ID = 'quinkan-private-workspace-test-policy';

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  userHasRole: vi.fn(),
  getSession: vi.fn(),
  loadConfiguredPrivateRelease: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth-helpers', () => ({
  getSessionUser: mocks.getSessionUser,
  userHasRole: mocks.userHasRole,
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/lib/research/quinkan-private/private-release', () => ({
  loadConfiguredPrivateRelease: mocks.loadConfiguredPrivateRelease,
}));

import { requireResearchAdminApi, requireResearchAdminPage } from '@/lib/research/access';
import { authorizePrivateRequest, requirePrivatePage } from '@/lib/research/quinkan-private/authorize';
import { serveResearchStaticFile } from '@/lib/research/static-files';

const webRoot = process.cwd();
let tempRoot = '';

beforeAll(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mobtranslate-research-access-'));
  const policyFile = path.join(tempRoot, 'access-policy.json');
  await writeFile(policyFile, JSON.stringify({
    schema_version: 1,
    policy_id: POLICY_ID,
    subjects: [
      {
        subject: OPERATOR_EMAIL,
        principal_claim: 'email',
        operator_label: 'Test operator',
        roles: ['traditional_owner_operator'],
        scopes: ['private_workspace:read'],
      },
      {
        subject: 'oidc-subject-without-email',
        operator_label: 'Edge-only subject',
        roles: ['traditional_owner_operator'],
        scopes: ['private_workspace:read', 'restricted_gde:read'],
      },
    ],
  }));
  process.env.QUINKAN_PRIVATE_ACCESS_POLICY_FILE = policyFile;
});

afterAll(async () => {
  delete process.env.QUINKAN_PRIVATE_ACCESS_POLICY_FILE;
  await rm(tempRoot, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUser.mockResolvedValue({ id: USER_ID, email: OPERATOR_EMAIL });
  mocks.userHasRole.mockResolvedValue(true);
  mocks.getSession.mockResolvedValue({ user: { id: USER_ID, email: OPERATOR_EMAIL, emailVerified: true } });
  mocks.loadConfiguredPrivateRelease.mockResolvedValue({ manifest: { access_policy_id: POLICY_ID } });
});

describe('research admin guard', () => {
  it('admits super admins only', async () => {
    await expect(requireResearchAdminApi()).resolves.toMatchObject({ response: null });
    expect(mocks.userHasRole).toHaveBeenCalledWith(USER_ID, ['super_admin']);
  });

  it('answers 404 with no-store, noindex headers for anyone else', async () => {
    mocks.userHasRole.mockResolvedValue(false);
    const { response } = await requireResearchAdminApi();
    expect(response?.status).toBe(404);
    expect(response?.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    expect(response?.headers.get('X-Robots-Tag')).toContain('noindex');

    mocks.getSessionUser.mockResolvedValue(null);
    expect((await requireResearchAdminApi()).response?.status).toBe(404);
  });

  it('renders not-found pages for anyone else', async () => {
    mocks.userHasRole.mockResolvedValue(false);
    await expect(requireResearchAdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('private workspace authorization', () => {
  it('admits a verified super admin listed in the access policy with the scope', async () => {
    const authorized = await authorizePrivateRequest('private_workspace:read');
    expect(authorized.operatorLabel).toBe('Test operator');
    expect(authorized.userId).toBe(USER_ID);
  });

  it.each([
    ['session_missing', () => mocks.getSession.mockResolvedValue(null)],
    ['role_not_allowed', () => mocks.userHasRole.mockResolvedValue(false)],
    ['email_unverified', () => mocks.getSession.mockResolvedValue({ user: { id: USER_ID, email: OPERATOR_EMAIL, emailVerified: false } })],
    ['subject_not_allowed', () => mocks.getSession.mockResolvedValue({ user: { id: USER_ID, email: 'other@example.org', emailVerified: true } })],
    ['policy_binding_mismatch', () => mocks.loadConfiguredPrivateRelease.mockResolvedValue({ manifest: { access_policy_id: 'another-policy-id' } })],
  ])('refuses with %s', async (reason, arrange) => {
    arrange();
    await expect(authorizePrivateRequest('private_workspace:read')).rejects.toMatchObject({ reason });
  });

  it('refuses a scope the subject was not granted', async () => {
    await expect(authorizePrivateRequest('restricted_gde:read')).rejects.toMatchObject({ reason: 'scope_not_allowed' });
  });

  it('never matches a non-email policy subject against a session', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: USER_ID, email: 'oidc-subject-without-email', emailVerified: true } });
    await expect(authorizePrivateRequest('private_workspace:read')).rejects.toMatchObject({ reason: 'subject_not_allowed' });
  });

  it('turns every page failure into a plain 404', async () => {
    mocks.userHasRole.mockResolvedValue(false);
    await expect(requirePrivatePage('private_workspace:read')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('research static files', () => {
  it('serves a plain file with private caching and no-index headers', async () => {
    const root = path.join(tempRoot, 'static');
    await mkdir(path.join(root, 'map-styles'), { recursive: true });
    await writeFile(path.join(root, 'map-styles', 'relief.json'), '{"version":8}');
    const response = await serveResearchStaticFile(root, ['map-styles', 'relief.json']);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=86400');
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(await response.text()).toBe('{"version":8}');
  });

  it('rejects traversal, symlinks, unknown types and an unconfigured root', async () => {
    const root = path.join(tempRoot, 'static');
    await writeFile(path.join(tempRoot, 'outside.json'), '{}');
    await symlink(path.join(tempRoot, 'outside.json'), path.join(root, 'linked.json'));
    await writeFile(path.join(root, 'notes.txt'), 'x');
    for (const segments of [['..', 'outside.json'], ['linked.json'], ['notes.txt'], ['.hidden.json'], []]) {
      expect((await serveResearchStaticFile(root, segments)).status).toBe(404);
    }
    expect((await serveResearchStaticFile(undefined, ['map-styles', 'relief.json'])).status).toBe(404);
  });
});

function sourceFiles(directory: string, filename: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full, filename);
    return entry === filename ? [full] : [];
  });
}

describe('research entry points', () => {
  it('guard every page and route themselves, because layouts do not re-run on navigation', () => {
    const pages = sourceFiles(path.join(webRoot, 'app/admin/research'), 'page.tsx');
    const routes = sourceFiles(path.join(webRoot, 'app/api/admin/research'), 'route.ts');
    expect(pages.length).toBeGreaterThan(15);
    expect(routes.length).toBeGreaterThan(14);
    for (const file of [...pages, ...routes]) {
      const source = readFileSync(file, 'utf8');
      expect(source, path.relative(webRoot, file)).toMatch(
        /requireResearchAdmin(Page|Api)\(\)|requirePrivatePage\(|authorizePrivateRequest\(/,
      );
    }
  });

  it('never let shared caches store research responses', () => {
    for (const file of sourceFiles(path.join(webRoot, 'app/api/admin/research'), 'route.ts')) {
      expect(readFileSync(file, 'utf8'), path.relative(webRoot, file)).not.toMatch(/["']public,|s-maxage/);
    }
  });

  it('keep analytics off admin routes and the restricted workspace under its own CSP', () => {
    expect(readFileSync(path.join(webRoot, 'components/analytics/GoogleAnalytics.tsx'), 'utf8')).toContain(
      "pathname?.startsWith('/admin')",
    );
    const middleware = readFileSync(path.join(webRoot, 'middleware.ts'), 'utf8');
    expect(middleware).toContain("'/admin/research/quinkan/private'");
    expect(middleware).toContain('privateContentSecurityPolicy(nonce)');
  });
});
