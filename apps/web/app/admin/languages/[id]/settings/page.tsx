'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Label } from '@/app/components/ui/label';
import { Input } from '@/app/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table/Table';
import { Badge } from '@/app/components/ui/badge';
import { useToast } from '@/app/components/ui/use-toast';
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

      // Fetch curators using API endpoint
      const response = await fetch(`/api/v2/admin/languages/${params.id}/curators`);
      const curators = await response.json();

      if (!response.ok) {
        throw new Error(curators.error || 'Failed to fetch curators');
      }

      setCurators(curators);
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
      const response = await fetch(`/api/v2/admin/languages/${language.id}/curators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newCuratorEmail })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add curator');
      }

      toast({
        title: 'Success',
        description: 'Curator added successfully'
      });
      
      setNewCuratorEmail('');
      // Add a small delay to ensure the database has committed the change
      setTimeout(() => {
        fetchLanguageAndCurators();
      }, 500);
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
      const response = await fetch(`/api/v2/admin/languages/${language?.id}/curators?assignmentId=${curatorId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove curator');
      }

      toast({
        title: 'Success',
        description: 'Curator removed successfully'
      });
      
      fetchLanguageAndCurators();
    } catch (error) {
      console.error('Error removing curator:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove curator',
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
            Manage curators for this language's dictionary
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Curators List */}
        <Card>
          <CardHeader>
            <CardTitle>Current Curators</CardTitle>
            <CardDescription>
              Users who can manage this language's dictionary content
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {curators.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No curators assigned to this language
                    </TableCell>
                  </TableRow>
                ) : (
                  curators.map((curator) => (
                    <TableRow key={curator.id}>
                      <TableCell>{curator.email}</TableCell>
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
                  placeholder="Enter user's email address"
                  value={newCuratorEmail}
                  onChange={(e) => setNewCuratorEmail(e.target.value)}
                />
              </div>
              <Button 
                onClick={handleAddCurator} 
                disabled={addingCurator || !newCuratorEmail}
                className="gap-2"
              >
                <UserPlus className="h-4 w-4" />
                {addingCurator ? 'Adding...' : 'Add Curator'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Curator Permissions Info */}
        <Card>
          <CardHeader>
            <CardTitle>Curator Permissions</CardTitle>
            <CardDescription>
              What curators can do for this language
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3">
              <Badge className="mt-0.5">
                <Shield className="h-3 w-3 mr-1" />
                Curator
              </Badge>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Curators have full control over their assigned language's dictionary:</p>
                <ul className="mt-2 space-y-1">
                  <li>• Add, edit, and delete words and translations</li>
                  <li>• Upload and manage audio recordings</li>
                  <li>• Manage categories and tags</li>
                  <li>• Review and approve community contributions</li>
                  <li>• Export dictionary data</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}