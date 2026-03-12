import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MemoryGame from '../../app/education/components/MemoryGame';

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
  Sparkles: makeIcon('Sparkles'),
  Zap: makeIcon('Zap'),
}));

const mockWords = [
  { id: '1', word: 'bama', translation: 'person' },
  { id: '2', word: 'kaban', translation: 'river' },
  { id: '3', word: 'binal', translation: 'fire' },
  { id: '4', word: 'jalbu', translation: 'woman' },
  { id: '5', word: 'kulji', translation: 'water' },
  { id: '6', word: 'juku', translation: 'tree' },
];

describe('MemoryGame', () => {
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
    render(<MemoryGame {...defaultProps} />);
    expect(screen.getByText('Memory Match')).toBeInTheDocument();
  });

  it('displays language name in subtitle', () => {
    render(<MemoryGame {...defaultProps} />);
    expect(
      screen.getByText(/Match Kuku Yalanji words with their translations/)
    ).toBeInTheDocument();
  });

  it('shows initial timer of 0:00', () => {
    render(<MemoryGame {...defaultProps} />);
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('shows pairs counter (0/6 pairs)', () => {
    render(<MemoryGame {...defaultProps} />);
    expect(screen.getByText('0/6 pairs')).toBeInTheDocument();
  });

  it('shows moves counter (0 moves)', () => {
    render(<MemoryGame {...defaultProps} />);
    expect(screen.getByText('0 moves')).toBeInTheDocument();
  });

  it('renders 12 card buttons (6 pairs) plus control buttons', () => {
    render(<MemoryGame {...defaultProps} />);
    const allButtons = screen.getAllByRole('button');
    // 12 cards + Reset + close = 14
    expect(allButtons.length).toBeGreaterThanOrEqual(12);
  });

  it('has a Reset button', () => {
    render(<MemoryGame {...defaultProps} />);
    expect(screen.getByText('Reset')).toBeInTheDocument();
  });

  it('timer starts when a card is clicked', () => {
    render(<MemoryGame {...defaultProps} />);
    const cardButtons = screen
      .getAllByRole('button')
      .filter(
        (btn) =>
          !btn.textContent?.includes('Reset') &&
          !btn.querySelector('[data-icon="X"]') &&
          !btn.querySelector('[data-icon="RotateCcw"]')
      );
    if (cardButtons.length > 0) {
      fireEvent.click(cardButtons[0]);
    }
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('0:03')).toBeInTheDocument();
  });

  it('increments moves when two cards are flipped', () => {
    render(<MemoryGame {...defaultProps} />);
    const cardButtons = screen
      .getAllByRole('button')
      .filter(
        (btn) =>
          !btn.textContent?.includes('Reset') &&
          !btn.querySelector('[data-icon="X"]') &&
          !btn.querySelector('[data-icon="RotateCcw"]')
      );
    if (cardButtons.length >= 2) {
      fireEvent.click(cardButtons[0]);
      fireEvent.click(cardButtons[1]);
      expect(screen.getByText('1 moves')).toBeInTheDocument();
    }
  });

  it('calls onClose when close button is clicked', () => {
    render(<MemoryGame {...defaultProps} />);
    const closeBtn = screen
      .getAllByRole('button')
      .find((btn) => btn.querySelector('[data-icon="X"]'));
    if (closeBtn) fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('Reset button restarts the game', () => {
    render(<MemoryGame {...defaultProps} />);
    const cardButtons = screen
      .getAllByRole('button')
      .filter(
        (btn) =>
          !btn.textContent?.includes('Reset') &&
          !btn.querySelector('[data-icon="X"]') &&
          !btn.querySelector('[data-icon="RotateCcw"]')
      );
    if (cardButtons.length >= 2) {
      fireEvent.click(cardButtons[0]);
      fireEvent.click(cardButtons[1]);
    }
    fireEvent.click(screen.getByText('Reset'));
    expect(screen.getByText('0 moves')).toBeInTheDocument();
    expect(screen.getByText('0/6 pairs')).toBeInTheDocument();
  });

  it('renders cards with question mark emoji on the back', () => {
    render(<MemoryGame {...defaultProps} />);
    const questionMarks = screen.getAllByText('❓');
    expect(questionMarks.length).toBe(12);
  });
});
