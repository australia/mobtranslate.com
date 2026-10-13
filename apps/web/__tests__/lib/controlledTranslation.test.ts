// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { buildExactDictionaryIndex } from '../../lib/dictionary-exact.server';
import {
  renderExpectedControlledTranslation,
  resolveControlledTranslation,
  type ControlledTranslationSpec,
} from '../../lib/controlled-translation.server';
import { translateWithControlledHybridModel } from '../../lib/hybrid-model-inference.server';
import { loadHybridLanguageContract } from '../../lib/hybrid-translation-registry.server';

const SPEC: ControlledTranslationSpec = {
  contractId: 'wajarri-subject-slot-v1',
  task: 'subject_slot',
  slotToken: '<copy>',
  constructions: [
    {
      id: 'running',
      sourceTemplate: 'The <copy> is running.',
      modelTemplate: '<copy> jamarnimanha.',
    },
    {
      id: 'sitting',
      sourceTemplate: 'The <copy> is sitting.',
      modelTemplate: '<copy> nyinamanha.',
    },
  ],
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('controlled translation contract', () => {
  it('canonicalizes a supported sentence and binds one exact dictionary subject', () => {
    const index = buildExactDictionaryIndex([
      { word: 'marruwa', gloss: 'bilby' },
    ]);

    const resolved = resolveControlledTranslation(
      'the bilby is running',
      index,
      SPEC,
    );

    expect(resolved).toMatchObject({
      constructionId: 'running',
      modelText: 'The <copy> is running.',
      modelTemplate: '<copy> jamarnimanha.',
      bindings: { '<copy>': 'marruwa' },
    });
    expect(renderExpectedControlledTranslation(resolved!)).toBe(
      'marruwa jamarnimanha.',
    );
  });

  it('fails closed for unsupported predicates and ambiguous dictionary subjects', () => {
    const supported = buildExactDictionaryIndex([
      { word: 'marruwa', gloss: 'bilby' },
    ]);
    const ambiguous = buildExactDictionaryIndex([
      { word: 'marruwa', gloss: 'bilby' },
      { word: 'marlu', gloss: 'bilby' },
    ]);

    expect(
      resolveControlledTranslation('The bilby is flying.', supported, SPEC),
    ).toBeNull();
    expect(
      resolveControlledTranslation('The bilby is running.', ambiguous, SPEC),
    ).toBeNull();
  });

  it('calls the versioned generation route and checks rendered output exactly', async () => {
    const contract = loadHybridLanguageContract('wajarri', {
      MOBTRANSLATE_HYBRID_WAJARRI_ENABLED: '1',
      MOBTRANSLATE_HYBRID_SPACE_ENDPOINT:
        'https://space.example/v1/translate',
    })!;
    const request = resolveControlledTranslation(
      'The bilby is running.',
      buildExactDictionaryIndex([{ word: 'marruwa', gloss: 'bilby' }]),
      SPEC,
    )!;
    const fetchMock = vi.fn(async () =>
      response({
        translation: 'marruwa jamarnimanha.',
        modelTemplate: '<copy> jamarnimanha.',
        route: 'controlled_slot',
        model: contract.modelVersion,
        modelId: contract.modelId,
        apiVersion: 'v1',
        task: 'subject_slot',
        languageCode: 'wajarri',
        languageName: 'Wajarri',
        languageTag: 'wbv',
        sourceLang: 'eng_Latn',
        targetLang: 'wbv_Latn',
        ms: 50,
        queueMs: 0,
        validation: 'unverified_research_preview',
        notice: 'Unverified research output.',
      }),
    );

    const result = await translateWithControlledHybridModel(
      request,
      contract,
      fetchMock as typeof fetch,
    );

    expect(result.translation).toBe('marruwa jamarnimanha.');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://space.example/v1/generate',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      text: 'The <copy> is running.',
      task: 'subject_slot',
      language: 'wajarri',
      bindings: { '<copy>': 'marruwa' },
    });
  });

  it('rejects a model response whose raw template differs', async () => {
    const contract = loadHybridLanguageContract('wajarri', {
      MOBTRANSLATE_HYBRID_WAJARRI_ENABLED: '1',
    })!;
    const request = resolveControlledTranslation(
      'The bilby is running.',
      buildExactDictionaryIndex([{ word: 'marruwa', gloss: 'bilby' }]),
      SPEC,
    )!;
    const fetchMock = vi.fn(async () =>
      response({
        translation: 'marruwa yanmanha.',
        modelTemplate: '<copy> yanmanha.',
        route: 'controlled_slot',
        model: contract.modelVersion,
        modelId: contract.modelId,
        apiVersion: 'v1',
        task: 'subject_slot',
        languageCode: 'wajarri',
        languageName: 'Wajarri',
        languageTag: 'wbv',
        sourceLang: 'eng_Latn',
        targetLang: 'wbv_Latn',
        ms: 50,
        queueMs: 0,
        validation: 'unverified_research_preview',
        notice: 'Unverified research output.',
      }),
    );

    await expect(
      translateWithControlledHybridModel(
        request,
        contract,
        fetchMock as typeof fetch,
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
