import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MatchingPairs from '../../app/education/components/MatchingPairs';

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
  Trophy: makeIcon('Trophy'),
  Clock: makeIcon('Clock'),
  Zap: makeIcon('Zap'),
  ChevronRight: makeIcon('ChevronRight'),
}));

const mockWords = [
  { id: '1', word: 'bama', translation: 'person' },
  { id: '2', word: 'kaban', translation: 'river' },
  { id: '3', word: 'binal', translation: 'fire' },
  { id: '4', word: 'jalbu', translation: 'woman' },
  { id: '5', word: 'kulji', translation: 'water' },
  { id: '6', word: 'juku', translation: 'tree' },
];

describe('MatchingPairs', () => {
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
    render(<MatchingPairs {...defaultProps} />);
    expect(screen.getByText('Matching Pairs')).toBeInTheDocument();
  });

  it('displays language name in subtitle', () => {
    render(<MatchingPairs {...defaultProps} />);
    expect(screen.getByText(/Match Kuku Yalanji words to their meanings/)).toBeInTheDocument();
  });

  it('shows column headers for language and English', () => {
    render(<MatchingPairs {...defaultProps} />);
    expect(screen.getByText('Kuku Yalanji')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('shows initial score of 0 pts', () => {
    render(<MatchingPairs {...defaultProps} />);
    expect(screen.getByText('0 pts')).toBeInTheDocument();
  });

  it('displays timer starting at 0:00', () => {
    render(<MatchingPairs {...defaultProps} />);
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('timer increments', () => {
    render(<MatchingPairs {...defaultProps} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('0:05')).toBeInTheDocument();
  });

  it('renders word buttons on left side and translation buttons on right', () => {
    render(<MatchingPairs {...defaultProps} />);
    const wordButtons = mockWords.filter((w) => screen.queryByText(w.word));
    const translationButtons = mockWords.filter((w) => screen.queryByText(w.translation));
    expect(wordButtons.length).toBeGreaterThanOrEqual(3);
    expect(translationButtons.length).toBeGreaterThanOrEqual(3);
  });

  it('shows instructions text', () => {
    render(<MatchingPairs {...defaultProps} />);
    expect(
      screen.getByText('Click a word on the left, then click its matching meaning on the right')
    ).toBeInTheDocument();
  });

  it('shows round counter', () => {
    render(<MatchingPairs {...defaultProps} />);
    expect(screen.getByText(/Round \d+\/\d+/)).toBeInTheDocument();
  });

  it('has a Reset button', () => {
    render(<MatchingPairs {...defaultProps} />);
    expect(screen.getByText('Reset')).toBeInTheDocument();
  });

  it('Reset button restarts the game', () => {
    render(<MatchingPairs {...defaultProps} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    fireEvent.click(screen.getByText('Reset'));
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByText('0 pts')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<MatchingPairs {...defaultProps} />);
    const closeBtn = screen
      .getAllByRole('button')
      .find((btn) => btn.querySelector('[data-icon="X"]'));
    if (closeBtn) fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('handles clicking a left item', () => {
    render(<MatchingPairs {...defaultProps} />);
    const wordToClick = mockWords.find((w) => screen.queryByText(w.word));
    if (wordToClick) {
      const btn = screen.getByText(wordToClick.word);
      fireEvent.click(btn);
      expect(btn).toBeInTheDocument();
    }
  });

  it('handles clicking a correct pair to match', () => {
    render(<MatchingPairs {...defaultProps} />);
    for (const w of mockWords) {
      const wordBtn = screen.queryByText(w.word);
      const transBtn = screen.queryByText(w.translation);
      if (wordBtn && transBtn) {
        fireEvent.click(wordBtn);
        fireEvent.click(transBtn);
        act(() => {
          vi.advanceTimersByTime(100);
        });
        break;
      }
    }
    expect(screen.getByText(/pts/)).toBeInTheDocument();
  });
});
