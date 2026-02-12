'use client';
import { Avatar, Separator, Progress } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

export default function DataDisplayPatternPage() {
  const users = [
    { name: 'Alice Johnson', email: 'alice@example.com', role: 'Admin' },
    { name: 'Bob Smith', email: 'bob@example.com', role: 'Editor' },
    { name: 'Carol White', email: 'carol@example.com', role: 'Viewer' },
  ];
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Data Display Patterns</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Patterns for displaying data and lists.</p>
      <Section title="User List">
        <ComponentPreview>
          <div className="space-y-0">
            {users.map((user, i) => (
              <div key={user.email}>
                <div className="flex items-center gap-3 py-3">
                  <Avatar fallback={user.name[0]} />
                  <div className="flex-1">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">{user.email}</p>
                  </div>
                  <span className="text-xs bg-[var(--color-muted)] px-2 py-1 rounded">{user.role}</span>
                </div>
                {i < users.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </ComponentPreview>
      </Section>
      <Section title="Stats with Progress">
        <ComponentPreview>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[{ label: 'Storage', value: 75 }, { label: 'Bandwidth', value: 45 }, { label: 'API Calls', value: 90 }].map(stat => (
              <div key={stat.label} className="border-2 border-[var(--color-border)] rounded-lg p-4">
                <p className="text-sm text-[var(--color-muted-foreground)]">{stat.label}</p>
                <p className="text-2xl font-bold mb-2">{stat.value}%</p>
                <Progress value={stat.value} />
              </div>
            ))}
          </div>
        </ComponentPreview>
      </Section>
    </div>
  );
}
