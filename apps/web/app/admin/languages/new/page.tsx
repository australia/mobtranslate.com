'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';
import { Label } from '@ui/components/label';
import { Input } from '@ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/select';
import { useToast } from '@ui/components/use-toast';
import { ArrowLeft, Save } from 'lucide-react';

export default function NewLanguagePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    is_active: true
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    try {
      const response = await fetch('/api/v2/admin/languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create language');
      }

      toast({
        title: 'Success',
        description: 'Language created successfully'
      });
      router.push('/admin/languages');
    } catch (error) {
      console.error('Error creating language:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create language',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

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
          <h1 className="text-3xl font-bold tracking-tight">Add New Language</h1>
          <p className="text-muted-foreground mt-2">
            Create a new language for the platform
          </p>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <CardTitle>Language Details</CardTitle>
            <CardDescription>
              Enter the basic information for the new language
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Language Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Kuku Yalanji"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="code">Language Code</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
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
                value={formData.is_active.toString()}
                onValueChange={(value) => setFormData({ ...formData, is_active: value === 'true' })}
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
                You can set this to inactive to prepare the language before making it public
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
            <span>{saving ? 'Creating...' : 'Create Language'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}