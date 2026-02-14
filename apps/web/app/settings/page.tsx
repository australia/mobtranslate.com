'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import SharedLayout from '../components/SharedLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Section } from '@/components/layout/Section';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Textarea } from '@mobtranslate/ui';
import { LoadingState } from '@/components/layout/LoadingState';
import { User, Save, AlertCircle, CheckCircle, Edit } from 'lucide-react';

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
      <div className="min-h-screen bg-muted">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <PageHeader
            title="Account Settings"
            description="Manage your profile and account preferences"
            badge={
              <div className="flex items-center ml-2 bg-white bg-opacity-20 rounded-full px-3 py-1">
                <User className="h-3 w-3 mr-1" />
                <span className="text-sm font-medium">{profile?.username || 'Loading...'}</span>
              </div>
            }
          />

          {loading ? (
            <LoadingState />
          ) : (
            <Section className="mt-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Edit className="h-5 w-5 mr-2 text-primary" />
                    Profile Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Error/Success Messages */}
                  {error && (
                    <div className="flex items-center p-4 bg-error/10 border border-error/20 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-error mr-3" />
                      <span className="text-error">{error}</span>
                    </div>
                  )}
                  
                  {success && (
                    <div className="flex items-center p-4 bg-success/10 border border-success/20 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-success mr-3" />
                      <span className="text-success">{success}</span>
                    </div>
                  )}

                  {/* Username Field */}
                  <div className="space-y-2">
                    <label htmlFor="username" className="block text-sm font-medium text-muted-foreground">
                      Username *
                    </label>
                    <Input
                      type="text"
                      id="username"
                      value={formData.username}
                      onChange={(e) => handleInputChange('username', e.target.value)}
                      placeholder="Enter your username"
                      disabled={saving}
                    />
                    <p className="text-xs text-muted-foreground">
                      3-50 characters. Letters, numbers, underscores, and hyphens only.
                    </p>
                  </div>

                  {/* Display Name Field */}
                  <div className="space-y-2">
                    <label htmlFor="display_name" className="block text-sm font-medium text-muted-foreground">
                      Display Name
                    </label>
                    <Input
                      type="text"
                      id="display_name"
                      value={formData.display_name}
                      onChange={(e) => handleInputChange('display_name', e.target.value)}
                      placeholder="Enter your display name (optional)"
                      disabled={saving}
                    />
                    <p className="text-xs text-muted-foreground">
                      Optional. How your name appears to other users. Max 100 characters.
                    </p>
                  </div>

                  {/* Bio Field */}
                  <div className="space-y-2">
                    <label htmlFor="bio" className="block text-sm font-medium text-muted-foreground">
                      Bio
                    </label>
                    <Textarea
                      id="bio"
                      value={formData.bio}
                      onChange={(e) => handleInputChange('bio', e.target.value)}
                      rows={4}
                      placeholder="Tell others about yourself (optional)"
                      disabled={saving}
                    />
                    <p className="text-xs text-muted-foreground">
                      Optional. Max 500 characters. ({formData.bio.length}/500)
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      {hasChanges ? 'You have unsaved changes' : 'All changes saved'}
                    </div>
                    <Button
                      onClick={handleSave}
                      disabled={!hasChanges || saving}
                      className="flex items-center"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Account Info */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Account Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">Email</h4>
                      <p className="text-sm text-foreground">{user.email}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">Account Created</h4>
                      <p className="text-sm text-foreground">
                        {profile ? new Date(profile.created_at).toLocaleDateString() : 'Loading...'}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">Last Updated</h4>
                      <p className="text-sm text-foreground">
                        {profile ? new Date(profile.updated_at).toLocaleDateString() : 'Loading...'}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">User ID</h4>
                      <p className="text-xs text-muted-foreground font-mono">{user.id}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Section>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}