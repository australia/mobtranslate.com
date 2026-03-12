import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Flashcards from '../../app/education/components/Flashcards';

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
  ChevronLeft: makeIcon('ChevronLeft'),
  ChevronRight: makeIcon('ChevronRight'),
  RotateCcw: makeIcon('RotateCcw'),
  Check: makeIcon('Check'),
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

describe('Flashcards', () => {
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
    render(<Flashcards {...defaultProps} />);
    expect(screen.getByText('Flashcards')).toBeInTheDocument();
  });

  it('displays language name in subtitle', () => {
    render(<Flashcards {...defaultProps} />);
    expect(screen.getByText(/Study Kuku Yalanji words/)).toBeInTheDocument();
  });

  it('shows card counter (Card 1 of N)', () => {
    render(<Flashcards {...defaultProps} />);
    expect(screen.getByText(/Card 1 of/)).toBeInTheDocument();
  });

  it('shows initial known and learning counts of 0', () => {
    render(<Flashcards {...defaultProps} />);
    expect(screen.getByText('0 known')).toBeInTheDocument();
    expect(screen.getByText('0 learning')).toBeInTheDocument();
  });

  it('displays a word from the word list on the card', () => {
    render(<Flashcards {...defaultProps} />);
    const wordTexts = mockWords.map((w) => w.word);
    const found = wordTexts.some((word) => screen.queryByText(word) !== null);
    expect(found).toBe(true);
  });

  it('shows "Tap to flip" text', () => {
    render(<Flashcards {...defaultProps} />);
    expect(screen.getByText('Tap to flip')).toBeInTheDocument();
  });

  it('shows language name label on the card front', () => {
    render(<Flashcards {...defaultProps} />);
    expect(screen.getByText('Kuku Yalanji')).toBeInTheDocument();
  });

  it('renders Shuffle and Reset buttons', () => {
    render(<Flashcards {...defaultProps} />);
    expect(screen.getByText('Shuffle')).toBeInTheDocument();
    expect(screen.getByText('Reset')).toBeInTheDocument();
  });

  it('renders Still Learning and Got It! action buttons', () => {
    render(<Flashcards {...defaultProps} />);
    expect(screen.getByText('Still Learning')).toBeInTheDocument();
    expect(screen.getByText('Got It!')).toBeInTheDocument();
  });

  it('increments known count when Got It! is clicked', () => {
    render(<Flashcards {...defaultProps} />);
    fireEvent.click(screen.getByText('Got It!'));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText('1 known')).toBeInTheDocument();
  });

  it('increments learning count when Still Learning is clicked', () => {
    render(<Flashcards {...defaultProps} />);
    fireEvent.click(screen.getByText('Still Learning'));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText('1 learning')).toBeInTheDocument();
  });

  it('advances to next card after Got It! is clicked', () => {
    render(<Flashcards {...defaultProps} />);
    fireEvent.click(screen.getByText('Got It!'));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText(/Card 2 of/)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<Flashcards {...defaultProps} />);
    const closeBtn = screen
      .getAllByRole('button')
      .find((btn) => btn.querySelector('[data-icon="X"]'));
    if (closeBtn) fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows completion screen after all cards are reviewed', () => {
    render(<Flashcards {...defaultProps} />);
    const cardCount = mockWords.length;
    for (let i = 0; i < cardCount; i++) {
      fireEvent.click(screen.getByText('Got It!'));
      act(() => {
        vi.advanceTimersByTime(300);
      });
    }
    expect(screen.getByText('Session Complete!')).toBeInTheDocument();
  });

  it('shows Study Again and Exit on completion screen', () => {
    render(<Flashcards {...defaultProps} />);
    const cardCount = mockWords.length;
    for (let i = 0; i < cardCount; i++) {
      fireEvent.click(screen.getByText('Got It!'));
      act(() => {
        vi.advanceTimersByTime(300);
      });
    }
    expect(screen.getByText('Study Again')).toBeInTheDocument();
    expect(screen.getByText('Exit')).toBeInTheDocument();
  });
});
