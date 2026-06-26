import { redirect } from 'next/navigation';

// The contributions tracker now lives at /voice ("Your Voice").
export default function ContributionsRedirect() {
  redirect('/voice');
}
