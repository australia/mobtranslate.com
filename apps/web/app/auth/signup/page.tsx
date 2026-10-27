import { SignUpForm } from '@/components/auth/SignUpForm'
import { privatePage } from '@/lib/seo';

export const metadata = privatePage('Create an account');

export default function SignUpPage() {
  return <SignUpForm />
}