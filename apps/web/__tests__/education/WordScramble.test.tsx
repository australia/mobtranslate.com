import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WordScramble from '../../app/education/components/WordScramble';

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
  Lightbulb: makeIcon('Lightbulb'),
  ChevronRight: makeIcon('ChevronRight'),
  Trophy: makeIcon('Trophy'),
  Zap: makeIcon('Zap'),
  Clock: makeIcon('Clock'),
  Shuffle: makeIcon('Shuffle'),
}));

const mockWords = [
  { id: '1', word: 'bama', translation: 'person' },
  { id: '2', word: 'kaban', translation: 'river' },
  { id: '3', word: 'binal', translation: 'fire' },
  { id: '4', word: 'jalbu', translation: 'woman' },
  { id: '5', word: 'kulji', translation: 'water' },
  { id: '6', word: 'juku', translation: 'tree' },
];

describe('WordScramble', () => {
  const defaultProps = {
    words: mockWords,
    onClose: vi.fn(),
    languageName: 'Kuku Yalanji',
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the component heading', () => {
    render(<WordScramble {...defaultProps} />);
    expect(screen.getByText('Word Scramble')).toBeInTheDocument();
  });

  it('displays language name in subtitle', () => {
    render(<WordScramble {...defaultProps} />);
    expect(screen.getByText(/Unscramble Kuku Yalanji words/)).toBeInTheDocument();
  });

  it('shows initial score of 0 pts', () => {
    render(<WordScramble {...defaultProps} />);
    expect(screen.getByText('0 pts')).toBeInTheDocument();
  });

  it('shows timer starting at 0:00', () => {
    render(<WordScramble {...defaultProps} />);
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('timer increments', () => {
    render(<WordScramble {...defaultProps} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('0:05')).toBeInTheDocument();
  });

  it('shows word counter', () => {
    render(<WordScramble {...defaultProps} />);
    expect(screen.getByText(/1\/\d+/)).toBeInTheDocument();
  });

  it('displays "Unscramble to spell:" prompt', () => {
    render(<WordScramble {...defaultProps} />);
    expect(screen.getByText('Unscramble to spell:')).toBeInTheDocument();
  });

  it('shows the translation of the current word in quotes', () => {
    render(<WordScramble {...defaultProps} />);
    const translations = mockWords.map((w) => `"${w.translation}"`);
    const found = translations.some((t) => screen.queryByText(t) !== null);
    expect(found).toBe(true);
  });

  it('shows placeholder text when no letters are selected', () => {
    render(<WordScramble {...defaultProps} />);
    expect(screen.getByText('Tap letters below to spell the word')).toBeInTheDocument();
  });

  it('renders Reshuffle and Hint buttons', () => {
    render(<WordScramble {...defaultProps} />);
    expect(screen.getByText('Reshuffle')).toBeInTheDocument();
    expect(screen.getByText('Hint')).toBeInTheDocument();
  });

  it('shows hint when Hint button is clicked', () => {
    render(<WordScramble {...defaultProps} />);
    fireEvent.click(screen.getByText('Hint'));
    expect(screen.getByText(/First letter:/)).toBeInTheDocument();
  });

  it('disables Hint button after it is clicked', () => {
    render(<WordScramble {...defaultProps} />);
    const hintBtn = screen.getByText('Hint').closest('button')!;
    fireEvent.click(hintBtn);
    expect(hintBtn).toHaveAttribute('disabled');
  });

  it('calls onClose when close button is clicked', () => {
    render(<WordScramble {...defaultProps} />);
    const closeBtn = screen
      .getAllByRole('button')
      .find((btn) => btn.querySelector('[data-icon="X"]'));
    if (closeBtn) fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('renders scrambled letter buttons', () => {
    render(<WordScramble {...defaultProps} />);
    let currentWord: (typeof mockWords)[0] | undefined;
    for (const w of mockWords) {
      if (screen.queryByText(`"${w.translation}"`)) {
        currentWord = w;
        break;
      }
    }
    if (!currentWord) return;

    for (const char of currentWord.word) {
      const buttons = screen
        .getAllByRole('button')
        .filter((btn) => btn.textContent === char);
      expect(buttons.length).toBeGreaterThan(0);
    }
  });

  it('moves a letter from scrambled to selected area on click', () => {
    render(<WordScramble {...defaultProps} />);
    let currentWord: (typeof mockWords)[0] | undefined;
    for (const w of mockWords) {
      if (screen.queryByText(`"${w.translation}"`)) {
        currentWord = w;
        break;
      }
    }
    if (!currentWord) return;

    const firstChar = currentWord.word[0];
    const letterBtns = screen
      .getAllByRole('button')
      .filter((btn) => btn.textContent === firstChar && !btn.hasAttribute('disabled'));
    if (letterBtns.length > 0) {
      fireEvent.click(letterBtns[0]);
      expect(
        screen.queryByText('Tap letters below to spell the word')
      ).not.toBeInTheDocument();
    }
  });
});
