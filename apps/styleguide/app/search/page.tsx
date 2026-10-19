import { DocumentSearch } from '../../components/document-search';
import { Suspense } from 'react';

export default function SearchPage() {
  return <div>
    <h1 className="text-4xl font-bold mb-2">Search guidance</h1>
    <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Find decisions, specifications, behavior and implementation within the full documentation.</p>
    <Suspense fallback={<p role="status">Preparing guidance search.</p>}><DocumentSearch /></Suspense>
  </div>;
}
