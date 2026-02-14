import Link from 'next/link';
import SharedLayout from './components/SharedLayout';
import { Search, Home, BookOpen } from 'lucide-react';

export default function NotFound() {
  return (
    <SharedLayout>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-8xl sm:text-9xl font-display font-black text-primary/20 mb-4 select-none">
          404
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold mb-3">
          Lost in Translation
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto mb-8">
          The page you&apos;re looking for doesn&apos;t exist. But there are
          thousands of words waiting to be discovered.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors">
            <Home className="w-4 h-4" />
            Go Home
          </Link>
          <Link href="/dictionaries" className="inline-flex items-center gap-2 px-5 py-2.5 border border-border font-medium rounded-lg hover:bg-muted/50 transition-colors">
            <BookOpen className="w-4 h-4" />
            Browse Dictionaries
          </Link>
        </div>
      </div>
    </SharedLayout>
  );
}
