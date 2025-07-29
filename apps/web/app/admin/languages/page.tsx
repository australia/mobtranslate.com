'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ui/components';
import { Badge } from '@ui/components/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@ui/components/dialog';
import { Input } from '@ui/components/input';
import { Label } from '@ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/select';
import { useToast } from '@ui/components/use-toast';
import { Plus, Edit, Users, Globe, BookOpen, Settings } from 'lucide-react';

interface Language {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  word_count?: number;
  curator_count?: number;
  created_at: string;
}

export default function LanguagesPage() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLanguage, setEditingLanguage] = useState<Language | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchLanguages();
  }, []);

  const fetchLanguages = async () => {
    try {
      const response = await fetch('/api/v2/admin/languages');
      if (response.ok) {
        const data = await response.json();
        setLanguages(data);
      }
    } catch (error) {
      console.error('Failed to fetch languages:', error);
      toast({
        title: 'Error',
        description: 'Failed to load languages',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLanguage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const languageData = {
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      is_active: formData.get('is_active') === 'true'
    };

    try {
      const url = editingLanguage 
        ? `/api/v2/admin/languages/${editingLanguage.id}`
        : '/api/v2/admin/languages';
      
      const response = await fetch(url, {
        method: editingLanguage ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(languageData)
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: `Language ${editingLanguage ? 'updated' : 'created'} successfully`
        });
        setIsDialogOpen(false);
        setEditingLanguage(null);
        fetchLanguages();
      }
    } catch (error) {
      console.error('Failed to save language:', error);
      toast({
        title: 'Error',
        description: 'Failed to save language',
        variant: 'destructive'
      });
    }
  };

  const openEditDialog = (language: Language) => {
    setEditingLanguage(language);
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingLanguage(null);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Languages</h1>
          <p className="text-muted-foreground mt-2">
            Manage languages and their curation settings
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Language
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Languages
            </CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {languages.filter(l => l.is_active).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Available for curation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Words
            </CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {languages.reduce((sum, l) => sum + (l.word_count || 0), 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all languages
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Curators
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {languages.reduce((sum, l) => sum + (l.curator_count || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Active curators
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Languages Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Languages</CardTitle>
          <CardDescription>
            Click on a language to manage its settings and curators
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Words</TableHead>
                <TableHead>Curators</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    Loading languages...
                  </TableCell>
                </TableRow>
              ) : languages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    No languages found
                  </TableCell>
                </TableRow>
              ) : (
                languages.map((language) => (
                  <TableRow key={language.id}>
                    <TableCell className="font-medium">{language.name}</TableCell>
                    <TableCell>
                      <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                        {language.code}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={language.is_active ? 'default' : 'secondary'}>
                        {language.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>{language.word_count || 0}</TableCell>
                    <TableCell>{language.curator_count || 0}</TableCell>
                    <TableCell>
                      {new Date(language.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(language)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                      >
                        <a href={`/admin/languages/${language.code}`}>
                          <Settings className="h-4 w-4 mr-2" />
                          Settings
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSaveLanguage}>
            <DialogHeader>
              <DialogTitle>
                {editingLanguage ? 'Edit Language' : 'Add New Language'}
              </DialogTitle>
              <DialogDescription>
                {editingLanguage 
                  ? 'Update the language details below'
                  : 'Add a new language to the platform'
                }
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Language Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="e.g., Kuku Yalanji"
                  defaultValue={editingLanguage?.name}
                  required
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="code">Language Code</Label>
                <Input
                  id="code"
                  name="code"
                  placeholder="e.g., kky"
                  defaultValue={editingLanguage?.code}
                  pattern="[a-z]{2,3}"
                  title="2-3 lowercase letters"
                  required
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="is_active">Status</Label>
                <Select 
                  name="is_active" 
                  defaultValue={editingLanguage?.is_active?.toString() ?? 'true'}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingLanguage ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}