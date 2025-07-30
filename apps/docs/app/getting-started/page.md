# Getting Started

This guide will help you set up MobTranslate for development on your local machine.

{% callout type="info" title="Before You Begin" %}
This guide assumes you have basic knowledge of Node.js and Git. If you're new to these tools, we recommend checking out their official documentation first.
{% /callout %}

## Prerequisites

Before you begin, ensure you have the following installed:

- Node.js v22 or later
- pnpm v7.15.0 or later  
- Git
- A Supabase account (free tier works)
- An OpenAI API key for AI features

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/australia/mobtranslate.com.git
cd mobtranslate.com
```

### 2. Install Dependencies

We use pnpm for package management:

```bash
pnpm install
```

### 3. Environment Variables

Copy the example environment file:

```bash
cp apps/web/.env.example apps/web/.env
```

Then edit `apps/web/.env` with your credentials.

### 4. Start Development Server

From the root directory:

```bash
pnpm dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).