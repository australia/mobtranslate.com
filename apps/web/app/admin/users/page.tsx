'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Shield, UserPlus, Search } from 'lucide-react';
import { Button, Input, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Dialog, DialogPortal, DialogBackdrop, DialogPopup, DialogDescription, DialogTitle, DialogTrigger, Select, SelectPortal, SelectPositioner, SelectPopup, SelectItem, SelectTrigger, SelectValue } from '@mobtranslate/ui';
import { useToast } from '@/hooks/useToast';
import { formatDistanceToNow } from '@/lib/utils/date';

interface User {
  id: string;
  email: string;
  display_name?: string;
  username?: string;
  created_at: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
  roles?: Array<{
    role: {
      id: string;
      name: string;
      display_name: string;
    };
    language?: {
      id: string;
      name: string;
      code: string;
    };
    assigned_at: string;
    expires_at?: string;
  }>;
}

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
});

export default function UserManagementPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [assignRoleOpen, setAssignRoleOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const { toast } = useToast();

  // Fetch users with SWR
  const { data: users = [], error: usersError, isLoading: usersLoading, mutate: mutateUsers } = useSWR(
    '/api/v2/admin/users',
    fetcher
  );

  // Fetch roles with SWR
  const { data: roles = [], error: rolesError } = useSWR(
    '/api/v2/admin/roles',
    fetcher
  );

  // Fetch languages with SWR
  const { data: languages = [], error: languagesError } = useSWR(
    '/api/v2/admin/languages',
    fetcher
  );

  // Handle errors
  if (usersError || rolesError || languagesError) {
    toast({
      title: 'Error',
      description: 'Failed to load data',
      variant: 'error'
    });
  }

  const handleAssignRole = async () => {
    if (!selectedUser || !selectedRole) return;

    try {
      const response = await fetch(`/api/v2/admin/users/${selectedUser.id}/assign-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_id: selectedRole,
          language_id: selectedLanguage || null
        })
      });

      if (!response.ok) throw new Error('Failed to assign role');

      toast({
        title: 'Success',
        description: 'Role assigned successfully'
      });

      setAssignRoleOpen(false);
      setSelectedUser(null);
      setSelectedRole('');
      setSelectedLanguage('');
      // Refresh users data
      await mutateUsers();
    } catch (error) {
      console.error('Error assigning role:', error);
      toast({
        title: 'Error',
        description: 'Failed to assign role',
        variant: 'error'
      });
    }
  };

  const filteredUsers = users.filter((user: any) =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleBadgeColor = (roleName: string) => {
    switch (roleName) {
      case 'super_admin': return 'error';
      case 'dictionary_admin': return 'primary';
      case 'curator': return 'secondary';
      case 'contributor': return 'outline';
      default: return 'outline';
    }
  };

  if (usersLoading) {
    return <div className="animate-pulse">Loading users...</div>;
  }

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Shield className="h-6 w-6" />
                  User Management
                </CardTitle>
                <CardDescription>
                  Manage user roles and permissions
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users by email or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user: any) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.display_name || user.username || 'No name'}</div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles?.length === 0 && (
                            <Badge variant="outline" className="text-xs">
                              User
                            </Badge>
                          )}
                          {user.roles?.map((assignment: any, idx: number) => (
                            <Badge
                              key={idx}
                              variant={getRoleBadgeColor(assignment.role.name)}
                              className="text-xs"
                            >
                              {assignment.role.display_name}
                              {assignment.language && ` (${assignment.language.code})`}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(user.created_at))}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Dialog open={assignRoleOpen && selectedUser?.id === user.id} onOpenChange={(open) => {
                          if (!open) {
                            setSelectedUser(null);
                            setSelectedRole('');
                            setSelectedLanguage('');
                          }
                          setAssignRoleOpen(open);
                        }}>
                          <DialogTrigger
                            className="mt-btn mt-btn-ghost mt-btn-sm"
                            onClick={() => setSelectedUser(user)}
                          >
                            <UserPlus className="h-4 w-4" />
                          </DialogTrigger>
                          <DialogPortal>
                            <DialogBackdrop />
                            <DialogPopup>
                              <DialogTitle>Assign Role</DialogTitle>
                              <DialogDescription>
                                Assign a role to {user.display_name || user.username || user.email}
                              </DialogDescription>
                              <div className="space-y-4 mt-4">
                                <div className="space-y-2">
                                  <label className="text-sm font-medium" htmlFor="role">Role</label>
                                  <Select value={selectedRole} onValueChange={(v) => v != null && setSelectedRole(v)}>
                                    <SelectTrigger id="role">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectPortal>
                                      <SelectPositioner>
                                        <SelectPopup>
                                          {roles.map((role: any) => (
                                            <SelectItem key={role.id} value={role.id}>
                                              {role.display_name}
                                            </SelectItem>
                                          ))}
                                        </SelectPopup>
                                      </SelectPositioner>
                                    </SelectPortal>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <label className="text-sm font-medium" htmlFor="language">Language (optional)</label>
                                  <Select value={selectedLanguage} onValueChange={(v) => v != null && setSelectedLanguage(v)}>
                                    <SelectTrigger id="language">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectPortal>
                                      <SelectPositioner>
                                        <SelectPopup>
                                          <SelectItem value="">Global (all languages)</SelectItem>
                                          {languages.map((lang: any) => (
                                            <SelectItem key={lang.id} value={lang.id}>
                                              {lang.name} ({lang.code})
                                            </SelectItem>
                                          ))}
                                        </SelectPopup>
                                      </SelectPositioner>
                                    </SelectPortal>
                                  </Select>
                                </div>

                                <Button
                                  className="w-full"
                                  onClick={handleAssignRole}
                                  disabled={!selectedRole}
                                >
                                  Assign Role
                                </Button>
                              </div>
                            </DialogPopup>
                          </DialogPortal>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}