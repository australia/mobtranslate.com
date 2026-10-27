import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { getSessionUser, userHasRole } from '@/lib/auth-helpers';
import AdminShell from './AdminShell';

// Admin pages, the research workspaces among them, never go in a search index.
export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  const [isSuperAdmin, isLanguageManager] = user
    ? await Promise.all([
        userHasRole(user.id, ['super_admin']),
        userHasRole(user.id, ['dictionary_admin']),
      ])
    : [false, false];
  return <AdminShell isSuperAdmin={isSuperAdmin} isLanguageManager={isLanguageManager}>{children}</AdminShell>;
}
