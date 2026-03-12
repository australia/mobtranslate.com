import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// Mock lucide-react - must explicitly export each used icon
vi.mock('lucide-react', () => ({
  ArrowRight: (props: any) => <span data-icon="ArrowRight" {...props} />,
  Globe: (props: any) => <span data-icon="Globe" {...props} />,
  Loader2: (props: any) => <span data-icon="Loader2" {...props} />,
  AlertTriangle: (props: any) => <span data-icon="AlertTriangle" {...props} />,
}));

import Translator from '@/app/components/Translator';
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
  {
    id: '3',
    code: 'pitjantjatjara',
    name: 'Pitjantjatjara',
    native_name: 'Pitjantjatjara',
    is_active: true,
  },
];

function createMockReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe('Translator', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with empty state', () => {
    render(<Translator availableLanguages={mockLanguages} />);

    expect(screen.getByPlaceholderText('Enter English text to translate...')).toBeInTheDocument();
    expect(screen.getByText('Translate')).toBeInTheDocument();
    expect(screen.getByText('Translate from English')).toBeInTheDocument();
  });

  it('shows character count as 0 initially', () => {
    render(<Translator availableLanguages={mockLanguages} />);

    expect(screen.getByText('0 characters')).toBeInTheDocument();
  });

  it('updates character count when typing', async () => {
    const user = userEvent.setup();
    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'hello');

    expect(screen.getByText('5 characters')).toBeInTheDocument();
  });

  it('has translate button disabled when input is empty', () => {
    render(<Translator availableLanguages={mockLanguages} />);

    const button = screen.getByText('Translate').closest('button');
    expect(button).toBeDisabled();
  });

  it('has translate button disabled when input is only whitespace', async () => {
    const user = userEvent.setup();
    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, '   ');

    const button = screen.getByText('Translate').closest('button');
    expect(button).toBeDisabled();
  });

  it('enables translate button when text is entered', async () => {
    const user = userEvent.setup();
    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'hello world');

    const button = screen.getByText('Translate').closest('button');
    expect(button).not.toBeDisabled();
  });

  it('fetches languages on mount when not provided', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockLanguages,
    });

    render(<Translator />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/v2/languages');
    });
  });

  it('uses provided languages prop and does not fetch', () => {
    render(<Translator availableLanguages={mockLanguages} />);

    expect(fetchSpy).not.toHaveBeenCalledWith('/api/v2/languages');
  });

  it('shows language names in the selector', () => {
    render(<Translator availableLanguages={mockLanguages} />);

    const select = screen.getByRole('combobox');
    const options = within(select).getAllByRole('option');

    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent('Kuku Yalanji');
    expect(options[1]).toHaveTextContent('Warlpiri');
    expect(options[2]).toHaveTextContent('Pitjantjatjara');
  });

  it('falls back to language code when name is not available', () => {
    const languagesWithoutName: Language[] = [
      {
        id: '1',
        code: 'test_lang',
        name: '',
        native_name: '',
        is_active: true,
      },
    ];
    render(<Translator availableLanguages={languagesWithoutName} />);

    const select = screen.getByRole('combobox');
    const option = within(select).getByRole('option');
    expect(option).toHaveTextContent('test_lang');
  });

  it('allows changing the selected language', async () => {
    const user = userEvent.setup();
    render(<Translator availableLanguages={mockLanguages} />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'warlpiri');

    expect(select).toHaveValue('warlpiri');
  });

  it('submits translation request with correct parameters', async () => {
    const user = userEvent.setup();
    const stream = createMockReadableStream(['translated text']);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'hello');

    const button = screen.getByText('Translate').closest('button')!;
    await user.click(button);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/translate/kuku_yalanji', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello', stream: true }),
      });
    });
  });

  it('sends translation to the selected language', async () => {
    const user = userEvent.setup();
    const stream = createMockReadableStream(['result']);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    render(<Translator availableLanguages={mockLanguages} />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'warlpiri');

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'hello');

    const button = screen.getByText('Translate').closest('button')!;
    await user.click(button);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/translate/warlpiri', expect.any(Object));
    });
  });

  it('shows loading state during translation', async () => {
    const user = userEvent.setup();
    // Create a stream that never resolves to keep loading state
    const neverEndingStream = new ReadableStream<Uint8Array>({
      start() {},
      pull() {
        return new Promise<void>(() => {});
      },
    });

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      body: neverEndingStream,
    });

    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'hello');

    const button = screen.getByText('Translate').closest('button')!;
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Translating...')).toBeInTheDocument();
    });
  });

  it('displays streamed translation output', async () => {
    const user = userEvent.setup();
    const stream = createMockReadableStream(['Hello ', 'World']);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'test');

    const button = screen.getByText('Translate').closest('button')!;
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByTestId('markdown-output')).toHaveTextContent('Hello World');
    });
  });

  it('shows error on failed request (non-ok response)', async () => {
    const user = userEvent.setup();

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'hello');

    const button = screen.getByText('Translate').closest('button')!;
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Translation error occurred. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows error when fetch throws', async () => {
    const user = userEvent.setup();

    fetchSpy.mockRejectedValueOnce(new Error('Network error'));

    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'hello');

    const button = screen.getByText('Translate').closest('button')!;
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Translation error occurred. Please try again.')).toBeInTheDocument();
    });
  });

  it('clears error when user starts typing again', async () => {
    const user = userEvent.setup();

    fetchSpy.mockRejectedValueOnce(new Error('Network error'));

    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'hello');

    const button = screen.getByText('Translate').closest('button')!;
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Translation error occurred. Please try again.')).toBeInTheDocument();
    });

    // Type more to clear error
    await user.type(textarea, ' world');

    await waitFor(() => {
      expect(screen.queryByText('Translation error occurred. Please try again.')).not.toBeInTheDocument();
    });
  });

  it('triggers translate on Ctrl+Enter keyboard shortcut', async () => {
    const user = userEvent.setup();
    const stream = createMockReadableStream(['result']);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'hello');

    // Press Ctrl+Enter
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/translate/kuku_yalanji', expect.any(Object));
    });
  });

  it('triggers translate on Meta+Enter (Cmd+Enter) keyboard shortcut', async () => {
    const user = userEvent.setup();
    const stream = createMockReadableStream(['result']);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'hello');

    // Press Cmd+Enter
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/translate/kuku_yalanji', expect.any(Object));
    });
  });

  it('does not trigger translate on plain Enter', async () => {
    const user = userEvent.setup();

    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'hello');

    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining('/api/translate'), expect.any(Object));
  });

  it('shows error when language fetch fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Failed to fetch'));

    render(<Translator />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load available languages. Please refresh the page.')).toBeInTheDocument();
    });
  });

  it('does not submit when canTranslate is false (empty input)', async () => {
    render(<Translator availableLanguages={mockLanguages} />);

    const button = screen.getByText('Translate').closest('button')!;
    // Force click even though disabled
    fireEvent.click(button);

    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining('/api/translate'), expect.any(Object));
  });

  it('shows the disclaimer note after translation', async () => {
    const user = userEvent.setup();
    const stream = createMockReadableStream(['translated']);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'hello');

    const button = screen.getByText('Translate').closest('button')!;
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Translations are generated using AI/)).toBeInTheDocument();
    });
  });

  it('clears previous output when starting a new translation', async () => {
    const user = userEvent.setup();
    const stream1 = createMockReadableStream(['first result']);
    const stream2 = createMockReadableStream(['second result']);

    fetchSpy
      .mockResolvedValueOnce({ ok: true, body: stream1 })
      .mockResolvedValueOnce({ ok: true, body: stream2 });

    render(<Translator availableLanguages={mockLanguages} />);

    const textarea = screen.getByPlaceholderText('Enter English text to translate...');
    await user.type(textarea, 'hello');

    const button = screen.getByText('Translate').closest('button')!;
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByTestId('markdown-output')).toHaveTextContent('first result');
    });

    // Start second translation
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByTestId('markdown-output')).toHaveTextContent('second result');
    });

    expect(screen.queryByText('first result')).not.toBeInTheDocument();
  });
});
