'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';
import { Label } from '@ui/components/label';
import { Input } from '@ui/components/input';
import { Textarea } from '@ui/components/textarea';
import { Switch } from '@ui/components/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/select';
import { useToast } from '@ui/components/use-toast';
import { ArrowLeft, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface LanguageSettings {
  id: string;
  name: string;
  code: string;
  native_name?: string;
  description?: string;
  region?: string;
  country?: string;
  status?: string;
  family?: string;
  writing_system?: string;
  is_active: boolean;
}

export default function LanguageSettingsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [language, setLanguage] = useState<LanguageSettings | null>(null);
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
        description: 'Failed to load language settings',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!language) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('languages')
        .update({
          name: language.name,
          native_name: language.native_name,
          description: language.description,
          region: language.region,
          country: language.country,
          status: language.status,
          family: language.family,
          writing_system: language.writing_system,
          is_active: language.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', language.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Language settings updated successfully'
      });
    } catch (error) {
      console.error('Error saving language:', error);
      toast({
        title: 'Error',
        description: 'Failed to save language settings',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
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
          <h1 className="text-3xl font-bold tracking-tight">{language.name} Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure language settings and metadata
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Core language details and identification
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Language Name</Label>
                <Input
                  id="name"
                  value={language.name}
                  onChange={(e) => setLanguage({ ...language, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="native_name">Native Name</Label>
                <Input
                  id="native_name"
                  value={language.native_name || ''}
                  onChange={(e) => setLanguage({ ...language, native_name: e.target.value })}
                  placeholder="Name in the language itself"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={language.description || ''}
                onChange={(e) => setLanguage({ ...language, description: e.target.value })}
                placeholder="Brief description of the language and its speakers"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Geographic Information</CardTitle>
            <CardDescription>
              Where this language is spoken
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input
                  id="region"
                  value={language.region || ''}
                  onChange={(e) => setLanguage({ ...language, region: e.target.value })}
                  placeholder="e.g., Far North Queensland"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={language.country || ''}
                  onChange={(e) => setLanguage({ ...language, country: e.target.value })}
                  placeholder="e.g., Australia"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Language Classification</CardTitle>
            <CardDescription>
              Linguistic and status information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="family">Language Family</Label>
                <Input
                  id="family"
                  value={language.family || ''}
                  onChange={(e) => setLanguage({ ...language, family: e.target.value })}
                  placeholder="e.g., Pama-Nyungan"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Language Status</Label>
                <Select
                  value={language.status || ''}
                  onValueChange={(value) => setLanguage({ ...language, status: value })}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="safe">Safe</SelectItem>
                    <SelectItem value="vulnerable">Vulnerable</SelectItem>
                    <SelectItem value="endangered">Endangered</SelectItem>
                    <SelectItem value="severely endangered">Severely Endangered</SelectItem>
                    <SelectItem value="critically endangered">Critically Endangered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="writing_system">Writing System</Label>
              <Input
                id="writing_system"
                value={language.writing_system || ''}
                onChange={(e) => setLanguage({ ...language, writing_system: e.target.value })}
                placeholder="e.g., Latin script"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform Settings</CardTitle>
            <CardDescription>
              Control how this language appears on the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="is_active">Active Status</Label>
                <p className="text-sm text-muted-foreground">
                  When disabled, this language won't appear in public listings
                </p>
              </div>
              <Switch
                id="is_active"
                checked={language.is_active}
                onCheckedChange={(checked) => setLanguage({ ...language, is_active: checked })}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}