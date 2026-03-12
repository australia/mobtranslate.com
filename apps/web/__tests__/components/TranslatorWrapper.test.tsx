import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock react-markdown
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown-output">{children}</div>,
}));

// Mock @mobtranslate/ui
vi.mock('@mobtranslate/ui', () => {
  const Textarea = React.forwardRef(({ ...props }: any, ref: any) => <textarea ref={ref} {...props} />);
  Textarea.displayName = 'Textarea';
  return {
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    Textarea,
  };
});

// Mock lucide-react
vi.mock('lucide-react', () => ({
  ArrowRight: (props: any) => <span data-icon="ArrowRight" {...props} />,
  Globe: (props: any) => <span data-icon="Globe" {...props} />,
  Loader2: (props: any) => <span data-icon="Loader2" {...props} />,
  AlertTriangle: (props: any) => <span data-icon="AlertTriangle" {...props} />,
}));

// Mock the Translator component to isolate TranslatorWrapper tests
vi.mock('@/app/components/Translator', () => ({
  default: ({ availableLanguages }: any) => (
    <div data-testid="translator-component">
      {availableLanguages && (
        <div data-testid="languages-count">{availableLanguages.length}</div>
      )}
      {availableLanguages?.map((lang: any) => (
        <div key={lang.code} data-testid={`lang-${lang.code}`}>{lang.name}</div>
      ))}
    </div>
  ),
}));

import TranslatorWrapper from '@/app/components/TranslatorWrapper';
import { Language } from '@/lib/supabase/types';

const mockLanguages: Language[] = [
  {
    id: '1',
    code: 'kuku_yalanji',
    name: 'Kuku Yalanji',
    native_name: 'Kuku Yalanji',
    is_active: true,
  },
  {
    id: '2',
    code: 'warlpiri',
    name: 'Warlpiri',
    native_name: 'Warlpiri',
    is_active: true,
  },
];

describe('TranslatorWrapper', () => {
  it('renders the Translator component', () => {
    render(<TranslatorWrapper languages={mockLanguages} />);

    expect(screen.getByTestId('translator-component')).toBeInTheDocument();
  });

  it('passes languages prop to Translator as availableLanguages', () => {
    render(<TranslatorWrapper languages={mockLanguages} />);

    expect(screen.getByTestId('languages-count')).toHaveTextContent('2');
  });

  it('passes all language data through to Translator', () => {
    render(<TranslatorWrapper languages={mockLanguages} />);

    expect(screen.getByTestId('lang-kuku_yalanji')).toHaveTextContent('Kuku Yalanji');
    expect(screen.getByTestId('lang-warlpiri')).toHaveTextContent('Warlpiri');
  });

  it('handles empty languages array', () => {
    render(<TranslatorWrapper languages={[]} />);

    expect(screen.getByTestId('translator-component')).toBeInTheDocument();
    expect(screen.getByTestId('languages-count')).toHaveTextContent('0');
  });

  it('handles single language', () => {
    const singleLang: Language[] = [
      {
        id: '1',
        code: 'test_lang',
        name: 'Test Language',
        native_name: 'Test',
        is_active: true,
      },
    ];

    render(<TranslatorWrapper languages={singleLang} />);

    expect(screen.getByTestId('languages-count')).toHaveTextContent('1');
    expect(screen.getByTestId('lang-test_lang')).toHaveTextContent('Test Language');
  });
});
