import { ReactNode } from 'react';
import { getSessionUser, userHasRole } from '@/lib/auth-helpers';
import AdminShell from './AdminShell';

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
