'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, SelectPortal, SelectPositioner, SelectPopup, SelectItem, SelectTrigger, SelectValue } from '@mobtranslate/ui';
import { useToast } from '@/hooks/useToast';
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
        variant: 'error'
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
              <label className="text-sm font-medium" htmlFor="name">Language Name</label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Kuku Yalanji"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="code">Language Code</label>
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
              <label className="text-sm font-medium" htmlFor="is_active">Status</label>
              <Select 
                value={formData.is_active.toString()}
                onValueChange={(value) => value != null && setFormData({ ...formData, is_active: value === 'true' })}
              >
                <SelectTrigger id="is_active">
                  <SelectValue />
                </SelectTrigger>
                <SelectPortal>
                  <SelectPositioner>
                    <SelectPopup>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive</SelectItem>
                    </SelectPopup>
                  </SelectPositioner>
                </SelectPortal>
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