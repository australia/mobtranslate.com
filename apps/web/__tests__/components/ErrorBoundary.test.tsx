import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @mobtranslate/ui
vi.mock('@mobtranslate/ui', () => ({
  Alert: ({ children, variant }: any) => <div data-variant={variant} role="alert">{children}</div>,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  AlertTriangle: (props: any) => <span data-icon="AlertTriangle" {...props} />,
}));

import ErrorBoundary from '@/app/components/ErrorBoundary';

// A component that throws on render
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Child content rendered successfully</div>;
}

// A component that throws with a custom message
function ThrowingWithMessage({ message }: { message: string }) {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress React error boundary console errors in test output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders multiple children normally', () => {
    render(
      <ErrorBoundary>
        <div>First child</div>
        <div>Second child</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('First child')).toBeInTheDocument();
    expect(screen.getByText('Second child')).toBeInTheDocument();
  });

  it('catches error and shows default fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('displays the error message from the thrown error', () => {
    render(
      <ErrorBoundary>
        <ThrowingWithMessage message="Custom failure reason" />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom failure reason')).toBeInTheDocument();
  });

  it('shows an Alert with error variant in default fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-variant', 'error');
  });

  it('renders the AlertTriangle icon in default fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert').querySelector('[data-icon="AlertTriangle"]')).toBeInTheDocument();
  });

  it('resets error state when Try again button is clicked', () => {
    // Use a component whose throw behavior can be controlled
    let shouldThrow = true;

    function ConditionalThrower() {
      if (shouldThrow) {
        throw new Error('Temporary error');
      }
      return <div>Recovered content</div>;
    }

    render(
      <ErrorBoundary>
        <ConditionalThrower />
      </ErrorBoundary>
    );

    // Error is shown
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Fix the error condition
    shouldThrow = false;

    // Click Try again
    fireEvent.click(screen.getByText('Try again'));

    // After reset, children should re-render
    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('uses custom fallback component when provided', () => {
    const CustomFallback = ({ error, reset }: { error: Error; reset: () => void }) => (
      <div>
        <p>Custom error: {error.message}</p>
        <button onClick={reset}>Custom reset</button>
      </div>
    );

    render(
      <ErrorBoundary fallback={CustomFallback}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error: Test error message')).toBeInTheDocument();
    expect(screen.getByText('Custom reset')).toBeInTheDocument();
    // Default fallback should not appear
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('passes reset function to custom fallback that works', () => {
    let shouldThrow = true;

    function ConditionalThrower() {
      if (shouldThrow) {
        throw new Error('Will recover');
      }
      return <div>Back to normal</div>;
    }

    const CustomFallback = ({ error, reset }: { error: Error; reset: () => void }) => (
      <div>
        <p>Error: {error.message}</p>
        <button onClick={reset}>Retry</button>
      </div>
    );

    render(
      <ErrorBoundary fallback={CustomFallback}>
        <ConditionalThrower />
      </ErrorBoundary>
    );

    expect(screen.getByText('Error: Will recover')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText('Retry'));

    expect(screen.getByText('Back to normal')).toBeInTheDocument();
  });

  it('calls componentDidCatch and logs the error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'ErrorBoundary caught an error:',
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  it('does not show output section when children render fine', () => {
    render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>
    );

    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(screen.queryByText('Try again')).not.toBeInTheDocument();
  });
});
