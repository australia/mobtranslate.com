import SharedLayout from '../../components/SharedLayout';
import { BookOpen } from 'lucide-react';

export default function DictionaryLoading() {
  return (
    <SharedLayout>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-border" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-muted-foreground" />
            </div>
          </div>
          <p className="text-lg text-muted-foreground">Loading dictionary...</p>
        </div>
      </div>
    </SharedLayout>
  );
}
