'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';
import { Label } from '@ui/components/label';
import { Input } from '@ui/components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ui/components/Table';
import { Badge } from '@ui/components/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@ui/components/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/select';
import { useToast } from '@ui/components/use-toast';
import { ArrowLeft, UserPlus, Trash2, Shield } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Language {
  id: string;
  name: string;
  code: string;
}

interface Curator {
  id: string;
  user_id: string;
  email: string;
  role: string;
  assigned_at: string;
  is_active: boolean;
}

export default function LanguageSettingsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [language, setLanguage] = useState<Language | null>(null);
  const [curators, setCurators] = useState<Curator[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingCurator, setAddingCurator] = useState(false);
  const [newCuratorEmail, setNewCuratorEmail] = useState('');
  const [newCuratorRole, setNewCuratorRole] = useState('curator');
  const supabase = createClient();

  useEffect(() => {
    fetchLanguageAndCurators();
  }, [params.id]);

  const fetchLanguageAndCurators = async () => {
    try {
      // Fetch language
      const { data: langData, error: langError } = await supabase
        .from('languages')
        .select('id, name, code')
        .eq('id', params.id)
        .single();

      if (langError) throw langError;
      setLanguage(langData);

      // Fetch curators for this language
      const { data: curatorData, error: curatorError } = await supabase
        .from('user_role_assignments')
        .select(`
          id,
          user_id,
          is_active,
          assigned_at,
          user_profiles!inner(email),
          user_roles!inner(name)
        `)
        .eq('language_id', params.id)
        .in('user_roles.name', ['curator', 'lead_curator']);

      if (curatorError) throw curatorError;

      const formattedCurators = curatorData?.map(c => ({
        id: c.id,
        user_id: c.user_id,
        email: c.user_profiles.email,
        role: c.user_roles.name,
        assigned_at: c.assigned_at,
        is_active: c.is_active
      })) || [];

      setCurators(formattedCurators);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load language settings',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCurator = async () => {
    if (!language || !newCuratorEmail) return;

    setAddingCurator(true);
    try {
      // First find the user by email
      const { data: userData, error: userError } = await supabase
        .from('user_profiles')
        .select('user_id')
        .eq('email', newCuratorEmail)
        .single();

      if (userError || !userData) {
        throw new Error('User not found with that email');
      }

      // Get the role ID
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('id')
        .eq('name', newCuratorRole)
        .single();

      if (roleError || !roleData) {
        throw new Error('Role not found');
      }

      // Create the assignment
      const { error: assignError } = await supabase
        .from('user_role_assignments')
        .insert({
          user_id: userData.user_id,
          role_id: roleData.id,
          language_id: language.id,
          assigned_by: (await supabase.auth.getUser()).data.user?.id,
          is_active: true
        });

      if (assignError) throw assignError;

      toast({
        title: 'Success',
        description: 'Curator added successfully'
      });
      
      setNewCuratorEmail('');
      fetchLanguageAndCurators();
    } catch (error) {
      console.error('Error adding curator:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add curator',
        variant: 'destructive'
      });
    } finally {
      setAddingCurator(false);
    }
  };

  const handleRemoveCurator = async (curatorId: string) => {
    try {
      const { error } = await supabase
        .from('user_role_assignments')
        .delete()
        .eq('id', curatorId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Curator removed successfully'
      });
      
      fetchLanguageAndCurators();
    } catch (error) {
      console.error('Error removing curator:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove curator',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return <div className="animate-pulse">Loading language settings...</div>;
  }

  if (!language) {
    return <div>Language not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/admin/languages')}
          className="h-9 w-9"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{language.name} Curator Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage curators and their permissions for this language
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Curators List */}
        <Card>
          <CardHeader>
            <CardTitle>Current Curators</CardTitle>
            <CardDescription>
              Users who can contribute to this language's dictionary
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {curators.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No curators assigned to this language
                    </TableCell>
                  </TableRow>
                ) : (
                  curators.map((curator) => (
                    <TableRow key={curator.id}>
                      <TableCell>{curator.email}</TableCell>
                      <TableCell>
                        <Badge variant={curator.role === 'lead_curator' ? 'default' : 'secondary'}>
                          <Shield className="h-3 w-3 mr-1" />
                          {curator.role === 'lead_curator' ? 'Lead Curator' : 'Curator'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={curator.is_active ? 'default' : 'secondary'}>
                          {curator.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(curator.assigned_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveCurator(curator.id)}
                          title="Remove curator"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add Curator */}
        <Card>
          <CardHeader>
            <CardTitle>Add Curator</CardTitle>
            <CardDescription>
              Assign a user as a curator for this language
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="email" className="sr-only">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={newCuratorEmail}
                  onChange={(e) => setNewCuratorEmail(e.target.value)}
                />
              </div>
              <Select value={newCuratorRole} onValueChange={setNewCuratorRole}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="curator">Curator</SelectItem>
                  <SelectItem value="lead_curator">Lead Curator</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                onClick={handleAddCurator} 
                disabled={addingCurator || !newCuratorEmail}
                className="gap-2"
              >
                <UserPlus className="h-4 w-4" />
                {addingCurator ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Curator Permissions Info */}
        <Card>
          <CardHeader>
            <CardTitle>Curator Permissions</CardTitle>
            <CardDescription>
              What each role can do
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium flex items-center gap-2">
                  <Badge variant="secondary">
                    <Shield className="h-3 w-3 mr-1" />
                    Curator
                  </Badge>
                </h4>
                <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                  <li>• Add new words and translations</li>
                  <li>• Edit existing entries</li>
                  <li>• Upload audio recordings</li>
                  <li>• View all dictionary content</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium flex items-center gap-2">
                  <Badge>
                    <Shield className="h-3 w-3 mr-1" />
                    Lead Curator
                  </Badge>
                </h4>
                <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                  <li>• All curator permissions</li>
                  <li>• Review and approve changes</li>
                  <li>• Delete entries</li>
                  <li>• Manage other curators' submissions</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}