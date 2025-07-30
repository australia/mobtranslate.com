import Link from 'next/link';
import { Button } from '@/app/components/ui/table';
import SharedLayout from './components/SharedLayout';
import { PageHeader, Section } from '@/app/components/ui/table';

export default function NotFound() {
  return (
    <SharedLayout>
      <PageHeader 
        title="Page Not Found"
        description="The page you're looking for doesn't exist or has been moved."
      />
      
      <Section>
        <div className="text-center space-y-6">
          <div className="text-6xl font-bold text-muted-foreground">404</div>
          
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            We couldn't find the page you're looking for. It might have been removed, 
            had its name changed, or is temporarily unavailable.
          </p>
          
          <div className="flex gap-4 justify-center">
            <Button asChild>
              <Link href="/">Go Home</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dictionaries">Browse Dictionaries</Link>
            </Button>
          </div>
        </div>
      </Section>
    </SharedLayout>
  );
}