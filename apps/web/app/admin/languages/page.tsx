'use client';

import useSWR from 'swr';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge } from '@mobtranslate/ui';
import { useToast } from '@/hooks/useToast';
import { Plus, Edit, Users, Globe, BookOpen, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
});

export default function LanguagesPage() {
  const router = useRouter();
  const { toast } = useToast();

  const { data: languages = [], error, isLoading } = useSWR(
    '/api/v2/admin/languages',
    fetcher
  );

  if (error) {
    toast({
      title: 'Error',
      description: 'Failed to load languages',
      variant: 'error'
    });
  }


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Languages</h1>
          <p className="text-muted-foreground mt-2">
            Manage languages and their curation settings
          </p>
        </div>
        <Button onClick={() => router.push('/admin/languages/new')}>
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
              {languages.filter((l: any) => l.is_active).length}
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
              {languages.reduce((sum: number, l: any) => sum + (l.word_count || 0), 0).toLocaleString()}
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
              {languages.reduce((sum: number, l: any) => sum + (l.curator_count || 0), 0)}
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
              {isLoading ? (
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
                languages.map((language: any) => (
                  <TableRow key={language.id}>
                    <TableCell className="font-medium">{language.name}</TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {language.code}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={language.is_active ? 'primary' : 'secondary'}>
                        {language.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>{language.word_count || 0}</TableCell>
                    <TableCell>{language.curator_count || 0}</TableCell>
                    <TableCell>
                      {new Date(language.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/admin/languages/${language.id}/edit`)}
                          title="Edit language"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <a href={`/admin/languages/${language.id}/settings`} title="Language settings" className="p-2">
                            <Settings className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}