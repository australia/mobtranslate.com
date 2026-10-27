import { SignInForm } from '@/components/auth/SignInForm'
import { privatePage } from '@/lib/seo';

export const metadata = privatePage('Sign in');

export default function SignInPage() {
  return <SignInForm />
}