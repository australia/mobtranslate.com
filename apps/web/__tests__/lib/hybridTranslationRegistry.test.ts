// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  HybridModelInferenceError,
  translateWithHybridModel,
} from '../../lib/hybrid-model-inference.server';
import {
  ANINDILYAKWA_HYBRID_DEFINITION,
  MIGMAQ_HYBRID_DEFINITION,
  WAJARRI_HYBRID_DEFINITION,
  listHybridLanguageDefinitions,
  loadHybridLanguageContract,
} from '../../lib/hybrid-translation-registry.server';
import {
  createHybridReviewPrompt,
  retrieveHybridDictionaryEvidence,
} from '../../lib/hybrid-translation.server';
import { getHybridLanguageIdentity } from '../../lib/hybrid-language-identities';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('hybrid translation language registry', () => {
  it('keeps every language disabled until explicitly enabled', () => {
    expect(loadHybridLanguageContract('migmaq', {})).toBeNull();
  });

  it('shares stable public language identities with the client', () => {
    expect(getHybridLanguageIdentity('kuku_yalanji')).toMatchObject({
      languageTag: 'gvn',
    });
    expect(getHybridLanguageIdentity('migmaq')).toMatchObject({
      languageTag: 'mic',
    });
    expect(getHybridLanguageIdentity('wbv')).toMatchObject({
      languageCode: 'wajarri',
      languageTag: 'wbv',
    });
    expect(getHybridLanguageIdentity('aoi')).toMatchObject({
      languageCode: 'anindilyakwa',
      languageTag: 'aoi',
    });
  });

  it('registers four unique model-backed language definitions', () => {
    expect(
      listHybridLanguageDefinitions().map(
        (definition) => definition.languageCode,
      ),
    ).toEqual(['kuku_yalanji', 'migmaq', 'wajarri', 'anindilyakwa']);
  });

  it("loads Mi'kmaq from the shared Space contract", () => {
    const contract = loadHybridLanguageContract('migmaq', {
      MOBTRANSLATE_HYBRID_MIGMAQ_ENABLED: '1',
      MOBTRANSLATE_HYBRID_SPACE_ENDPOINT: 'https://space.example/v1/translate',
      MOBTRANSLATE_HYBRID_SPACE_TIMEOUT_MS: '160000',
    });

    expect(contract).toMatchObject({
      languageCode: 'migmaq',
      targetLang: 'mic_Latn',
      modelId: 'migmaq-listuguj-nllb-lora',
      modelVersion: 'v3.3.0',
      endpoint: 'https://space.example/v1/translate',
      timeoutMs: 160000,
    });
  });

  it('loads Wajarri and Anindilyakwa aliases from pinned Space contracts', () => {
    const wajarri = loadHybridLanguageContract('wbv', {
      MOBTRANSLATE_HYBRID_WAJARRI_ENABLED: '1',
    });
    const anindilyakwa = loadHybridLanguageContract('aoi', {
      MOBTRANSLATE_HYBRID_ANINDILYAKWA_ENABLED: '1',
    });

    expect(wajarri).toMatchObject({
      languageCode: 'wajarri',
      dictionaryCode: 'wbv',
      targetLang: 'wbv_Latn',
      modelId: 'mobtranslate-wajarri-v2',
      modelVersion:
        'v2.0-context-guarded-nr4-s17-context-recovery-r16-s20-20260731',
    });
    expect(anindilyakwa).toMatchObject({
      languageCode: 'anindilyakwa',
      dictionaryCode: 'anindilyakwa',
      targetLang: 'aoi_Latn',
      modelId: 'anindilyakwa-nllb-scripture-baseline',
      modelVersion: 'v0.2.0-traditional-owner-authorized-experimental',
    });
    expect(WAJARRI_HYBRID_DEFINITION.grammarEvidence).toEqual([]);
    expect(ANINDILYAKWA_HYBRID_DEFINITION.grammarEvidence).toEqual([]);
  });

  it('sends the stable language code and verifies the full model identity', async () => {
    const contract = loadHybridLanguageContract('migmaq', {
      MOBTRANSLATE_HYBRID_MIGMAQ_ENABLED: '1',
      MOBTRANSLATE_HYBRID_SPACE_ENDPOINT: 'https://space.example/v1/translate',
    })!;
    const fetchMock = vi.fn(async () =>
      response({
        translation: "Goqwei na'te'l?",
        model: 'v3.3.0',
        modelId: 'migmaq-listuguj-nllb-lora',
        apiVersion: 'v1',
        task: 'translate',
        languageCode: 'migmaq',
        languageName: "Mi'kmaq (Listuguj)",
        languageTag: 'mic',
        sourceLang: 'eng_Latn',
        targetLang: 'mic_Latn',
        ms: 1200,
        queueMs: 0,
        validation: 'unverified_research_preview',
        notice: 'Unverified research output.',
      }),
    );

    const result = await translateWithHybridModel(
      'How are you?',
      contract,
      fetchMock as typeof fetch,
    );

    expect(result.translation).toBe("Goqwei na'te'l?");
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      text: 'How are you?',
      language: 'migmaq',
    });
  });

  it('fails closed if a Space returns another language adapter', async () => {
    const contract = loadHybridLanguageContract('migmaq', {
      MOBTRANSLATE_HYBRID_MIGMAQ_ENABLED: '1',
    })!;
    const fetchMock = vi.fn(async () =>
      response({
        translation: 'jalbu',
        model: contract.modelVersion,
        modelId: contract.modelId,
        apiVersion: 'v1',
        task: 'translate',
        languageCode: 'kuku_yalanji',
        languageName: 'Kuku Yalanji',
        languageTag: 'gvn',
        sourceLang: 'eng_Latn',
        targetLang: 'mic_Latn',
        ms: 1,
        queueMs: 0,
        validation: 'unverified_research_preview',
        notice: 'Unverified research output.',
      }),
    );

    await expect(
      translateWithHybridModel('woman', contract, fetchMock as typeof fetch),
    ).rejects.toMatchObject<HybridModelInferenceError>({ status: 503 });
  });

  it('uses the same evidence engine with language-specific links and notes', () => {
    const dictionary = [
      { word: "e'pit", gloss: 'woman' },
      { word: 'samqwan', gloss: 'water' },
    ];
    const evidence = retrieveHybridDictionaryEvidence(
      MIGMAQ_HYBRID_DEFINITION,
      'The woman saw water.',
      dictionary,
      "E'pit samqwan.",
    );
    const prompt = createHybridReviewPrompt(
      MIGMAQ_HYBRID_DEFINITION,
      {
        source: 'The woman saw water.',
        draft: "E'pit samqwan.",
        draftModelId: MIGMAQ_HYBRID_DEFINITION.modelId,
        draftVersion: MIGMAQ_HYBRID_DEFINITION.modelVersion,
        dictionaryEntries: dictionary,
      },
      evidence,
    );

    expect(evidence.map((item) => item.title)).toEqual(
      expect.arrayContaining(["e'pit", 'samqwan']),
    );
    expect(evidence[0].sourceUrl).toContain('/dictionaries/migmaq/');
    expect(prompt).toContain("English-to-Mi'kmaq");
    expect(prompt).toContain('Listuguj spelling');
    expect(prompt).toContain('not hidden chain-of-thought');
  });
});
