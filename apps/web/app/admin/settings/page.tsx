'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Label } from '@/app/components/ui/label';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { useToast } from '@/app/components/ui/use-toast';
import { 
  Settings, 
  Globe, 
  Shield, 
  Bell, 
  Database,
  Mail,
  Key,
  Save,
  RefreshCw
} from 'lucide-react';

interface SystemSettings {
  general: {
    siteName: string;
    siteDescription: string;
    supportEmail: string;
    defaultLanguage: string;
    maintenanceMode: boolean;
  };
  curation: {
    autoApprovalThreshold: number;
    requireEmailVerification: boolean;
    minWordLength: number;
    maxWordLength: number;
    allowAnonymousComments: boolean;
  };
  security: {
    passwordMinLength: number;
    requireStrongPasswords: boolean;
    sessionTimeout: number;
    maxLoginAttempts: number;
    enableTwoFactor: boolean;
  };
  notifications: {
    emailNotifications: boolean;
    newUserNotification: boolean;
    newSubmissionNotification: boolean;
    commentNotification: boolean;
    weeklyReport: boolean;
  };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>({
    general: {
      siteName: 'Mob Translate',
      siteDescription: 'Indigenous Language Translation Platform',
      supportEmail: 'support@mobtranslate.com',
      defaultLanguage: 'en',
      maintenanceMode: false
    },
    curation: {
      autoApprovalThreshold: 5,
      requireEmailVerification: true,
      minWordLength: 2,
      maxWordLength: 50,
      allowAnonymousComments: false
    },
    security: {
      passwordMinLength: 8,
      requireStrongPasswords: true,
      sessionTimeout: 30,
      maxLoginAttempts: 5,
      enableTwoFactor: false
    },
    notifications: {
      emailNotifications: true,
      newUserNotification: true,
      newSubmissionNotification: true,
      commentNotification: true,
      weeklyReport: true
    }
  });
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/v2/admin/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  };

  const handleSaveSettings = async (section: keyof SystemSettings) => {
    setLoading(true);
    try {
      const response = await fetch('/api/v2/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section,
          settings: settings[section]
        })
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Settings saved successfully'
        });
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (section: keyof SystemSettings, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure system-wide settings and preferences
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="curation">Curation</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>
                Basic configuration for your Mob Translate instance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="siteName">Site Name</Label>
                <Input
                  id="siteName"
                  value={settings.general.siteName}
                  onChange={(e) => updateSetting('general', 'siteName', e.target.value)}
                  placeholder="Your site name"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="siteDescription">Site Description</Label>
                <Textarea
                  id="siteDescription"
                  value={settings.general.siteDescription}
                  onChange={(e) => updateSetting('general', 'siteDescription', e.target.value)}
                  placeholder="Brief description of your site"
                  rows={3}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="supportEmail">Support Email</Label>
                <Input
                  id="supportEmail"
                  type="email"
                  value={settings.general.supportEmail}
                  onChange={(e) => updateSetting('general', 'supportEmail', e.target.value)}
                  placeholder="support@example.com"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="defaultLanguage">Default Language</Label>
                <Select 
                  value={settings.general.defaultLanguage}
                  onValueChange={(value) => updateSetting('general', 'defaultLanguage', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="maintenanceMode"
                  checked={settings.general.maintenanceMode}
                  onChange={(e) => updateSetting('general', 'maintenanceMode', e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="maintenanceMode" className="font-normal">
                  Enable maintenance mode
                </Label>
              </div>

              <Button onClick={() => handleSaveSettings('general')} disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                Save General Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="curation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Curation Settings
              </CardTitle>
              <CardDescription>
                Configure content curation rules and thresholds
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="autoApprovalThreshold">
                  Auto-approval Threshold
                  <span className="text-xs text-muted-foreground ml-2">
                    (trusted users with this many approved submissions)
                  </span>
                </Label>
                <Input
                  id="autoApprovalThreshold"
                  type="number"
                  value={settings.curation.autoApprovalThreshold}
                  onChange={(e) => updateSetting('curation', 'autoApprovalThreshold', parseInt(e.target.value))}
                  min={0}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="minWordLength">Minimum Word Length</Label>
                  <Input
                    id="minWordLength"
                    type="number"
                    value={settings.curation.minWordLength}
                    onChange={(e) => updateSetting('curation', 'minWordLength', parseInt(e.target.value))}
                    min={1}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="maxWordLength">Maximum Word Length</Label>
                  <Input
                    id="maxWordLength"
                    type="number"
                    value={settings.curation.maxWordLength}
                    onChange={(e) => updateSetting('curation', 'maxWordLength', parseInt(e.target.value))}
                    min={1}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="requireEmailVerification"
                    checked={settings.curation.requireEmailVerification}
                    onChange={(e) => updateSetting('curation', 'requireEmailVerification', e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="requireEmailVerification" className="font-normal">
                    Require email verification for submissions
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="allowAnonymousComments"
                    checked={settings.curation.allowAnonymousComments}
                    onChange={(e) => updateSetting('curation', 'allowAnonymousComments', e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="allowAnonymousComments" className="font-normal">
                    Allow anonymous comments
                  </Label>
                </div>
              </div>

              <Button onClick={() => handleSaveSettings('curation')} disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                Save Curation Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Configure security policies and authentication rules
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="passwordMinLength">Minimum Password Length</Label>
                <Input
                  id="passwordMinLength"
                  type="number"
                  value={settings.security.passwordMinLength}
                  onChange={(e) => updateSetting('security', 'passwordMinLength', parseInt(e.target.value))}
                  min={6}
                  max={20}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="sessionTimeout">
                    Session Timeout
                    <span className="text-xs text-muted-foreground ml-2">(minutes)</span>
                  </Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={settings.security.sessionTimeout}
                    onChange={(e) => updateSetting('security', 'sessionTimeout', parseInt(e.target.value))}
                    min={5}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="maxLoginAttempts">Max Login Attempts</Label>
                  <Input
                    id="maxLoginAttempts"
                    type="number"
                    value={settings.security.maxLoginAttempts}
                    onChange={(e) => updateSetting('security', 'maxLoginAttempts', parseInt(e.target.value))}
                    min={3}
                    max={10}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="requireStrongPasswords"
                    checked={settings.security.requireStrongPasswords}
                    onChange={(e) => updateSetting('security', 'requireStrongPasswords', e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="requireStrongPasswords" className="font-normal">
                    Require strong passwords (uppercase, lowercase, numbers, symbols)
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="enableTwoFactor"
                    checked={settings.security.enableTwoFactor}
                    onChange={(e) => updateSetting('security', 'enableTwoFactor', e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="enableTwoFactor" className="font-normal">
                    Enable two-factor authentication
                  </Label>
                </div>
              </div>

              <Button onClick={() => handleSaveSettings('security')} disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                Save Security Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Configure email notifications and alerts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="emailNotifications"
                    checked={settings.notifications.emailNotifications}
                    onChange={(e) => updateSetting('notifications', 'emailNotifications', e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="emailNotifications" className="font-normal">
                    Enable email notifications
                  </Label>
                </div>

                {settings.notifications.emailNotifications && (
                  <div className="ml-6 space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="newUserNotification"
                        checked={settings.notifications.newUserNotification}
                        onChange={(e) => updateSetting('notifications', 'newUserNotification', e.target.checked)}
                        className="rounded"
                      />
                      <Label htmlFor="newUserNotification" className="font-normal">
                        New user registrations
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="newSubmissionNotification"
                        checked={settings.notifications.newSubmissionNotification}
                        onChange={(e) => updateSetting('notifications', 'newSubmissionNotification', e.target.checked)}
                        className="rounded"
                      />
                      <Label htmlFor="newSubmissionNotification" className="font-normal">
                        New word submissions
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="commentNotification"
                        checked={settings.notifications.commentNotification}
                        onChange={(e) => updateSetting('notifications', 'commentNotification', e.target.checked)}
                        className="rounded"
                      />
                      <Label htmlFor="commentNotification" className="font-normal">
                        New comments and flagged content
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="weeklyReport"
                        checked={settings.notifications.weeklyReport}
                        onChange={(e) => updateSetting('notifications', 'weeklyReport', e.target.checked)}
                        className="rounded"
                      />
                      <Label htmlFor="weeklyReport" className="font-normal">
                        Weekly activity report
                      </Label>
                    </div>
                  </div>
                )}
              </div>

              <Button onClick={() => handleSaveSettings('notifications')} disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                Save Notification Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* System Actions */}
      <Card>
        <CardHeader>
          <CardTitle>System Actions</CardTitle>
          <CardDescription>
            Perform system maintenance tasks
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Clear Cache
          </Button>
          <Button variant="outline">
            <Database className="h-4 w-4 mr-2" />
            Backup Database
          </Button>
          <Button variant="outline">
            <Key className="h-4 w-4 mr-2" />
            Regenerate API Keys
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}