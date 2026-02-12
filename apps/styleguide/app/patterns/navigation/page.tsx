'use client';
import { Tabs, TabsList, TabsTrigger, TabsContent, Menubar, Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

export default function NavigationPatternPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Navigation Patterns</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Navigation pattern examples.</p>
      <Section title="Tab Navigation">
        <ComponentPreview>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="overview"><p className="p-4">Overview content</p></TabsContent>
            <TabsContent value="analytics"><p className="p-4">Analytics content</p></TabsContent>
            <TabsContent value="reports"><p className="p-4">Reports content</p></TabsContent>
            <TabsContent value="settings"><p className="p-4">Settings content</p></TabsContent>
          </Tabs>
        </ComponentPreview>
      </Section>
      <Section title="Menubar Navigation">
        <ComponentPreview>
          <Menubar>
            <Button variant="ghost" size="sm">File</Button>
            <Button variant="ghost" size="sm">Edit</Button>
            <Button variant="ghost" size="sm">View</Button>
            <Button variant="ghost" size="sm">Help</Button>
          </Menubar>
        </ComponentPreview>
      </Section>
    </div>
  );
}
