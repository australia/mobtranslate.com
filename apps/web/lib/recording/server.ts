// Server-side helpers shared by the recording admin API routes.
//
// Auth/authz is enforced in app code (RLS is gone): the caller must be signed in
// (better-auth) and hold an admin role. Audio objects live on the box filesystem
// (lib/storage) and are served same-origin via /api/storage/recordings/*.
import { NextResponse } from 'next/server';
import { getSessionUser, userHasRole } from '@/lib/auth-helpers';
import {
  recordingPublicUrl,
  saveRecording,
  deleteRecording,
} from '@/lib/storage';

export const ADMIN_ROLES = ['super_admin', 'dictionary_admin'];
export const BUCKET = 'recordings';

function authError(message: string, status: 401 | 403): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

interface AdminOk {
  user: { id: string };
  error?: undefined;
}
interface AdminErr {
  error: NextResponse;
  user?: undefined;
}

/** Verify the caller is signed in and holds an admin role. */
export async function requireAdmin(): Promise<AdminOk | AdminErr> {
  const user = await getSessionUser();
  if (!user) {
    return { error: authError('Unauthorized', 401) };
  }
  const isAdmin = await userHasRole(user.id, ADMIN_ROLES);
  if (!isAdmin) {
    return { error: authError('Forbidden', 403) };
  }
  return { user: { id: user.id } };
}

/** Require any signed-in user (not necessarily an admin) — for the contribute portal. */
export async function requireUser(): Promise<AdminOk | AdminErr> {
  const user = await getSessionUser();
  if (!user) return { error: authError('Please sign in.', 401) };
  return { user: { id: user.id } };
}

/** Store an audio object on the box filesystem and return its path + same-origin URL. */
export async function uploadAudio(
  path: string,
  file: Blob | ArrayBuffer | Buffer,
  _contentType: string,
): Promise<{ path: string; url: string }> {
  const buf =
    file instanceof ArrayBuffer
      ? Buffer.from(file)
      : Buffer.isBuffer(file)
        ? file
        : Buffer.from(await (file as Blob).arrayBuffer());
  await saveRecording(path, buf);
  return { path, url: recordingPublicUrl(path)! };
}

/** Remove a stored audio object (no error if missing). */
export async function removeAudio(path: string): Promise<void> {
  await deleteRecording(path);
}
