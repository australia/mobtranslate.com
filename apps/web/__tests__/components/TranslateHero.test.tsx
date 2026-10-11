import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TranslateHero from '@/app/components/TranslateHero';
import type { Language } from '@/lib/supabase/types';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

const languages: Language[] = [
  {
    id: 'kuku',
    code: 'kuku_yalanji',
    name: 'Kuku Yalanji',
    native_name: 'Kuku Yalanji',
    is_active: true,
  },
  {
    id: 'migmaq',
    code: 'migmaq',
    name: "Mi'kmaq",
    native_name: "Mi'kmaq",
    is_active: true,
  },
];

describe('TranslateHero source-backed lookup', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('states the learner-facing source boundary clearly', () => {
    render(<TranslateHero languages={languages} />);

    expect(screen.getByText('Source-backed dictionary lookup')).toBeVisible();
    expect(
      screen.getByLabelText('Search a Kuku Yalanji word or English meaning'),
    ).toBeVisible();
    expect(
      screen.getByText(/Each result opens its recorded source and review trail/),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Translate' })).toBeNull();
  });

  it('searches both headwords and meanings, then links to the entry', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            type: 'definition',
            id: 'definition-1',
            definition: 'woman; adult female',
            word: {
              id: 'word-1',
              word: 'jalbu',
              word_class: { name: 'noun' },
            },
          },
          {
            type: 'word',
            id: 'word-1',
            word: 'jalbu',
            primary_definition: 'woman',
          },
        ],
      }),
    });
    const user = userEvent.setup();
    render(<TranslateHero languages={languages} />);

    await user.type(
      screen.getByLabelText('Search a Kuku Yalanji word or English meaning'),
      'woman',
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v2/public/search?q=woman&dictionary_code=kuku_yalanji&limit=18',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(await screen.findByText('jalbu')).toHaveAttribute('lang', 'gvn');
    expect(screen.getByText('woman; adult female')).toBeVisible();
    expect(screen.getByRole('link', { name: /jalbu/ })).toHaveAttribute(
      'href',
      '/dictionaries/kuku_yalanji/words/jalbu',
    );
    expect(screen.getByText('1 entry')).toBeVisible();
  });

  it('leaves a missing result visible instead of generating a guess', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const user = userEvent.setup();
    render(<TranslateHero languages={languages} />);

    await user.type(
      screen.getByLabelText('Search a Kuku Yalanji word or English meaning'),
      'unrecorded',
    );

    expect(await screen.findByText('No matching entry yet')).toBeVisible();
    expect(
      screen.getByText(/left missing rather than filled with a machine guess/),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Browse Kuku Yalanji' })).toHaveAttribute(
      'href',
      '/dictionaries/kuku_yalanji',
    );
  });

  it('glosses a phrase word by word and names every word it cannot translate', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        query: 'helllo we catching catfish',
        tokens: [
          { token: 'helllo', lookup: 'helllo', status: 'missing', matches: [], ambiguous: false },
          {
            token: 'we',
            lookup: 'we',
            status: 'exact',
            matches: [{ word: 'ngana', gloss: 'we' }],
            ambiguous: false,
          },
          { token: 'catching', lookup: 'catching', status: 'missing', matches: [], ambiguous: false },
          {
            token: 'catfish',
            lookup: 'catfish',
            status: 'exact',
            matches: [{ word: 'mukal', gloss: 'catfish' }],
            ambiguous: false,
          },
        ],
        found: 2,
        missing: 2,
        skipped: 0,
        complete: false,
      }),
    });
    const user = userEvent.setup();
    render(<TranslateHero languages={languages} />);

    await user.type(
      screen.getByLabelText('Search a Kuku Yalanji word or English meaning'),
      'helllo we catching catfish',
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/v2/public/gloss?q=helllo+we+catching+catfish&dictionary_code=kuku_yalanji',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(await screen.findByText('ngana')).toHaveAttribute('lang', 'gvn');
    expect(screen.getByRole('link', { name: /mukal/ })).toHaveAttribute(
      'href',
      '/dictionaries/kuku_yalanji/words/mukal',
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Not everything could be translated');
    expect(alert).toHaveTextContent('helllo, catching');
    expect(screen.getAllByText('No entry')).toHaveLength(2);
    expect(screen.getByText(/Word by word · 2 of 4 words found/)).toBeVisible();
    expect(screen.queryByText('No matching entry yet')).toBeNull();
  });

  it('shows the missing words when nothing in a phrase can be translated', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        tokens: [
          { token: 'zzz', lookup: 'zzz', status: 'missing', matches: [], ambiguous: false },
          { token: 'qqq', lookup: 'qqq', status: 'missing', matches: [], ambiguous: false },
        ],
        found: 0,
        missing: 2,
        skipped: 0,
        complete: false,
      }),
    });
    const user = userEvent.setup();
    render(<TranslateHero languages={languages} />);

    await user.type(
      screen.getByLabelText('Search a Kuku Yalanji word or English meaning'),
      'zzz qqq',
    );

    expect(await screen.findByText('No matching entry yet')).toBeVisible();
    expect(screen.getByText(/No Kuku Yalanji entry for: zzz, qqq/)).toBeVisible();
  });

  it('searches the selected collection', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const user = userEvent.setup();
    render(<TranslateHero languages={languages} />);

    await user.selectOptions(screen.getByLabelText('Dictionary language'), 'migmaq');
    await user.type(
      screen.getByLabelText("Search a Mi'kmaq word or English meaning"),
      'water',
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v2/public/search?q=water&dictionary_code=migmaq&limit=18',
        expect.any(Object),
      ),
    );
  });
});
