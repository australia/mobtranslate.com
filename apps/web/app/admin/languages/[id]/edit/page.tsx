'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';
import { Label } from '@ui/components/label';
import { Input } from '@ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/select';
import { useToast } from '@ui/components/use-toast';
import { ArrowLeft, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Language {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

export default function EditLanguagePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [language, setLanguage] = useState<Language | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetchLanguage();
  }, [params.id]);

  const fetchLanguage = async () => {
    try {
      const { data, error } = await supabase
        .from('languages')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error) throw error;
      setLanguage(data);
    } catch (error) {
      console.error('Error fetching language:', error);
      toast({
        title: 'Error',
        description: 'Failed to load language',
        variant: 'destructive'
      });
      router.push('/admin/languages');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!language) return;

    console.log('Saving language:', {
      id: language.id,
      name: language.name,
      code: language.code,
      is_active: language.is_active
    });

    setSaving(true);
    try {
      const url = `/api/v2/admin/languages/${language.id}`;
      console.log('PUT request to:', url);
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: language.name,
          code: language.code,
          is_active: language.is_active
        })
      });

      console.log('Response status:', response.status);
      const responseData = await response.json();
      console.log('Response data:', responseData);

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to update language');
      }

      toast({
        title: 'Success',
        description: 'Language updated successfully'
      });
      router.push('/admin/languages');
    } catch (error) {
      console.error('Error saving language:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save language',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse">Loading language...</div>;
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
          <h1 className="text-3xl font-bold tracking-tight">Edit Language</h1>
          <p className="text-muted-foreground mt-2">
            Update basic language information
          </p>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <CardTitle>Language Details</CardTitle>
            <CardDescription>
              Edit the core language information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Language Name</Label>
              <Input
                id="name"
                value={language.name}
                onChange={(e) => setLanguage({ ...language, name: e.target.value })}
                placeholder="e.g., Kuku Yalanji"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="code">Language Code</Label>
              <Input
                id="code"
                value={language.code}
                onChange={(e) => setLanguage({ ...language, code: e.target.value })}
                placeholder="e.g., kky"
                pattern="[a-zA-Z_-]+"
                title="Letters, underscores, and hyphens only"
                required
              />
              <p className="text-sm text-muted-foreground">
                Unique identifier for the language. Use lowercase letters, underscores, or hyphens.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="is_active">Status</Label>
              <Select 
                value={language.is_active.toString()}
                onValueChange={(value) => setLanguage({ ...language, is_active: value === 'true' })}
              >
                <SelectTrigger id="is_active">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Inactive languages won't appear in public listings
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4 mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/languages')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}