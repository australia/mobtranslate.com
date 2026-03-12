import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WordQuiz from '../../app/education/components/WordQuiz';

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
  Check: makeIcon('Check'),
  ChevronRight: makeIcon('ChevronRight'),
  Trophy: makeIcon('Trophy'),
  Zap: makeIcon('Zap'),
  RotateCcw: makeIcon('RotateCcw'),
}));

const mockWords = [
  { id: '1', word: 'bama', translation: 'person' },
  { id: '2', word: 'kaban', translation: 'river' },
  { id: '3', word: 'binal', translation: 'fire' },
  { id: '4', word: 'jalbu', translation: 'woman' },
  { id: '5', word: 'kulji', translation: 'water' },
  { id: '6', word: 'juku', translation: 'tree' },
];

describe('WordQuiz', () => {
  const defaultProps = {
    words: mockWords,
    onClose: vi.fn(),
    languageName: 'Kuku Yalanji',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the component heading', () => {
    render(<WordQuiz {...defaultProps} />);
    expect(screen.getByText('Word Quiz')).toBeInTheDocument();
  });

  it('displays language name in subtitle', () => {
    render(<WordQuiz {...defaultProps} />);
    expect(screen.getByText(/Test your Kuku Yalanji vocabulary/)).toBeInTheDocument();
  });

  it('shows question counter', () => {
    render(<WordQuiz {...defaultProps} />);
    expect(screen.getByText(/Question 1 of/)).toBeInTheDocument();
  });

  it('shows initial score of 0 correct', () => {
    render(<WordQuiz {...defaultProps} />);
    expect(screen.getByText('0 correct')).toBeInTheDocument();
  });

  it('shows progress percentage', () => {
    render(<WordQuiz {...defaultProps} />);
    expect(screen.getByText('0% complete')).toBeInTheDocument();
  });

  it('displays a word and "What does this word mean?" prompt', () => {
    render(<WordQuiz {...defaultProps} />);
    expect(screen.getByText('What does this word mean?')).toBeInTheDocument();
    const wordTexts = mockWords.map((w) => w.word);
    const found = wordTexts.some((word) => screen.queryByText(word) !== null);
    expect(found).toBe(true);
  });

  it('displays 4 answer options with letter labels A-D', () => {
    render(<WordQuiz {...defaultProps} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('shows Next Question button after selecting an answer', () => {
    render(<WordQuiz {...defaultProps} />);
    // Find an option button that contains a translation
    const translations = mockWords.map((w) => w.translation);
    const optionBtns = screen
      .getAllByRole('button')
      .filter((btn) => translations.some((t) => btn.textContent?.includes(t)));
    if (optionBtns.length > 0) {
      fireEvent.click(optionBtns[0]);
      expect(screen.getByText(/Next Question|See Results/)).toBeInTheDocument();
    }
  });

  it('increments score on correct answer', () => {
    render(<WordQuiz {...defaultProps} />);
    let currentWord: (typeof mockWords)[0] | undefined;
    for (const w of mockWords) {
      if (screen.queryByText(w.word)) {
        currentWord = w;
        break;
      }
    }
    if (!currentWord) return;

    const correctBtn = screen
      .getAllByRole('button')
      .find((btn) => btn.textContent?.includes(currentWord!.translation));
    if (correctBtn) {
      fireEvent.click(correctBtn);
      expect(screen.getByText('1 correct')).toBeInTheDocument();
    }
  });

  it('does not increment score on wrong answer', () => {
    render(<WordQuiz {...defaultProps} />);
    let currentWord: (typeof mockWords)[0] | undefined;
    for (const w of mockWords) {
      if (screen.queryByText(w.word)) {
        currentWord = w;
        break;
      }
    }
    if (!currentWord) return;

    const wrongBtn = screen.getAllByRole('button').find(
      (btn) =>
        btn.textContent &&
        !btn.textContent.includes(currentWord!.translation) &&
        mockWords.some((w) => btn.textContent?.includes(w.translation))
    );
    if (wrongBtn) {
      fireEvent.click(wrongBtn);
      expect(screen.getByText('0 correct')).toBeInTheDocument();
    }
  });

  it('advances to next question when Next is clicked', () => {
    render(<WordQuiz {...defaultProps} />);
    const translations = mockWords.map((w) => w.translation);
    const optionBtns = screen
      .getAllByRole('button')
      .filter((btn) => translations.some((t) => btn.textContent?.includes(t)));
    if (optionBtns.length > 0) {
      fireEvent.click(optionBtns[0]);
      const nextBtn = screen.getByText(/Next Question/);
      fireEvent.click(nextBtn);
      expect(screen.getByText(/Question 2 of/)).toBeInTheDocument();
    }
  });

  it('calls onClose when close button is clicked', () => {
    render(<WordQuiz {...defaultProps} />);
    const closeBtn = screen
      .getAllByRole('button')
      .find((btn) => btn.querySelector('[data-icon="X"]'));
    if (closeBtn) fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows results screen after all questions are answered', () => {
    render(<WordQuiz {...defaultProps} />);
    const translations = mockWords.map((w) => w.translation);
    for (let i = 0; i < 6; i++) {
      const optionBtns = screen
        .getAllByRole('button')
        .filter((btn) => translations.some((t) => btn.textContent?.includes(t)));
      if (optionBtns.length > 0) {
        fireEvent.click(optionBtns[0]);
      }
      const nextBtn =
        screen.queryByText(/Next Question/) || screen.queryByText(/See Results/);
      if (nextBtn) fireEvent.click(nextBtn);
    }
    expect(screen.getByText('Quiz Complete!')).toBeInTheDocument();
    expect(screen.getByText('Play Again')).toBeInTheDocument();
    expect(screen.getByText('Exit')).toBeInTheDocument();
  });

  it('shows score, accuracy, and best streak on results screen', () => {
    render(<WordQuiz {...defaultProps} />);
    const translations = mockWords.map((w) => w.translation);
    for (let i = 0; i < 6; i++) {
      const optionBtns = screen
        .getAllByRole('button')
        .filter((btn) => translations.some((t) => btn.textContent?.includes(t)));
      if (optionBtns.length > 0) fireEvent.click(optionBtns[0]);
      const nextBtn =
        screen.queryByText(/Next Question/) || screen.queryByText(/See Results/);
      if (nextBtn) fireEvent.click(nextBtn);
    }
    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(screen.getByText('Accuracy')).toBeInTheDocument();
    expect(screen.getByText('Best Streak')).toBeInTheDocument();
  });
});
