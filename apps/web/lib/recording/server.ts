// Server-side helpers shared by the recording admin API routes.
//
// Routes act as the signed-in admin user (RLS enforces that only
// super_admin / dictionary_admin can write), so no service-role key is needed.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const ADMIN_ROLES = ['super_admin', 'dictionary_admin'];
export const BUCKET = 'recordings';

export type SupabaseServer = ReturnType<typeof createClient>;

interface AdminOk {
  user: { id: string };
  supabase: SupabaseServer;
  error?: undefined;
}
interface AdminErr {
  error: NextResponse;
  user?: undefined;
  supabase?: undefined;
}

/** Verify the caller is signed in and holds an admin role. */
export async function requireAdmin(): Promise<AdminOk | AdminErr> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: isAdmin } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_names: ADMIN_ROLES,
  });
  if (!isAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, supabase };
}

/** Upload an audio blob to the recordings bucket and return its path + public URL. */
export async function uploadAudio(
  supabase: SupabaseServer,
  path: string,
  file: Blob | ArrayBuffer | Buffer,
  contentType: string,
): Promise<{ path: string; url: string }> {
  const body = file instanceof ArrayBuffer ? Buffer.from(file) : file;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: true,
    cacheControl: '31536000',
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}
