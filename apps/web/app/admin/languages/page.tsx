'use client';

import useSWR from 'swr';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge } from '@mobtranslate/ui';
import { AlertCircle, Plus, Edit, Users, Globe, BookOpen, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface LanguageSummary {
  id: string;
  name: string;
  code: string;
  is_active?: boolean | null;
  word_count?: number | null;
  curator_count?: number | null;
  created_at?: string | null;
}

interface LanguagesPayload { languages: LanguageSummary[]; canCreate: boolean }

const fetcher = async (url: string): Promise<LanguagesPayload> => {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not load managed languages.');
  return {
    languages: Array.isArray(data) ? data : [],
    canCreate: response.headers.get('X-MobTranslate-Can-Create-Language') === 'true',
  };
};

export default function LanguagesPage() {
  const router = useRouter();

  const { data, error, isLoading } = useSWR(
    '/api/v2/admin/languages',
    fetcher
  );
  const languages = data?.languages ?? [];


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Languages</h1>
          <p className="text-muted-foreground mt-2">
            Manage languages and their curation settings
          </p>
        </div>
        {data?.canCreate ? <Button onClick={() => router.push('/admin/languages/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Add Language
        </Button> : null}
      </div>

      {error ? <Card><CardContent className="flex items-start gap-3 py-5"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-error" /><div><p className="font-medium">Managed languages did not load</p><p className="mt-1 text-sm text-muted-foreground">{error.message}</p></div></CardContent></Card> : isLoading ? <div className="space-y-4" aria-label="Loading managed languages"><div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-muted" aria-hidden="true" />)}</div><div className="h-64 animate-pulse rounded-xl bg-muted" aria-hidden="true" /></div> : <>

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
              {languages.filter((language) => language.is_active).length}
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
              {languages.reduce((sum, language) => sum + (language.word_count || 0), 0).toLocaleString()}
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
              {languages.reduce((sum, language) => sum + (language.curator_count || 0), 0)}
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
              {languages.length === 0 ? (
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
                      {language.created_at ? new Date(language.created_at).toLocaleDateString() : 'Not recorded'}
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
      </>}

    </div>
  );
}
