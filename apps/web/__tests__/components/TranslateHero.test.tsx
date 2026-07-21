import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TranslateHero from '@/app/components/TranslateHero';
import type { Language } from '@/lib/supabase/types';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/components/audio/SpeakButton', () => ({
  SpeakButton: () => <button type="button">Hear it</button>,
}));
vi.mock('@/components/improvements/TranslationCorrectionDialog', () => ({
  TranslationCorrectionDialog: () => (
    <button type="button">Suggest a correction</button>
  ),
}));

const languages: Language[] = [
  {
    id: 'kuku',
    code: 'kuku_yalanji',
    name: 'Kuku Yalanji',
    native_name: 'Kuku Yalanji',
    is_active: true,
  },
];

const draftResponse = {
  success: true,
  translation: 'jalbu-ngku',
  reviewPending: true,
  inference: {
    route: 'huggingface_draft',
    validation: 'unverified_research_preview',
    latencyMs: 3900,
    draft: {
      provider: 'huggingface_space',
      translation: 'jalbu-ngku',
      modelId: 'kuku-yalanji-nllb-lora',
      version: 'v24.3-joint-lexeme-dose29-s3598-20260715',
      latencyMs: 3900,
      queueMs: 0,
      sourceUrl:
        'https://huggingface.co/ajaxdavis/mobtranslate-kuku-yalanji-v24-3',
    },
    cache: { draft: 'miss' },
  },
};

const reviewResponse = {
  success: true,
  translation: 'jalbu',
  gloss: 'woman',
  inference: {
    route: 'huggingface_grammar_review',
    validation: 'unverified_research_preview',
    latencyMs: 6120,
    draft: {
      provider: 'huggingface_space',
      translation: 'jalbu-ngku',
      modelId: 'kuku-yalanji-nllb-lora',
      version: 'v24.3-joint-lexeme-dose29-s3598-20260715',
      latencyMs: 3900,
      queueMs: 0,
      sourceUrl:
        'https://huggingface.co/ajaxdavis/mobtranslate-kuku-yalanji-v24-3',
    },
    review: {
      provider: 'openai',
      modelId: 'gpt-5.5-2026-04-23',
      decision: 'dictionary_exact',
      confidence: 'high',
      latencyMs: 2100,
      summary: 'The English word has one clear match in the dictionary.',
      changes: ['Used that dictionary word.'],
      caveats: [],
      evidence: [
        {
          id: 'dictionary-1',
          kind: 'dictionary',
          title: 'jalbu',
          detail: 'woman; adult female',
          sourceLabel: 'Exact English gloss in the MobTranslate dictionary',
          sourceUrl:
            'https://mobtranslate.com/dictionaries/kuku_yalanji/words/jalbu',
        },
      ],
    },
    cache: {
      draft: 'hit',
      evidence: 'miss',
      review: 'miss',
      resolved: 'miss',
    },
  },
};

const exactDictionaryResponse = {
  success: true,
  translation: 'jalbu',
  gloss: 'woman',
  inference: {
    route: 'dictionary_exact',
    validation: 'dictionary_record',
    modelId: 'mobtranslate-dictionary',
    dictionaryRevision: 'dictionary-revision',
    sourceUrl: 'https://mobtranslate.com/dictionaries/kuku_yalanji/words/jalbu',
  },
};

describe('TranslateHero hybrid Kuku Yalanji result', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a direct dictionary result without starting a model review', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => exactDictionaryResponse,
    });
    const user = userEvent.setup();
    render(<TranslateHero languages={languages} />);

    const input = screen.getByLabelText('English text to translate');
    await user.type(input, 'woman');
    await user.click(
      within(input.closest('div')!).getByRole('button', { name: 'Translate' }),
    );

    await waitFor(() =>
      expect(
        document.querySelector('p.font-display[lang="gvn"]'),
      ).toHaveTextContent('jalbu'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('From the dictionary')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View entry' })).toHaveAttribute(
      'href',
      exactDictionaryResponse.inference.sourceUrl,
    );
    expect(
      screen.queryByText('Checking key words and grammar…'),
    ).not.toBeInTheDocument();
  });

  it('shows the first translation while the plain-language check is still loading', async () => {
    let finishReview!: (_value: unknown) => void;
    const pendingReview = new Promise((resolve) => {
      finishReview = resolve;
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => draftResponse,
    });
    fetchMock.mockReturnValueOnce(pendingReview);
    const user = userEvent.setup();
    render(<TranslateHero languages={languages} />);

    const input = screen.getByLabelText('English text to translate');
    await user.type(input, 'woman');
    const inputPanel = input.closest('div')!;
    await user.click(
      within(inputPanel).getByRole('button', { name: 'Translate' }),
    );

    await waitFor(() =>
      expect(
        document.querySelector('p.font-display[lang="gvn"]'),
      ).toHaveTextContent('jalbu-ngku'),
    );
    expect(screen.getByText('Checking key words and grammar…')).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/translate/kuku_yalanji',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'woman',
          mode: 'translate',
          direction: 'to_language',
          stage: 'draft',
        }),
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/translate/kuku_yalanji',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'woman',
          mode: 'translate',
          direction: 'to_language',
          stage: 'review',
        }),
      },
    );

    finishReview({
      ok: true,
      json: async () => reviewResponse,
    });
    await waitFor(() =>
      expect(
        document.querySelector('p.font-display[lang="gvn"]'),
      ).toHaveTextContent('jalbu'),
    );
    expect(
      screen.queryByText('Checking key words and grammar…'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Dictionary result · source-linked')).toBeVisible();
    expect(
      screen.queryByText('AI suggestion · not checked by a fluent speaker'),
    ).not.toBeInTheDocument();

    const summary = screen.getByText('Why this result?').closest('summary')!;
    const disclosure = summary.parentElement as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    await user.click(summary);
    expect(disclosure.open).toBe(true);
    expect(screen.getByText('How it was checked')).toBeInTheDocument();
    expect(screen.getByText('First translation')).toBeInTheDocument();
    expect(screen.getByText('jalbu-ngku')).toBeInTheDocument();
    expect(
      screen.getByText('Dictionary and language notes'),
    ).toBeInTheDocument();
    expect(screen.getByText('Technical details')).toBeInTheDocument();
  });

  it('keeps the first translation visible if the later check fails', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => draftResponse,
      })
      .mockRejectedValueOnce(new Error('review failed'));
    const user = userEvent.setup();
    render(<TranslateHero languages={languages} />);

    const input = screen.getByLabelText('English text to translate');
    await user.type(input, 'woman');
    await user.click(
      within(input.closest('div')!).getByRole('button', { name: 'Translate' }),
    );

    await waitFor(() =>
      expect(
        document.querySelector('p.font-display[lang="gvn"]'),
      ).toHaveTextContent('jalbu-ngku'),
    );
    expect(
      await screen.findByText(
        'We could not finish checking this translation. The first translation is still shown.',
      ),
    ).toBeVisible();
  });
});

const reverseReviewResponse = {
  success: true,
  translation: 'who was at my house',
  direction: 'to_english',
  language: { name: 'Kuku Yalanji', code: 'kuku_yalanji' },
  inference: {
    route: 'dictionary_reverse_review',
    validation: 'unverified_research_preview',
    latencyMs: 8200,
    review: {
      provider: 'openai',
      modelId: 'gpt-5.4-mini-2026-03-17',
      confidence: 'medium',
      latencyMs: 7400,
      summary: 'The words for who, my and house are all listed.',
      breakdown: 'wanju — who · ngayku — my · bayan — house',
      caveats: ['The word endings could not be checked.'],
      evidence: [
        {
          id: 'dictionary-1',
          kind: 'dictionary',
          title: 'bayan',
          detail: 'house; camp; shelter',
          sourceLabel: 'Exact headword in the MobTranslate dictionary',
          sourceUrl:
            'https://mobtranslate.com/dictionaries/kuku_yalanji/words/bayan',
        },
      ],
    },
    cache: { evidence: 'miss', review: 'miss', resolved: 'miss' },
  },
};

const reverseExactResponse = {
  success: true,
  translation: 'water',
  direction: 'to_english',
  language: { name: 'Kuku Yalanji', code: 'kuku_yalanji' },
  inference: {
    route: 'dictionary_exact_reverse',
    validation: 'dictionary_record',
    modelId: 'mobtranslate-dictionary',
    dictionaryRevision: 'dictionary-revision',
    sourceUrl: 'https://mobtranslate.com/dictionaries/kuku_yalanji/words/bana',
    senses: [
      {
        word: 'bana',
        gloss: 'water',
        sourceUrl:
          'https://mobtranslate.com/dictionaries/kuku_yalanji/words/bana',
      },
    ],
  },
};

describe('TranslateHero reverse translation', () => {
  const fetchMock = vi.fn();

  /**
   * Reverse mode also fetches sample headwords for the example chips, so route
   * by URL rather than queueing one-shot responses.
   */
  const routeFetch = (translateResponse: unknown) => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/dictionaries/')) {
        return {
          ok: true,
          json: async () => ({ data: [{ word: 'bana' }, { word: 'bayan' }] }),
        };
      }
      return { ok: true, json: async () => translateResponse };
    });
  };

  const swapToReverse = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
      screen.getByRole('button', {
        name: 'Translate Kuku Yalanji to English instead',
      }),
    );
  };

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('swaps the panes so the language becomes the input', async () => {
    routeFetch(reverseReviewResponse);
    const user = userEvent.setup();
    render(<TranslateHero languages={languages} />);

    expect(screen.getByLabelText('English text to translate')).toBeVisible();
    await swapToReverse(user);

    const input = await screen.findByLabelText(
      'Kuku Yalanji text to translate',
    );
    expect(input).toHaveAttribute('lang', 'gvn');
    expect(input).toHaveAttribute('placeholder', 'Enter Kuku Yalanji text…');
  });

  it('sends one request with the reverse direction and no draft stage', async () => {
    routeFetch(reverseReviewResponse);
    const user = userEvent.setup();
    render(<TranslateHero languages={languages} />);
    await swapToReverse(user);

    const input = await screen.findByLabelText(
      'Kuku Yalanji text to translate',
    );
    await user.type(input, 'wanju ngaykuwunbu bayanba');
    await user.click(
      within(input.closest('div')!).getByRole('button', { name: 'Translate' }),
    );

    await waitFor(() =>
      expect(
        document.querySelector('p.font-display[lang="en"]'),
      ).toHaveTextContent('who was at my house'),
    );

    const translateCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/translate/'),
    );
    expect(translateCalls).toHaveLength(1);
    const payload = JSON.parse(translateCalls[0][1].body);
    expect(payload.direction).toBe('to_english');
    expect(payload.stage).toBeUndefined();
  });

  it('explains the reverse result with a word-by-word breakdown and sources', async () => {
    routeFetch(reverseReviewResponse);
    const user = userEvent.setup();
    render(<TranslateHero languages={languages} />);
    await swapToReverse(user);

    const input = await screen.findByLabelText(
      'Kuku Yalanji text to translate',
    );
    await user.type(input, 'wanju ngaykuwunbu bayanba');
    await user.click(
      within(input.closest('div')!).getByRole('button', { name: 'Translate' }),
    );

    // The breakdown sits next to the translation; the rest is behind the
    // disclosure, so open it the way a reader would.
    expect(
      await screen.findByText('wanju — who · ngayku — my · bayan — house'),
    ).toBeVisible();
    await user.click(screen.getByText('Why this result?'));

    expect(
      screen.getByText('The words for who, my and house are all listed.'),
    ).toBeVisible();
    expect(
      screen.getByText('The word endings could not be checked.'),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open source for bayan' }),
    ).toHaveAttribute(
      'href',
      'https://mobtranslate.com/dictionaries/kuku_yalanji/words/bayan',
    );
  });

  it('labels a straight dictionary hit as source-linked', async () => {
    routeFetch(reverseExactResponse);
    const user = userEvent.setup();
    render(<TranslateHero languages={languages} />);
    await swapToReverse(user);

    const input = await screen.findByLabelText(
      'Kuku Yalanji text to translate',
    );
    await user.type(input, 'bana');
    await user.click(
      within(input.closest('div')!).getByRole('button', { name: 'Translate' }),
    );

    expect(
      await screen.findByText('Dictionary entry · source-linked'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'View entry' })).toHaveAttribute(
      'href',
      'https://mobtranslate.com/dictionaries/kuku_yalanji/words/bana',
    );
    expect(screen.queryByText('Why this result?')).toBeNull();
  });

  it('carries the translation back into the input when swapping again', async () => {
    routeFetch(reverseReviewResponse);
    const user = userEvent.setup();
    render(<TranslateHero languages={languages} />);
    await swapToReverse(user);

    const input = await screen.findByLabelText(
      'Kuku Yalanji text to translate',
    );
    await user.type(input, 'wanju ngaykuwunbu bayanba');
    await user.click(
      within(input.closest('div')!).getByRole('button', { name: 'Translate' }),
    );
    await waitFor(() =>
      expect(
        document.querySelector('p.font-display[lang="en"]'),
      ).toHaveTextContent('who was at my house'),
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Translate English to Kuku Yalanji instead',
      }),
    );

    expect(
      await screen.findByLabelText('English text to translate'),
    ).toHaveValue('who was at my house');
  });
});
