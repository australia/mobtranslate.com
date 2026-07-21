import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModernNav } from '@/components/navigation/ModernNav';

const push = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    signOut: vi.fn(),
    loading: false,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('ModernNav guest actions', () => {
  beforeEach(() => push.mockClear());

  it('renders semantic links without nested or empty interactive elements', () => {
    const { container } = render(<ModernNav />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth/signin',
    );
    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute(
      'href',
      '/auth/signup',
    );
    expect(container.querySelector('a button, button a')).toBeNull();
    expect(container.querySelector('a:empty')).toBeNull();
  });
});
