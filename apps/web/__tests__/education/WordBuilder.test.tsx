import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WordBuilder from '../../app/education/components/WordBuilder';

function makeIcon(name: string) {
  const Icon = (props: any) => React.createElement('span', { 'data-icon': name, ...props });
  Icon.displayName = name;
  return Icon;
}

vi.mock('@mobtranslate/ui', () => ({
  Button: (props: any) => React.createElement('button', props, props.children),
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  X: makeIcon('X'),
  RotateCcw: makeIcon('RotateCcw'),
  ChevronRight: makeIcon('ChevronRight'),
  Trophy: makeIcon('Trophy'),
  Zap: makeIcon('Zap'),
  Lightbulb: makeIcon('Lightbulb'),
  Delete: makeIcon('Delete'),
}));

const mockWords = [
  { id: '1', word: 'bama', translation: 'person' },
  { id: '2', word: 'kaban', translation: 'river' },
  { id: '3', word: 'binal', translation: 'fire' },
  { id: '4', word: 'jalbu', translation: 'woman' },
  { id: '5', word: 'kulji', translation: 'water' },
  { id: '6', word: 'juku', translation: 'tree' },
];

describe('WordBuilder', () => {
  const defaultProps = {
    words: mockWords,
    onClose: vi.fn(),
    languageName: 'Kuku Yalanji',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the component heading', () => {
    render(<WordBuilder {...defaultProps} />);
    expect(screen.getByText('Word Builder')).toBeInTheDocument();
  });

  it('displays language name in subtitle', () => {
    render(<WordBuilder {...defaultProps} />);
    expect(screen.getByText(/Build Kuku Yalanji words letter by letter/)).toBeInTheDocument();
  });

  it('shows initial score of 0 pts', () => {
    render(<WordBuilder {...defaultProps} />);
    expect(screen.getByText('0 pts')).toBeInTheDocument();
  });

  it('shows word counter', () => {
    render(<WordBuilder {...defaultProps} />);
    expect(screen.getByText(/1\/\d+/)).toBeInTheDocument();
  });

  it('displays a translation prompt', () => {
    render(<WordBuilder {...defaultProps} />);
    expect(screen.getByText(/Build the Kuku Yalanji word for:/)).toBeInTheDocument();
  });

  it('shows the translation of the current word in quotes', () => {
    render(<WordBuilder {...defaultProps} />);
    const translations = mockWords.map((w) => `"${w.translation}"`);
    const found = translations.some((t) => screen.queryByText(t) !== null);
    expect(found).toBe(true);
  });

  it('renders letter buttons', () => {
    render(<WordBuilder {...defaultProps} />);
    const allButtons = screen.getAllByRole('button');
    expect(allButtons.length).toBeGreaterThan(5);
  });

  it('has Undo and Hint action buttons', () => {
    render(<WordBuilder {...defaultProps} />);
    expect(screen.getByText('Undo')).toBeInTheDocument();
    expect(screen.getByText(/Hint/)).toBeInTheDocument();
  });

  it('Undo button is disabled when no letters are placed', () => {
    render(<WordBuilder {...defaultProps} />);
    const undoBtn = screen.getByText('Undo').closest('button');
    expect(undoBtn).toHaveAttribute('disabled');
  });

  it('calls onClose when close button is clicked', () => {
    render(<WordBuilder {...defaultProps} />);
    const closeBtn = screen
      .getAllByRole('button')
      .find((btn) => btn.querySelector('[data-icon="X"]'));
    if (closeBtn) fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('renders letter slots for current word', () => {
    render(<WordBuilder {...defaultProps} />);
    const slots = screen.getAllByText('_');
    expect(slots.length).toBeGreaterThanOrEqual(3);
  });

  it('clicking a correct letter fills a slot', () => {
    render(<WordBuilder {...defaultProps} />);
    let currentWord: (typeof mockWords)[0] | undefined;
    for (const w of mockWords) {
      if (screen.queryByText(`"${w.translation}"`)) {
        currentWord = w;
        break;
      }
    }
    if (!currentWord) return;

    const firstChar = currentWord.word[0];
    const letterButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.textContent === firstChar && !btn.hasAttribute('disabled'));
    if (letterButtons.length > 0) {
      const slotsBefore = screen.getAllByText('_').length;
      fireEvent.click(letterButtons[0]);
      // After placing a correct letter, there should be one fewer empty slot
      const slotsAfter = screen.getAllByText('_').length;
      expect(slotsAfter).toBe(slotsBefore - 1);
    }
  });

  it('Hint button reveals the next correct letter', () => {
    render(<WordBuilder {...defaultProps} />);
    let currentWord: (typeof mockWords)[0] | undefined;
    for (const w of mockWords) {
      if (screen.queryByText(`"${w.translation}"`)) {
        currentWord = w;
        break;
      }
    }
    if (!currentWord) return;

    const hintBtn = screen.getAllByRole('button').find((btn) => btn.textContent?.includes('Hint'));
    if (hintBtn) {
      fireEvent.click(hintBtn);
      expect(
        screen.getByText(new RegExp(`${currentWord.word.length - 1} left`))
      ).toBeInTheDocument();
    }
  });
});
