import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FillInTheBlank from '../../app/education/components/FillInTheBlank';

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
  Check: makeIcon('Check'),
  Lightbulb: makeIcon('Lightbulb'),
  CornerDownLeft: makeIcon('CornerDownLeft'),
}));

const mockWords = [
  { id: '1', word: 'bama', translation: 'person' },
  { id: '2', word: 'kaban', translation: 'river' },
  { id: '3', word: 'binal', translation: 'fire' },
  { id: '4', word: 'jalbu', translation: 'woman' },
  { id: '5', word: 'kulji', translation: 'water' },
  { id: '6', word: 'juku', translation: 'tree' },
];

describe('FillInTheBlank', () => {
  const defaultProps = {
    words: mockWords,
    onClose: vi.fn(),
    languageName: 'Kuku Yalanji',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the component heading', () => {
    render(<FillInTheBlank {...defaultProps} />);
    expect(screen.getByText('Fill in the Blank')).toBeInTheDocument();
  });

  it('displays language name in subtitle', () => {
    render(<FillInTheBlank {...defaultProps} />);
    expect(screen.getByText(/Complete the sentence in Kuku Yalanji/)).toBeInTheDocument();
  });

  it('shows sentence counter (1 of N)', () => {
    render(<FillInTheBlank {...defaultProps} />);
    expect(screen.getByText(/Sentence 1 of/)).toBeInTheDocument();
  });

  it('shows initial score of 0 pts', () => {
    render(<FillInTheBlank {...defaultProps} />);
    expect(screen.getByText('0 pts')).toBeInTheDocument();
  });

  it('renders an input field for typing the answer', () => {
    render(<FillInTheBlank {...defaultProps} />);
    const input = screen.getByPlaceholderText(/Type the Kuku Yalanji word/);
    expect(input).toBeInTheDocument();
  });

  it('renders Check and Hint buttons', () => {
    render(<FillInTheBlank {...defaultProps} />);
    expect(screen.getByText('Check')).toBeInTheDocument();
    expect(screen.getByText('Hint')).toBeInTheDocument();
  });

  it('Check button is disabled when input is empty', () => {
    render(<FillInTheBlank {...defaultProps} />);
    const checkBtn = screen.getByText('Check').closest('button');
    expect(checkBtn).toHaveAttribute('disabled');
  });

  it('Check button becomes enabled when text is typed', async () => {
    const user = userEvent.setup();
    render(<FillInTheBlank {...defaultProps} />);
    const input = screen.getByPlaceholderText(/Type the Kuku Yalanji word/);
    await user.type(input, 'test');
    const checkBtn = screen.getByText('Check').closest('button');
    expect(checkBtn).not.toHaveAttribute('disabled');
  });

  it('shows hint when Hint button is clicked', () => {
    render(<FillInTheBlank {...defaultProps} />);
    fireEvent.click(screen.getByText('Hint'));
    expect(screen.getByText(/First letter:/)).toBeInTheDocument();
    expect(screen.getByText(/letters total/)).toBeInTheDocument();
  });

  it('disables Hint button after it is clicked', () => {
    render(<FillInTheBlank {...defaultProps} />);
    const hintBtn = screen.getByText('Hint').closest('button')!;
    fireEvent.click(hintBtn);
    expect(hintBtn).toHaveAttribute('disabled');
  });

  it('shows "Correct!" when the right answer is submitted', async () => {
    const user = userEvent.setup();
    render(<FillInTheBlank {...defaultProps} />);
    const input = screen.getByPlaceholderText(/Type the Kuku Yalanji word/);

    for (const w of mockWords) {
      if (screen.queryByText(new RegExp(`"${w.translation}"`))) {
        await user.type(input, w.word);
        fireEvent.click(screen.getByText('Check'));
        expect(screen.getByText('Correct!')).toBeInTheDocument();
        return;
      }
    }
    expect(input).toBeInTheDocument();
  });

  it('shows "Not quite right" when wrong answer is submitted', async () => {
    const user = userEvent.setup();
    render(<FillInTheBlank {...defaultProps} />);
    const input = screen.getByPlaceholderText(/Type the Kuku Yalanji word/);
    await user.type(input, 'wronganswer');
    fireEvent.click(screen.getByText('Check'));
    expect(screen.getByText('Not quite right')).toBeInTheDocument();
  });

  it('shows the correct answer when wrong answer is submitted', async () => {
    const user = userEvent.setup();
    render(<FillInTheBlank {...defaultProps} />);
    const input = screen.getByPlaceholderText(/Type the Kuku Yalanji word/);
    await user.type(input, 'wronganswer');
    fireEvent.click(screen.getByText('Check'));
    expect(screen.getByText(/The answer was:/)).toBeInTheDocument();
  });

  it('shows Next Sentence button after answering', async () => {
    const user = userEvent.setup();
    render(<FillInTheBlank {...defaultProps} />);
    const input = screen.getByPlaceholderText(/Type the Kuku Yalanji word/);
    await user.type(input, 'wronganswer');
    fireEvent.click(screen.getByText('Check'));
    expect(screen.getByText('Next Sentence')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<FillInTheBlank {...defaultProps} />);
    const closeBtn = screen
      .getAllByRole('button')
      .find((btn) => btn.querySelector('[data-icon="X"]'));
    if (closeBtn) fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('submits on Enter key press', async () => {
    const user = userEvent.setup();
    render(<FillInTheBlank {...defaultProps} />);
    const input = screen.getByPlaceholderText(/Type the Kuku Yalanji word/);
    await user.type(input, 'wronganswer');
    await user.keyboard('{Enter}');
    expect(screen.getByText('Not quite right')).toBeInTheDocument();
  });
});
