import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SpeedRound from '../../app/education/components/SpeedRound';

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
  Timer: makeIcon('Timer'),
}));

const mockWords = [
  { id: '1', word: 'bama', translation: 'person' },
  { id: '2', word: 'kaban', translation: 'river' },
  { id: '3', word: 'binal', translation: 'fire' },
  { id: '4', word: 'jalbu', translation: 'woman' },
  { id: '5', word: 'kulji', translation: 'water' },
  { id: '6', word: 'juku', translation: 'tree' },
];

describe('SpeedRound', () => {
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
    render(<SpeedRound {...defaultProps} />);
    expect(screen.getByText('Speed Round')).toBeInTheDocument();
  });

  it('displays the language name in subtitle', () => {
    render(<SpeedRound {...defaultProps} />);
    expect(screen.getByText(/Quick-fire Kuku Yalanji vocabulary/)).toBeInTheDocument();
  });

  it('renders the pre-game screen with Ready heading', () => {
    render(<SpeedRound {...defaultProps} />);
    expect(screen.getByText('Ready?')).toBeInTheDocument();
    expect(screen.getByText(/You have 60 seconds/)).toBeInTheDocument();
  });

  it('shows Start button on pre-game screen', () => {
    render(<SpeedRound {...defaultProps} />);
    expect(screen.getByText('Start!')).toBeInTheDocument();
  });

  it('starts the game when Start button is clicked', () => {
    render(<SpeedRound {...defaultProps} />);
    fireEvent.click(screen.getByText('Start!'));
    expect(screen.queryByText('Ready?')).not.toBeInTheDocument();
    expect(screen.getByText('What does this mean?')).toBeInTheDocument();
  });

  it('displays a word from the word list after starting', () => {
    render(<SpeedRound {...defaultProps} />);
    fireEvent.click(screen.getByText('Start!'));
    const wordTexts = mockWords.map((w) => w.word);
    const found = wordTexts.some((word) => screen.queryByText(word) !== null);
    expect(found).toBe(true);
  });

  it('shows two answer options', () => {
    render(<SpeedRound {...defaultProps} />);
    fireEvent.click(screen.getByText('Start!'));
    const translations = mockWords.map((w) => w.translation);
    const visibleTranslations = translations.filter((t) => screen.queryByText(t) !== null);
    expect(visibleTranslations.length).toBe(2);
  });

  it('shows initial timer of 60 seconds', () => {
    render(<SpeedRound {...defaultProps} />);
    expect(screen.getByText('60s')).toBeInTheDocument();
  });

  it('timer counts down after game starts', () => {
    render(<SpeedRound {...defaultProps} />);
    fireEvent.click(screen.getByText('Start!'));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('57s')).toBeInTheDocument();
  });

  it('shows initial score of 0 pts', () => {
    render(<SpeedRound {...defaultProps} />);
    expect(screen.getByText('0 pts')).toBeInTheDocument();
  });

  it('increments answered count when an answer is selected', () => {
    render(<SpeedRound {...defaultProps} />);
    fireEvent.click(screen.getByText('Start!'));
    const translations = mockWords.map((w) => w.translation);
    const optionButtons = screen
      .getAllByRole('button')
      .filter((btn) => translations.includes(btn.textContent || ''));
    fireEvent.click(optionButtons[0]);
    expect(screen.getByText('1 answered')).toBeInTheDocument();
  });

  it('completes game when timer reaches 0', () => {
    render(<SpeedRound {...defaultProps} />);
    fireEvent.click(screen.getByText('Start!'));
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByText("Time's Up!")).toBeInTheDocument();
  });

  it('shows results screen with stats after game ends', () => {
    render(<SpeedRound {...defaultProps} />);
    fireEvent.click(screen.getByText('Start!'));
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByText('Points')).toBeInTheDocument();
    expect(screen.getByText('Answered')).toBeInTheDocument();
    expect(screen.getByText('Best Streak')).toBeInTheDocument();
    expect(screen.getByText('Words/min')).toBeInTheDocument();
  });

  it('shows Play Again and Exit buttons on results screen', () => {
    render(<SpeedRound {...defaultProps} />);
    fireEvent.click(screen.getByText('Start!'));
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByText('Play Again')).toBeInTheDocument();
    expect(screen.getByText('Exit')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<SpeedRound {...defaultProps} />);
    const closeBtn = screen
      .getAllByRole('button')
      .find((btn) => btn.querySelector('[data-icon="X"]'));
    if (closeBtn) fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('resets game when Play Again is clicked after completion', () => {
    render(<SpeedRound {...defaultProps} />);
    fireEvent.click(screen.getByText('Start!'));
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    fireEvent.click(screen.getByText('Play Again'));
    expect(screen.getByText('Ready?')).toBeInTheDocument();
    expect(screen.getByText('60s')).toBeInTheDocument();
  });

  it('calls onClose when Exit is clicked on results screen', () => {
    render(<SpeedRound {...defaultProps} />);
    fireEvent.click(screen.getByText('Start!'));
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    fireEvent.click(screen.getByText('Exit'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows 0 answered initially', () => {
    render(<SpeedRound {...defaultProps} />);
    expect(screen.getByText('0 answered')).toBeInTheDocument();
  });
});
