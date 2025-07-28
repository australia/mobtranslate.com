import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Shield, Users, Languages, FileText, Settings } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';

export default async function AdminDashboard() {
  const supabase = createClient();
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/signin?redirect=/admin');
  }

  // Check if user is admin
  const { data: isAdmin } = await supabase
    .rpc('user_has_role', {
      user_uuid: user.id,
      role_names: ['super_admin', 'dictionary_admin']
    });

  if (!isAdmin) {
    redirect('/');
  }

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="h-8 w-8" />
            Admin Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage users, languages, and curation settings
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/admin/users">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  User Management
                </CardTitle>
                <CardDescription>
                  Manage user roles and permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Assign curator roles, manage contributors, and view user activity
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/languages">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Languages className="h-5 w-5" />
                  Language Settings
                </CardTitle>
                <CardDescription>
                  Configure language-specific curation settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Manage curation rules, quality guidelines, and import settings
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/curator">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Curator Dashboard
                </CardTitle>
                <CardDescription>
                  Review words and manage content
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Access the curator dashboard to review submissions
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/roles">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Role Management
                </CardTitle>
                <CardDescription>
                  Manage system roles and permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Create and modify user roles (Super Admin only)
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/activity">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Activity Logs
                </CardTitle>
                <CardDescription>
                  View system-wide curation activity
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Monitor curator actions and system changes
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}