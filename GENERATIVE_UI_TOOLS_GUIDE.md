# Generative UI Tools Guide - Mob Translate

## Complete Process for Building Generative UI Tools with Next.js App Router

This guide documents the repeatable process for building generative UI tools in the Mob Translate app using Next.js App Router patterns, TypeScript, and our component library.

## Architecture Overview

Our generative UI system consists of:
1. **Data Schema** - TypeScript interfaces for type safety
2. **API Routes** - Next.js API routes with Supabase integration
3. **UI Components** - Reusable React components with Tailwind CSS
4. **SWR Integration** - Data fetching with optimistic updates
5. **Component Composition** - Modular cards, stats, and interactive elements

## Step-by-Step Implementation Process

### 1. Define TypeScript Interfaces

Create interfaces in the component file or a separate types file:

```typescript
// In /apps/web/types/[feature].ts or at top of component file
export interface [FeatureName]Data {
  id: string;
  // Core fields
  title: string;
  description: string;
  
  // Statistics
  stats?: {
    total: number;
    accuracy: number;
    attempts: number;
    // ... comprehensive stats
  };
  
  // Metadata
  metadata?: {
    createdAt: string;
    updatedAt: string;
    tags?: string[];
    category?: string;
  };
  
  // Rich content
  details?: {
    summary: string;
    highlights: string[];
    tips?: string[];
    variations?: Array<{
      name: string;
      description: string;
    }>;
  };
}

export interface [FeatureName]Response {
  success: boolean;
  data?: [FeatureName]Data;
  error?: string;
}
```

**Key Principles:**
- Use TypeScript interfaces (not Zod) for type safety
- Make fields optional with `?` for flexibility
- Group related fields into nested objects
- Include comprehensive fields for rich UI

### 2. Create API Route

In `/apps/web/app/api/v2/[feature]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  
  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // Extract parameters
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('param');
    
    // Fetch data from Supabase
    const { data, error } = await supabase
      .from('[table_name]')
      .select(`
        *,
        related_table(*)
      `)
      .eq('user_id', user.id);
    
    if (error) {
      console.error('Error fetching data:', error);
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
    
    // Process and enrich data
    const enrichedData = data.map(item => ({
      ...item,
      stats: calculateStats(item),
      metadata: {
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }
    }));
    
    return NextResponse.json({
      success: true,
      data: enrichedData
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  
  try {
    const body = await request.json();
    
    // Validate input
    if (!body.requiredField) {
      return NextResponse.json({ error: 'Missing required field' }, { status: 400 });
    }
    
    // Insert/update data
    const { data, error } = await supabase
      .from('[table_name]')
      .insert({
        user_id: user.id,
        ...body
      })
      .select()
      .single();
    
    if (error) {
      console.error('Insert error:', error);
      return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      data
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Key Principles:**
- Always check authentication first
- Use Supabase client for database operations
- Include comprehensive error handling
- Return consistent response format
- Log errors for debugging
- Use proper HTTP status codes

### 3. Create SWR Hook

In `/apps/web/hooks/useApi.ts`, add:

```typescript
import useSWR, { SWRConfiguration } from 'swr';
import { useAuth } from '@/contexts/AuthContext';

// Hook for [feature] data
export function use[FeatureName](params?: { [key: string]: any }) {
  const queryString = params ? `?${new URLSearchParams(params).toString()}` : '';
  
  return useApi(`/api/v2/[feature]${queryString}`, {
    refreshInterval: 60000, // Refresh every minute
    revalidateOnFocus: true
  });
}

// Hook with optimistic updates
export function use[FeatureName]Mutation() {
  const { mutate } = useSWR('/api/v2/[feature]');
  
  const create[FeatureName] = async (data: any) => {
    // Optimistic update
    mutate((current: any) => ({
      ...current,
      data: [...(current?.data || []), { ...data, id: 'temp-' + Date.now() }]
    }), false);
    
    try {
      const response = await fetch('/api/v2/[feature]', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) throw new Error('Failed to create');
      
      const result = await response.json();
      mutate(); // Revalidate
      return result;
      
    } catch (error) {
      mutate(); // Revert on error
      throw error;
    }
  };
  
  return { create[FeatureName] };
}
```

### 4. Create Reusable UI Components

Create modular components in `/apps/web/components/[feature]/`:

```typescript
// [FeatureName]Card.tsx
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@ui/components';
import { cn } from '@/app/lib/utils';
import { Heart, TrendingUp, Clock, Award } from 'lucide-react';
import type { [FeatureName]Data } from '@/types/[feature]';

interface [FeatureName]CardProps {
  data: [FeatureName]Data;
  onAction?: (id: string, action: string) => Promise<void>;
  className?: string;
  variant?: 'default' | 'compact';
}

export function [FeatureName]Card({ 
  data, 
  onAction, 
  className,
  variant = 'default' 
}: [FeatureName]CardProps) {
  const [isLoading, setIsLoading] = useState(false);
  
  const handleAction = async (action: string) => {
    if (!onAction || isLoading) return;
    
    setIsLoading(true);
    try {
      await onAction(data.id, action);
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (variant === 'compact') {
    return (
      <Card className={cn(
        "hover:shadow-lg transition-all hover-lift",
        className
      )}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium truncate">{data.title}</h3>
            <button
              onClick={() => handleAction('like')}
              disabled={isLoading}
              className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            >
              <Heart className="h-4 w-4" />
            </button>
          </div>
          {data.stats && (
            <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {data.stats.accuracy}%
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {data.stats.attempts}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className={cn(
      "hover:shadow-xl transition-all hover-lift",
      className
    )}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{data.title}</span>
          <Badge variant="outline">
            <Award className="h-3 w-3 mr-1" />
            {data.metadata?.category || 'General'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-gray-600">{data.description}</p>
        
        {data.stats && (
          <StatsDisplay stats={data.stats} />
        )}
        
        {data.details?.highlights && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Highlights</h4>
            <ul className="list-disc list-inside space-y-1">
              {data.details.highlights.map((highlight, index) => (
                <li key={index} className="text-sm text-gray-600">{highlight}</li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="flex gap-2 pt-4">
          <button
            onClick={() => handleAction('like')}
            disabled={isLoading}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
              "bg-gray-100 hover:bg-gray-200",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
          >
            <Heart className="h-4 w-4" />
            Like
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// Sub-component for stats
function StatsDisplay({ stats }: { stats: any }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="text-center p-3 bg-gray-50 rounded-lg">
        <div className="text-2xl font-bold">{stats.total}</div>
        <div className="text-xs text-gray-600">Total</div>
      </div>
      <div className="text-center p-3 bg-green-50 rounded-lg">
        <div className="text-2xl font-bold text-green-600">{stats.accuracy}%</div>
        <div className="text-xs text-gray-600">Accuracy</div>
      </div>
      <div className="text-center p-3 bg-blue-50 rounded-lg">
        <div className="text-2xl font-bold text-blue-600">{stats.attempts}</div>
        <div className="text-xs text-gray-600">Attempts</div>
      </div>
    </div>
  );
}
```

**Key Principles:**
- Keep components under 150 lines
- Use composition with sub-components
- Support multiple variants (default, compact)
- Include loading and error states
- Use our animation classes (hover-lift, animate-slide-in)
- Make components fully typed with TypeScript

### 5. Create Loading Skeletons

Add to `/apps/web/components/loading/Skeleton.tsx`:

```typescript
export function [FeatureName]Skeleton({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <div className="bg-white rounded-lg border p-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-5 bg-gray-200 rounded w-2/3" />
          <div className="h-8 w-8 bg-gray-200 rounded-full" />
        </div>
        <div className="mt-2 flex gap-4">
          <div className="h-4 bg-gray-200 rounded w-16" />
          <div className="h-4 bg-gray-200 rounded w-16" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-xl border animate-pulse">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 bg-gray-200 rounded w-1/2" />
          <div className="h-6 bg-gray-200 rounded-full w-20" />
        </div>
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="grid grid-cols-3 gap-4 mt-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 6. Implement in Pages

Use in pages with SWR:

```typescript
// /apps/web/app/[feature]/page.tsx
'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { use[FeatureName] } from '@/hooks/useApi';
import { [FeatureName]Card } from '@/components/[feature]/[FeatureName]Card';
import { [FeatureName]Skeleton } from '@/components/loading/Skeleton';
import { PageHeader, Section, Button } from '@ui/components';
import { Filter, Plus } from 'lucide-react';

export default function [FeatureName]Page() {
  const { user, loading: authLoading } = useAuth();
  const [filter, setFilter] = useState('all');
  const { data, error, isLoading } = use[FeatureName]({ filter });
  
  React.useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading]);
  
  if (!user || authLoading) return null;
  
  const handleAction = async (id: string, action: string) => {
    try {
      await fetch(`/api/v2/[feature]/${id}/${action}`, {
        method: 'POST',
      });
      // SWR will auto-revalidate
    } catch (error) {
      console.error('Action failed:', error);
    }
  };
  
  return (
    <SharedLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <PageHeader
            title="[Feature Name]"
            description="Manage your [feature]"
            badge={
              data?.length ? (
                <Badge variant="default" className="ml-2 animate-scale-in">
                  {data.length} items
                </Badge>
              ) : null
            }
          />
          
          {/* Filters */}
          <div className="mt-6 flex gap-2 animate-slide-in">
            {['all', 'active', 'archived'].map((f) => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f)}
                className="hover-grow"
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
          
          {/* Content */}
          {isLoading ? (
            <Section className="mt-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <[FeatureName]Skeleton key={i} variant="compact" />
                ))}
              </div>
            </Section>
          ) : error ? (
            <Section className="mt-8">
              <div className="text-center py-12">
                <p className="text-red-600">Failed to load data</p>
                <Button onClick={() => window.location.reload()} className="mt-4">
                  Retry
                </Button>
              </div>
            </Section>
          ) : data && data.length > 0 ? (
            <Section className="mt-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.map((item, index) => (
                  <div 
                    key={item.id} 
                    className="animate-slide-in" 
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <[FeatureName]Card
                      data={item}
                      onAction={handleAction}
                      variant="compact"
                    />
                  </div>
                ))}
              </div>
            </Section>
          ) : (
            <Section className="mt-8">
              <div className="text-center py-12 bg-white rounded-xl border">
                <Plus className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No [feature] yet</h3>
                <p className="text-gray-600 mb-4">Get started by creating your first [feature]</p>
                <Button className="hover-grow">
                  <Plus className="h-4 w-4 mr-2" />
                  Create [Feature]
                </Button>
              </div>
            </Section>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}
```

## Best Practices

### TypeScript & Interfaces
- **Type Everything**: Use interfaces for all data structures
- **Optional Fields**: Use `?` for fields that might not exist
- **Export Types**: Export interfaces for reuse across components
- **Strict Mode**: Enable strict TypeScript checking

### API Design
- **RESTful Routes**: Follow REST conventions (GET, POST, PUT, DELETE)
- **Authentication**: Always check auth first
- **Error Handling**: Return consistent error formats with proper status codes
- **Logging**: Log errors with context for debugging
- **Validation**: Validate inputs before database operations

### Component Architecture
- **Modular Design**: Break large components into smaller ones
- **Composition**: Use component composition over inheritance
- **Variants**: Support multiple display variants
- **Accessibility**: Include proper ARIA labels and semantic HTML
- **Performance**: Use React.memo for expensive components

### State Management
- **SWR for Data**: Use SWR for all data fetching
- **Optimistic Updates**: Update UI immediately, rollback on error
- **Loading States**: Always show loading skeletons
- **Error Boundaries**: Handle errors gracefully
- **Cache Invalidation**: Use mutate to refresh data

### Styling
- **Tailwind Classes**: Use utility classes consistently
- **Animation Classes**: Use our custom animation classes
- **Responsive Design**: Mobile-first approach
- **Dark Mode**: Support dark mode with proper classes
- **Consistent Spacing**: Follow 4/8px grid system

## Implementation Checklist

- [ ] Define TypeScript interfaces with comprehensive fields
- [ ] Create API routes with proper error handling
- [ ] Add SWR hooks for data fetching
- [ ] Build modular UI components with variants
- [ ] Create loading skeletons
- [ ] Implement in pages with proper auth checks
- [ ] Add animations and transitions
- [ ] Test error states and edge cases
- [ ] Ensure mobile responsiveness
- [ ] Add proper TypeScript types throughout

## Common Patterns

### Data Fetching Pattern
```typescript
const { data, error, isLoading } = use[Feature]();

if (isLoading) return <Skeleton />;
if (error) return <ErrorState />;
if (!data) return <EmptyState />;
return <Content data={data} />;
```

### Optimistic Update Pattern
```typescript
// Optimistic update
mutate(newData, false);

// Make API call
try {
  await apiCall();
  mutate(); // Revalidate
} catch {
  mutate(); // Rollback
}
```

### Animation Pattern
```typescript
<div 
  className="animate-slide-in" 
  style={{ animationDelay: `${index * 50}ms` }}
>
  <Component />
</div>
```

## Extending the System

To add new features:
1. Start with TypeScript interfaces
2. Create API routes with Supabase
3. Add SWR hooks for data management
4. Build reusable components
5. Implement loading and error states
6. Add to navigation if needed
7. Test across devices
8. Document in this guide

This process ensures consistency across the Mob Translate codebase while providing excellent user experience with modern React patterns.