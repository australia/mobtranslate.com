'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import SharedLayout from '../components/SharedLayout';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Textarea, Avatar, Separator } from '@mobtranslate/ui';
import { LoadingState } from '@/components/layout/LoadingState';
import { Save, AlertCircle, CheckCircle, Edit, Settings, AtSign, User, FileText, Mail, Calendar, Hash, Loader2 } from 'lucide-react';

interface UserProfile {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    bio: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const avatarInitials = useMemo(() => {
    if (formData.display_name?.trim()) {
      return formData.display_name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }
    if (formData.username?.trim()) {
      return formData.username.trim().slice(0, 2).toUpperCase();
    }
    return '?';
  }, [formData.username, formData.display_name]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    fetchProfile();
  }, [user, authLoading, router]);

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/user/profile');
      if (!response.ok) throw new Error('Failed to fetch profile');

      const data = await response.json();
      setProfile(data.profile);
      setFormData({
        username: data.profile?.username || '',
        display_name: data.profile?.display_name || '',
        bio: data.profile?.bio || ''
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
      setError('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };

      // Check if there are changes - compare with original profile data
      if (profile) {
        const originalUsername = profile.username || '';
        const originalDisplayName = profile.display_name || '';
        const originalBio = profile.bio || '';

        const hasChanges =
          newData.username !== originalUsername ||
          newData.display_name !== originalDisplayName ||
          newData.bio !== originalBio;

        console.log('Change detection:', {
          username: { new: newData.username, original: originalUsername, changed: newData.username !== originalUsername },
          display_name: { new: newData.display_name, original: originalDisplayName, changed: newData.display_name !== originalDisplayName },
          bio: { new: newData.bio, original: originalBio, changed: newData.bio !== originalBio },
          hasChanges
        });

        setHasChanges(hasChanges);
      }

      return newData;
    });

    // Clear messages when user starts typing
    setError('');
    setSuccess('');
  };

  const validateForm = () => {
    if (!formData.username.trim()) {
      setError('Username is required');
      return false;
    }

    if (formData.username.length < 3) {
      setError('Username must be at least 3 characters long');
      return false;
    }

    if (formData.username.length > 50) {
      setError('Username must be no more than 50 characters long');
      return false;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
      setError('Username can only contain letters, numbers, underscores, and hyphens');
      return false;
    }

    if (formData.display_name.length > 100) {
      setError('Display name must be no more than 100 characters');
      return false;
    }

    if (formData.bio.length > 500) {
      setError('Bio must be no more than 500 characters');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      setProfile(data.profile);
      setSuccess('Profile updated successfully!');
      setHasChanges(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) return null;

  return (
    <SharedLayout>
      <div className="min-h-screen">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Page Header */}
          <div className="py-6 md:py-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Settings className="w-3.5 h-3.5" />
              Account
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
              Account Settings
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage your profile and account preferences
            </p>
          </div>

          {loading ? (
            <LoadingState />
          ) : (
            <div className="space-y-6">
              {/* Profile Card */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Edit className="h-5 w-5 text-primary" />
                    Profile Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Feedback Messages */}
                  {error && (
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
                      <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                      <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
                    </div>
                  )}

                  {success && (
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                      <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-sm text-emerald-700 dark:text-emerald-300">{success}</span>
                    </div>
                  )}

                  {/* Avatar Preview */}
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border/50">
                    <Avatar
                      size="xl"
                      src={profile?.avatar_url || undefined}
                      fallback={avatarInitials}
                      alt={formData.display_name || formData.username || 'User'}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {formData.display_name || formData.username || 'Your Name'}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        @{formData.username || 'username'}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Username Field */}
                  <div className="space-y-1.5">
                    <label htmlFor="username" className="block text-sm font-medium text-foreground">
                      Username <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="text"
                        id="username"
                        value={formData.username}
                        onChange={(e) => handleInputChange('username', e.target.value)}
                        placeholder="Enter your username"
                        disabled={saving}
                        className="pl-10"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      3-50 characters. Letters, numbers, underscores, and hyphens only.
                    </p>
                  </div>

                  {/* Display Name Field */}
                  <div className="space-y-1.5">
                    <label htmlFor="display_name" className="block text-sm font-medium text-foreground">
                      Display Name
                      <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="text"
                        id="display_name"
                        value={formData.display_name}
                        onChange={(e) => handleInputChange('display_name', e.target.value)}
                        placeholder="How your name appears to others"
                        disabled={saving}
                        className="pl-10"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      How your name appears to other users. Max 100 characters.
                    </p>
                  </div>

                  {/* Bio Field */}
                  <div className="space-y-1.5">
                    <label htmlFor="bio" className="block text-sm font-medium text-foreground">
                      Bio
                      <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                    </label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <Textarea
                        id="bio"
                        value={formData.bio}
                        onChange={(e) => handleInputChange('bio', e.target.value)}
                        rows={4}
                        placeholder="Tell others about yourself..."
                        disabled={saving}
                        className="pl-10"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Max 500 characters.
                      </p>
                      <p className={`text-xs ${formData.bio.length > 450 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                        {formData.bio.length}/500
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Save Button */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {hasChanges ? (
                        <>
                          <div className="w-2 h-2 rounded-full bg-amber-500" />
                          Unsaved changes
                        </>
                      ) : (
                        <>
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          All changes saved
                        </>
                      )}
                    </div>
                    <Button
                      onClick={handleSave}
                      disabled={!hasChanges || saving}
                      className="h-10"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Account Info Card */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    Account Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</h4>
                        <p className="text-sm text-foreground mt-0.5 truncate">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Account Created</h4>
                        <p className="text-sm text-foreground mt-0.5">
                          {profile ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Loading...'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Updated</h4>
                        <p className="text-sm text-foreground mt-0.5">
                          {profile ? new Date(profile.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Loading...'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Hash className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">User ID</h4>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{user.id}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}