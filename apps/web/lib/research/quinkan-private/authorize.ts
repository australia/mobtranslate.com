import "server-only";

import {lstat, readFile, realpath} from "node:fs/promises";
import path from "node:path";
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {z} from "zod";
import {auth} from "@/lib/auth";
import {userHasRole} from "@/lib/auth-helpers";
import {RESEARCH_ROLES} from "@/lib/research/access";
import {loadConfiguredPrivateRelease} from "./private-release";
import type {VerifiedPrivateRelease} from "./private-release-loader-core";
import {privateJson} from "./responses";

// Ported from the standalone private portal (PRIVATE-WORKSPACE-SECURITY.md).
// That portal verified a Cloudflare Access OIDC assertion at the edge and in the
// app. Inside mobtranslate the verified identity is the better-auth session
// instead: the user must be super_admin, have a verified email, and that email
// must be an explicitly allowed subject in the same access-policy file the
// restricted release is bound to. A missing or invalid policy fails closed.

export const privateScopeSchema = z.enum(["private_workspace:read", "restricted_gde:read"]);
export type PrivateScope = z.infer<typeof privateScopeSchema>;

const allowedSubjectSchema = z
  .object({
    subject: z.string().min(3).max(512),
    principal_claim: z.enum(["sub", "email"]).optional(),
    operator_label: z.string().min(3).max(160),
    roles: z.array(z.string().regex(/^[a-z][a-z0-9_:-]{2,79}$/)).min(1).max(12),
    scopes: z.array(privateScopeSchema).min(1),
  })
  .strict();

const accessPolicySchema = z
  .object({
    schema_version: z.literal(1),
    policy_id: z.string().regex(/^[a-z0-9](?:[a-z0-9._-]{1,118}[a-z0-9])$/),
    subjects: z.array(allowedSubjectSchema).min(1).max(64),
  })
  .strict();

type AccessPolicy = z.infer<typeof accessPolicySchema>;

export type AuthorizedPrivateRequest = Readonly<{
  userId: string;
  operatorLabel: string;
  scopes: readonly PrivateScope[];
  release: VerifiedPrivateRelease;
}>;

export type PrivateAuthFailureReason =
  | "session_missing"
  | "role_not_allowed"
  | "email_unverified"
  | "subject_not_allowed"
  | "scope_not_allowed"
  | "policy_binding_mismatch";

export class PrivateAuthError extends Error {
  constructor(readonly reason: PrivateAuthFailureReason) {
    super(reason);
    this.name = "PrivateAuthError";
  }
}

async function readStrictJsonFile(filename: string): Promise<unknown> {
  if (!path.isAbsolute(filename)) throw new Error("private access-policy file must be an absolute path");
  const resolved = path.resolve(filename);
  const metadata = await lstat(resolved);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("private access-policy file must be a non-symlink regular file");
  }
  if ((await realpath(resolved)) !== resolved) {
    throw new Error("private access-policy file may not contain symlink components");
  }
  return JSON.parse(await readFile(resolved, "utf8"));
}

async function loadAccessPolicyFromEnvironment(): Promise<AccessPolicy> {
  const filename = process.env.QUINKAN_PRIVATE_ACCESS_POLICY_FILE;
  if (!filename) throw new Error("private runtime configuration missing: QUINKAN_PRIVATE_ACCESS_POLICY_FILE");
  const policy = accessPolicySchema.parse(await readStrictJsonFile(filename));
  const uniqueSubjects = new Set(policy.subjects.map((entry) => entry.subject));
  if (uniqueSubjects.size !== policy.subjects.length) {
    throw new Error("private access-policy subjects must be unique");
  }
  return Object.freeze(policy);
}

let configuredPolicy: Promise<AccessPolicy> | undefined;

function loadConfiguredAccessPolicy(): Promise<AccessPolicy> {
  configuredPolicy ??= loadAccessPolicyFromEnvironment();
  configuredPolicy.catch(() => {
    configuredPolicy = undefined;
  });
  return configuredPolicy;
}

export async function authorizePrivateRequest(requiredScope: PrivateScope): Promise<AuthorizedPrivateRequest> {
  const session = await auth.api.getSession({headers: await headers()});
  if (!session?.user) throw new PrivateAuthError("session_missing");
  if (!(await userHasRole(session.user.id, RESEARCH_ROLES))) throw new PrivateAuthError("role_not_allowed");
  if (session.user.emailVerified !== true) throw new PrivateAuthError("email_unverified");

  const [policy, release] = await Promise.all([loadConfiguredAccessPolicy(), loadConfiguredPrivateRelease()]);
  if (release.manifest.access_policy_id !== policy.policy_id) throw new PrivateAuthError("policy_binding_mismatch");

  // Only email subjects can be matched: an OIDC `sub` from the old edge identity
  // provider has no equivalent in a mobtranslate session.
  const subject = policy.subjects.find(
    (entry) => entry.principal_claim === "email" && entry.subject === session.user.email,
  );
  if (!subject) throw new PrivateAuthError("subject_not_allowed");
  if (!subject.scopes.includes(requiredScope)) throw new PrivateAuthError("scope_not_allowed");

  return Object.freeze({
    userId: session.user.id,
    operatorLabel: subject.operator_label,
    scopes: Object.freeze([...subject.scopes]),
    release,
  });
}

export function logPrivateAuthorizationFailure(error: unknown): void {
  const reason = error instanceof PrivateAuthError ? error.reason : "runtime_verification_failed";
  console.warn(JSON.stringify({event: "private_authorization_denied", reason}));
}

/** Page guard: every failure, including misconfiguration, is a plain 404. */
export async function requirePrivatePage(requiredScope: PrivateScope): Promise<AuthorizedPrivateRequest> {
  try {
    return await authorizePrivateRequest(requiredScope);
  } catch (error) {
    logPrivateAuthorizationFailure(error);
    notFound();
  }
}

export function privateAuthFailure(): Response {
  return privateJson({error: "private_workspace_authentication_required"}, 401);
}
