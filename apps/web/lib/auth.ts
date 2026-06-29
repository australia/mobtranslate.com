import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { db } from './db/index';
import { authSchema } from './db/auth-schema';
import { sendEmail, emailLayout } from './email';

const getBaseURL = () => {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.NODE_ENV === 'development') return 'http://localhost:3301';
  return 'https://mobtranslate.com';
};

// Reimplements the old `handle_new_user_profile` trigger + keeps a thin
// auth.users row in sync so the ~30 public FKs (user_profiles.user_id,
// words.created_by, ...) that still reference auth.users(id) stay valid.
async function mirrorUserAndCreateProfile(u: { id: string; email: string; name?: string | null }) {
  const username = (u.name && u.name.trim()) || u.email.split('@')[0];
  await db.execute(sql`
    INSERT INTO auth.users (id, email, aud, role, email_confirmed_at,
                            created_at, updated_at, raw_user_meta_data, is_sso_user, is_anonymous)
    VALUES (${u.id}::uuid, ${u.email}, 'authenticated', 'authenticated', now(),
            now(), now(), jsonb_build_object('username', ${username}::text), false, false)
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO public.user_profiles (user_id, username, display_name, email)
    VALUES (${u.id}::uuid, ${username}, ${username}, ${u.email})
    ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, updated_at = now()
  `);
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: getBaseURL(),
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
  emailAndPassword: {
    enabled: true,
    // Existing users are already verified; we don't force verification (no lockouts).
    requireEmailVerification: false,
    autoSignIn: true,
    // Password reset emails via Resend.
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      await sendEmail({
        to: user.email,
        subject: 'Reset your Mob Translate password',
        html: emailLayout({
          heading: 'Reset your password',
          body: 'We received a request to reset your Mob Translate password. Tap the button below to choose a new one. If you didn’t ask for this, you can ignore this email.',
          button: { label: 'Reset password', url },
        }),
        text: `Reset your Mob Translate password: ${url}`,
      });
    },
    // Reuse the GoTrue bcrypt hashes so all 35 migrated users keep their
    // passwords (better-auth defaults to scrypt otherwise).
    password: {
      hash: async (password: string) => bcrypt.hash(password, 10),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        bcrypt.compare(password, hash),
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  // UUID ids so better-auth user.id mirrors 1:1 into auth.users.id (uuid).
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  trustedOrigins: [
    'https://mobtranslate.com',
    'http://localhost:3300',
    'http://localhost:3301',
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser: { id: string; email: string; name?: string | null }) => {
          try {
            await mirrorUserAndCreateProfile(createdUser);
          } catch (error) {
            console.error('[auth] mirror/profile creation failed:', error);
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
