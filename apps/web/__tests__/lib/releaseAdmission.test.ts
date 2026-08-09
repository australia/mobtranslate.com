// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  evaluateReleaseAdmission,
  type ReleaseAdmissionInputs,
} from '../../lib/research/releaseAdmission';

function baseline(): ReleaseAdmissionInputs {
  const evidence = Object.fromEntries(
    [
      'programState',
      'corpusReadiness',
      'foundation',
      'reviewWorkpack',
      'dictionary',
      'grammar',
      'benchmarks',
      'spaceVerification',
      'ipMap',
    ].map((key) => [key, { path: `${key}.json`, sha256: 'a'.repeat(64) }]),
  );
  return {
    evidence,
    foundation: {
      stage0Passed: true,
      stage1Passed: true,
      downstreamAuthorized: false,
    },
    stages: {
      dictionary: 'in_progress',
      grammar: 'in_progress',
      naturalCorpus: 'in_progress',
      benchmarks: 'in_progress',
      syntheticCorpus: 'not_started',
      translationModel: 'not_started',
      release: 'not_started',
    },
    dictionary: { lookupEligible: false, trainingEligible: false },
    grammar: { acceptedGenerationRules: 0, trainingAllowed: false },
    corpus: {
      privateResearchTrainingReady: false,
      corpusReady: false,
      eligibleLexicalRows: 0,
      eligibleParallelSentenceRows: 0,
      eligibleSyntheticRows: 0,
      trainingExposedRows: 0,
      huggingFaceDatasetReady: false,
      huggingFaceModelReady: false,
      homepageModelRouteReady: false,
    },
    benchmarks: {
      blindOrIndependentlyEscrowed: false,
      numericThresholdsPreregistered: false,
      qualifiedSentenceReviewPassed: false,
    },
    review: {
      requiredRoleDecisions: 938,
      completedRoleDecisions: 0,
      promotionSnapshotExists: false,
      promotionSnapshotPass: false,
    },
    model: {
      artifactExists: false,
      immutableReleaseManifestExists: false,
      cleanRoomParityPassed: false,
      lexicalGatePassed: false,
      controlledSentenceGatePassed: false,
      freeFormSentenceGatePassed: false,
    },
    publication: {
      datasetGatePassed: false,
      modelGatePassed: false,
      datasetPublished: false,
      modelPublished: false,
    },
    space: {
      localFailClosedDescriptorVerified: true,
      committed: false,
      pushed: false,
      deployed: false,
      inferenceEnabled: false,
      readinessGatePassed: false,
    },
    homepage: {
      dictionaryFirstContractVerified: false,
      unavailableFallbackVerified: false,
      modelRouteGatePassed: false,
      deployedAndBrowserVerified: false,
    },
    authorization: { freeFormSentenceRouteAuthorized: false },
  };
}

describe('language-program release admission', () => {
  it('admits foundation work without inflating it into a product route', () => {
    const result = evaluateReleaseAdmission(baseline());

    expect(result.admittedCapabilities).toEqual(['foundation']);
    expect(result.gates.privateResearchBaseline.pass).toBe(false);
    expect(result.gates.dictionaryExact.pass).toBe(false);
    expect(result.gates.lexicalModel.pass).toBe(false);
    expect(result.gates.controlledSentence.pass).toBe(false);
    expect(result.gates.freeFormSentence.pass).toBe(false);
    expect(result.gates.huggingFaceSpace.pass).toBe(false);
    expect(result.gates.homepage.pass).toBe(false);
    expect(result.releaseReady).toBe(false);
  });

  it('does not mount a reviewed dictionary until its edition gate passes', () => {
    const input = baseline();
    input.review.completedRoleDecisions = 938;
    input.review.promotionSnapshotExists = true;
    input.review.promotionSnapshotPass = true;
    input.stages.dictionary = 'pass';

    const beforeEditionPromotion = evaluateReleaseAdmission(input);
    expect(beforeEditionPromotion.gates.qualifiedReview.pass).toBe(true);
    expect(beforeEditionPromotion.gates.dictionaryExact.pass).toBe(false);

    input.dictionary.lookupEligible = true;
    const afterEditionPromotion = evaluateReleaseAdmission(input);
    expect(afterEditionPromotion.gates.dictionaryExact.pass).toBe(true);
    expect(afterEditionPromotion.gates.lexicalModel.pass).toBe(false);
  });

  it('keeps controlled and free-form sentence gates independent', () => {
    const input = baseline();
    input.review.completedRoleDecisions = 938;
    input.review.promotionSnapshotExists = true;
    input.review.promotionSnapshotPass = true;
    input.stages.grammar = 'pass';
    input.grammar.acceptedGenerationRules = 1;
    input.grammar.trainingAllowed = true;
    input.corpus.eligibleSyntheticRows = 10;
    input.benchmarks.numericThresholdsPreregistered = true;
    input.model.controlledSentenceGatePassed = true;

    const result = evaluateReleaseAdmission(input);
    expect(result.gates.controlledSentence.pass).toBe(true);
    expect(result.gates.freeFormSentence.pass).toBe(false);
    expect(
      result.routingPolicy.controlledSuccessDoesNotAuthorizeFreeFormGeneration,
    ).toBe(true);
  });

  it('rejects internally contradictory exposure and authorization states', () => {
    const exposed = baseline();
    exposed.corpus.trainingExposedRows = 1;
    expect(() => evaluateReleaseAdmission(exposed)).toThrow(
      /training exposure exists while private_research_training_ready is false/,
    );

    exposed.corpus.privateResearchTrainingReady = true;
    expect(() => evaluateReleaseAdmission(exposed)).not.toThrow();

    const unauthorized = baseline();
    unauthorized.model.freeFormSentenceGatePassed = true;
    expect(() => evaluateReleaseAdmission(unauthorized)).toThrow(
      /cannot pass without explicit route authorization/,
    );
  });

  it('admits private research training without admitting public release', () => {
    const input = baseline();
    input.corpus.privateResearchTrainingReady = true;
    input.corpus.eligibleParallelSentenceRows = 4_120;

    const result = evaluateReleaseAdmission(input);
    expect(result.gates.privateResearchBaseline.pass).toBe(true);
    expect(result.gates.huggingFaceDataset.pass).toBe(false);
    expect(result.gates.huggingFaceModel.pass).toBe(false);
    expect(result.releaseReady).toBe(false);
  });
});
