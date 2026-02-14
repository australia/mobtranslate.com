'use client';

import { useState, useEffect } from 'react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger, Input, Textarea, Select, SelectPortal, SelectPositioner, SelectPopup, SelectItem, SelectTrigger, SelectValue, Switch } from '@mobtranslate/ui';
import { useToast } from '@/hooks/useToast';
import {
  Globe,
  Shield,
  Bell,
  Database,
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
        variant: 'error'
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
                <label className="text-sm font-medium" htmlFor="siteName">Site Name</label>
                <Input
                  id="siteName"
                  value={settings.general.siteName}
                  onChange={(e) => updateSetting('general', 'siteName', e.target.value)}
                  placeholder="Your site name"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="siteDescription">Site Description</label>
                <Textarea
                  id="siteDescription"
                  value={settings.general.siteDescription}
                  onChange={(e) => updateSetting('general', 'siteDescription', e.target.value)}
                  placeholder="Brief description of your site"
                  rows={3}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="supportEmail">Support Email</label>
                <Input
                  id="supportEmail"
                  type="email"
                  value={settings.general.supportEmail}
                  onChange={(e) => updateSetting('general', 'supportEmail', e.target.value)}
                  placeholder="support@example.com"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="defaultLanguage">Default Language</label>
                <Select 
                  value={settings.general.defaultLanguage}
                  onValueChange={(value) => value != null && updateSetting('general', 'defaultLanguage', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPortal>
                    <SelectPositioner>
                      <SelectPopup>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                      </SelectPopup>
                    </SelectPositioner>
                  </SelectPortal>
                </Select>
              </div>

              <Switch
                checked={settings.general.maintenanceMode}
                onCheckedChange={(checked) => updateSetting('general', 'maintenanceMode', checked)}
                label="Enable maintenance mode"
              />

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
                <label className="text-sm font-medium" htmlFor="autoApprovalThreshold">
                  Auto-approval Threshold
                  <span className="text-xs text-muted-foreground ml-2">
                    (trusted users with this many approved submissions)
                  </span>
                </label>
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
                  <label className="text-sm font-medium" htmlFor="minWordLength">Minimum Word Length</label>
                  <Input
                    id="minWordLength"
                    type="number"
                    value={settings.curation.minWordLength}
                    onChange={(e) => updateSetting('curation', 'minWordLength', parseInt(e.target.value))}
                    min={1}
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="maxWordLength">Maximum Word Length</label>
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
                <Switch
                  checked={settings.curation.requireEmailVerification}
                  onCheckedChange={(checked) => updateSetting('curation', 'requireEmailVerification', checked)}
                  label="Require email verification for submissions"
                />
                <Switch
                  checked={settings.curation.allowAnonymousComments}
                  onCheckedChange={(checked) => updateSetting('curation', 'allowAnonymousComments', checked)}
                  label="Allow anonymous comments"
                />
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
                <label className="text-sm font-medium" htmlFor="passwordMinLength">Minimum Password Length</label>
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
                  <label className="text-sm font-medium" htmlFor="sessionTimeout">
                    Session Timeout
                    <span className="text-xs text-muted-foreground ml-2">(minutes)</span>
                  </label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={settings.security.sessionTimeout}
                    onChange={(e) => updateSetting('security', 'sessionTimeout', parseInt(e.target.value))}
                    min={5}
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="maxLoginAttempts">Max Login Attempts</label>
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
                <Switch
                  checked={settings.security.requireStrongPasswords}
                  onCheckedChange={(checked) => updateSetting('security', 'requireStrongPasswords', checked)}
                  label="Require strong passwords (uppercase, lowercase, numbers, symbols)"
                />
                <Switch
                  checked={settings.security.enableTwoFactor}
                  onCheckedChange={(checked) => updateSetting('security', 'enableTwoFactor', checked)}
                  label="Enable two-factor authentication"
                />
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
                <Switch
                  checked={settings.notifications.emailNotifications}
                  onCheckedChange={(checked) => updateSetting('notifications', 'emailNotifications', checked)}
                  label="Enable email notifications"
                />

                {settings.notifications.emailNotifications && (
                  <div className="ml-6 space-y-2">
                    <Switch
                      checked={settings.notifications.newUserNotification}
                      onCheckedChange={(checked) => updateSetting('notifications', 'newUserNotification', checked)}
                      label="New user registrations"
                    />
                    <Switch
                      checked={settings.notifications.newSubmissionNotification}
                      onCheckedChange={(checked) => updateSetting('notifications', 'newSubmissionNotification', checked)}
                      label="New word submissions"
                    />
                    <Switch
                      checked={settings.notifications.commentNotification}
                      onCheckedChange={(checked) => updateSetting('notifications', 'commentNotification', checked)}
                      label="New comments and flagged content"
                    />
                    <Switch
                      checked={settings.notifications.weeklyReport}
                      onCheckedChange={(checked) => updateSetting('notifications', 'weeklyReport', checked)}
                      label="Weekly activity report"
                    />
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