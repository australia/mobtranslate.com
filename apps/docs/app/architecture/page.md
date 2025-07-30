# Architecture

MobTranslate is built with a modern, scalable architecture designed to preserve and share indigenous languages effectively.

## Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety across the application
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Accessible component primitives
- **SWR** - Data fetching and caching

### Backend
- **Supabase** - PostgreSQL database with real-time subscriptions
- **Edge Functions** - Serverless compute for API logic
- **Row Level Security (RLS)** - Fine-grained access control

### Infrastructure
- **Vercel** - Hosting and edge deployment
- **Turborepo** - Monorepo management
- **GitHub Actions** - CI/CD pipeline

## System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Web Client    │────▶│   API Routes    │────▶│    Supabase     │
│   (Next.js)     │     │   (Next.js)     │     │   (PostgreSQL)  │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                        │
         │                       │                        │
         ▼                       ▼                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│     Vercel      │     │  Edge Functions │     │   File Storage  │
│     (CDN)       │     │   (Supabase)    │     │   (Supabase)    │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Database Schema

### Core Tables

#### Languages
```sql
CREATE TABLE languages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  region TEXT,
  status TEXT CHECK (status IN ('low-volume', 'very-low-volume')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Words
```sql
CREATE TABLE words (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  language_id UUID REFERENCES languages(id) ON DELETE CASCADE,
  original TEXT NOT NULL,
  translation TEXT NOT NULL,
  pronunciation TEXT,
  part_of_speech TEXT,
  audio_url TEXT,
  example_sentence TEXT,
  example_translation TEXT,
  cultural_significance TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### User Profiles
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Relational Tables

#### Curators
Links users to languages they can curate:
```sql
CREATE TABLE curators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  language_id UUID REFERENCES languages(id),
  permissions JSONB DEFAULT '{"can_edit": true, "can_approve": true}',
  UNIQUE(user_id, language_id)
);
```

#### User Progress
Tracks learning progress:
```sql
CREATE TABLE user_progress (
  user_id UUID REFERENCES profiles(id),
  word_id UUID REFERENCES words(id),
  learned BOOLEAN DEFAULT FALSE,
  practice_count INTEGER DEFAULT 0,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, word_id)
);
```

## Security Model

### Row Level Security (RLS)

All tables use RLS policies for secure data access:

```sql
-- Public read access to languages
CREATE POLICY "Languages are viewable by everyone"
  ON languages FOR SELECT
  USING (true);

-- Only admins can modify languages
CREATE POLICY "Only admins can modify languages"
  ON languages FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- Curators can modify their assigned languages
CREATE POLICY "Curators can modify their languages"
  ON words FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM curators
      WHERE curators.user_id = auth.uid()
      AND curators.language_id = words.language_id
    )
  );
```

### Authentication Flow

1. User signs up/logs in via Supabase Auth
2. JWT token issued with user role and permissions
3. Client includes token in API requests
4. RLS policies enforce access control at database level

## API Design

### RESTful Principles

- Resources are nouns (languages, words, phrases)
- HTTP methods define actions (GET, POST, PUT, DELETE)
- Consistent URL patterns: `/api/v2/{resource}/{id}/{subresource}`
- JSON request/response format

### Versioning Strategy

- URL-based versioning: `/api/v2/...`
- Backward compatibility maintained for 6 months
- Deprecation notices in headers
- Migration guides for breaking changes

## Performance Optimization

### Database

1. **Indexes**: Optimized for common queries
   ```sql
   CREATE INDEX idx_words_language_id ON words(language_id);
   CREATE INDEX idx_words_search ON words USING gin(to_tsvector('english', original || ' ' || translation));
   ```

2. **Materialized Views**: For expensive aggregations
   ```sql
   CREATE MATERIALIZED VIEW language_stats AS
   SELECT 
     language_id,
     COUNT(*) as word_count,
     COUNT(DISTINCT part_of_speech) as pos_count
   FROM words
   GROUP BY language_id;
   ```

3. **Connection Pooling**: Via Supabase connection pooler

### Frontend

1. **Static Generation**: Homepage and language pages
2. **Incremental Static Regeneration**: Updates every 60 seconds
3. **Image Optimization**: Next.js Image component
4. **Code Splitting**: Automatic with Next.js
5. **SWR Caching**: Smart data fetching with stale-while-revalidate

### Caching Strategy

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser   │────▶│   Vercel     │────▶│   Supabase  │
│   Cache     │     │   Edge Cache │     │   Cache     │
└─────────────┘     └──────────────┘     └─────────────┘
    1 hour              5 minutes            Real-time
```

## Scalability

### Horizontal Scaling

- **Frontend**: Vercel automatically scales
- **API**: Serverless functions scale on demand
- **Database**: Supabase handles connection pooling
- **Storage**: S3-compatible object storage

### Data Partitioning

For large datasets:
- Words partitioned by language_id
- User data sharded by user_id
- Time-series data partitioned by month

## Monitoring & Observability

### Metrics

- **Application**: Vercel Analytics
- **Database**: Supabase Dashboard
- **Errors**: Sentry integration
- **Uptime**: Better Uptime monitoring

### Logging

Structured logging with correlation IDs:
```typescript
logger.info('Word created', {
  correlationId: req.headers['x-correlation-id'],
  userId: user.id,
  wordId: word.id,
  languageId: language.id
});
```

## Development Workflow

### Local Development

```bash
# Start all services
pnpm dev

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

### CI/CD Pipeline

1. **Pull Request**
   - Run tests
   - Type checking
   - Linting
   - Build verification

2. **Main Branch**
   - Deploy to staging
   - Run E2E tests
   - Deploy to production

### Database Migrations

Using Supabase migrations:
```bash
# Create new migration
supabase migration new add_cultural_notes

# Apply migrations
supabase db push

# Generate types
supabase gen types typescript
```

## Disaster Recovery

### Backup Strategy

- **Database**: Daily automated backups (30-day retention)
- **Files**: S3 versioning enabled
- **Code**: Git history + GitHub backups

### Recovery Time Objectives

- **RTO**: < 4 hours
- **RPO**: < 1 hour

## Future Considerations

### Planned Improvements

1. **GraphQL API**: For more flexible data fetching
2. **Mobile Apps**: React Native implementation
3. **Offline Support**: PWA with service workers
4. **AI Features**: Enhanced pronunciation guides
5. **Real-time Collaboration**: Live editing for curators

### Scaling Considerations

1. **CDN**: CloudFront for global distribution
2. **Read Replicas**: For heavy read workloads
3. **Queue System**: For async processing
4. **Microservices**: Extract heavy services

## Contributing

See our [Contributing Guide](/contributing) for details on:
- Architecture decisions
- Code standards
- Testing requirements
- Review process