export type AdmissionEvidenceRef = {
  path: string;
  sha256: string;
};

export type AdmissionCriterion = {
  criterionId: string;
  description: string;
  expected: true;
  observed: boolean;
  pass: boolean;
  evidence: AdmissionEvidenceRef[];
};

export type AdmissionGate = {
  gateId: string;
  capability: string;
  pass: boolean;
  claimWhenPassed: string;
  claimWhileFailed: string;
  criteria: AdmissionCriterion[];
  failedCriterionIds: string[];
};

export type ReleaseAdmissionInputs = {
  evidence: Record<string, AdmissionEvidenceRef>;
  foundation: {
    stage0Passed: boolean;
    stage1Passed: boolean;
    downstreamAuthorized: boolean;
  };
  stages: {
    dictionary: string;
    grammar: string;
    naturalCorpus: string;
    benchmarks: string;
    syntheticCorpus: string;
    translationModel: string;
    release: string;
  };
  dictionary: {
    lookupEligible: boolean;
    trainingEligible: boolean;
  };
  grammar: {
    acceptedGenerationRules: number;
    trainingAllowed: boolean;
  };
  corpus: {
    privateResearchTrainingReady: boolean;
    corpusReady: boolean;
    eligibleLexicalRows: number;
    eligibleParallelSentenceRows: number;
    eligibleSyntheticRows: number;
    trainingExposedRows: number;
    huggingFaceDatasetReady: boolean;
    huggingFaceModelReady: boolean;
    homepageModelRouteReady: boolean;
  };
  benchmarks: {
    blindOrIndependentlyEscrowed: boolean;
    numericThresholdsPreregistered: boolean;
    qualifiedSentenceReviewPassed: boolean;
  };
  review: {
    requiredRoleDecisions: number;
    completedRoleDecisions: number;
    promotionSnapshotExists: boolean;
    promotionSnapshotPass: boolean;
  };
  model: {
    artifactExists: boolean;
    immutableReleaseManifestExists: boolean;
    cleanRoomParityPassed: boolean;
    lexicalGatePassed: boolean;
    controlledSentenceGatePassed: boolean;
    freeFormSentenceGatePassed: boolean;
  };
  publication: {
    datasetGatePassed: boolean;
    modelGatePassed: boolean;
    datasetPublished: boolean;
    modelPublished: boolean;
  };
  space: {
    localFailClosedDescriptorVerified: boolean;
    committed: boolean;
    pushed: boolean;
    deployed: boolean;
    inferenceEnabled: boolean;
    readinessGatePassed: boolean;
  };
  homepage: {
    dictionaryFirstContractVerified: boolean;
    unavailableFallbackVerified: boolean;
    modelRouteGatePassed: boolean;
    deployedAndBrowserVerified: boolean;
  };
  authorization: {
    freeFormSentenceRouteAuthorized: boolean;
  };
};

function evidence(
  inputs: ReleaseAdmissionInputs,
  ...keys: string[]
): AdmissionEvidenceRef[] {
  return keys.map((key) => {
    const reference = inputs.evidence[key];
    if (!reference) throw new Error(`missing evidence reference: ${key}`);
    return reference;
  });
}

function criterion(
  criterionId: string,
  description: string,
  observed: boolean,
  evidenceRefs: AdmissionEvidenceRef[],
): AdmissionCriterion {
  return {
    criterionId,
    description,
    expected: true,
    observed,
    pass: observed,
    evidence: evidenceRefs,
  };
}

function gate(
  gateId: string,
  capability: string,
  claimWhenPassed: string,
  claimWhileFailed: string,
  criteria: AdmissionCriterion[],
): AdmissionGate {
  const failedCriterionIds = criteria
    .filter((item) => !item.pass)
    .map((item) => item.criterionId);
  return {
    gateId,
    capability,
    pass: failedCriterionIds.length === 0,
    claimWhenPassed,
    claimWhileFailed,
    criteria,
    failedCriterionIds,
  };
}

export function evaluateReleaseAdmission(inputs: ReleaseAdmissionInputs) {
  if (
    inputs.review.completedRoleDecisions > inputs.review.requiredRoleDecisions
  ) {
    throw new Error('completed review decisions exceed the required decisions');
  }
  if (
    inputs.corpus.trainingExposedRows > 0 &&
    !inputs.corpus.privateResearchTrainingReady
  ) {
    throw new Error(
      'training exposure exists while private_research_training_ready is false',
    );
  }
  if (
    inputs.model.freeFormSentenceGatePassed &&
    !inputs.authorization.freeFormSentenceRouteAuthorized
  ) {
    throw new Error(
      'free-form sentence gate cannot pass without explicit route authorization',
    );
  }

  const foundation = gate(
    'foundation',
    'program foundation',
    'The scoped language program may proceed to governed dictionary and grammar work.',
    'Only archived research inventory work is admitted.',
    [
      criterion(
        'stage_0_language_charter',
        'The language charter gate passes.',
        inputs.foundation.stage0Passed,
        evidence(inputs, 'foundation'),
      ),
      criterion(
        'stage_1_source_archive',
        'The source discovery and archival gate passes.',
        inputs.foundation.stage1Passed,
        evidence(inputs, 'foundation'),
      ),
    ],
  );

  const qualifiedReview = gate(
    'qualified_review',
    'role-separated qualified review',
    'The immutable promotion snapshot authorizes only its recorded scopes.',
    'No review-dependent training, publication, or inference claim is admitted.',
    [
      criterion(
        'all_required_role_decisions_complete',
        'Every required task-role decision is complete.',
        inputs.review.requiredRoleDecisions > 0 &&
          inputs.review.completedRoleDecisions ===
            inputs.review.requiredRoleDecisions,
        evidence(inputs, 'reviewWorkpack', 'spaceVerification'),
      ),
      criterion(
        'promotion_snapshot_exists',
        'A hash-bound append-only promotion snapshot exists.',
        inputs.review.promotionSnapshotExists,
        evidence(inputs, 'reviewWorkpack'),
      ),
      criterion(
        'promotion_snapshot_passes',
        'The promotion snapshot passes its fail-closed validator.',
        inputs.review.promotionSnapshotPass,
        evidence(inputs, 'reviewWorkpack'),
      ),
    ],
  );

  const privateResearchBaseline = gate(
    'private_research_baseline',
    'private scripture-domain research baseline training',
    'A hash-bound private scripture-domain baseline may be trained and evaluated without implying public-release or free-form competence.',
    'No model training exposure is admitted.',
    [
      criterion(
        'foundation_passes',
        'Program foundation passes.',
        foundation.pass,
        evidence(inputs, 'foundation'),
      ),
      criterion(
        'private_research_training_ready',
        'The corpus explicitly admits private research training.',
        inputs.corpus.privateResearchTrainingReady,
        evidence(inputs, 'corpusReadiness'),
      ),
      criterion(
        'eligible_parallel_rows_exist',
        'At least one governed parallel training row is eligible.',
        inputs.corpus.eligibleParallelSentenceRows > 0,
        evidence(inputs, 'corpusReadiness'),
      ),
    ],
  );

  const dictionaryExact = gate(
    'dictionary_exact',
    'deterministic dictionary lookup',
    'The exact dictionary edition may be mounted as the authoritative first route.',
    'The candidate dictionary remains research-only and cannot answer public lookups.',
    [
      criterion(
        'foundation_passes',
        'Program foundation passes.',
        foundation.pass,
        evidence(inputs, 'foundation'),
      ),
      criterion(
        'dictionary_stage_passes',
        'The playbook dictionary stage is complete.',
        inputs.stages.dictionary === 'pass',
        evidence(inputs, 'programState', 'dictionary'),
      ),
      criterion(
        'dictionary_lookup_eligible',
        'The immutable dictionary edition explicitly permits lookup.',
        inputs.dictionary.lookupEligible,
        evidence(inputs, 'dictionary'),
      ),
      criterion(
        'qualified_review_passes',
        'The required qualified review snapshot passes.',
        qualifiedReview.pass,
        evidence(inputs, 'reviewWorkpack'),
      ),
    ],
  );

  const lexicalModel = gate(
    'lexical_model',
    'model lexical reconstruction',
    'A separately labelled lexical research route may be mounted.',
    'No neural lexical capability may be presented.',
    [
      criterion(
        'dictionary_training_eligible',
        'The dictionary edition permits model training.',
        inputs.dictionary.trainingEligible,
        evidence(inputs, 'dictionary'),
      ),
      criterion(
        'eligible_lexical_rows_exist',
        'At least one governed lexical training row is eligible.',
        inputs.corpus.eligibleLexicalRows > 0,
        evidence(inputs, 'corpusReadiness'),
      ),
      criterion(
        'translation_model_stage_passes',
        'The translation-model stage passes.',
        inputs.stages.translationModel === 'pass',
        evidence(inputs, 'programState'),
      ),
      criterion(
        'immutable_model_artifact_exists',
        'A hash-bound model artifact and release manifest exist.',
        inputs.model.artifactExists &&
          inputs.model.immutableReleaseManifestExists,
        evidence(inputs, 'programState', 'spaceVerification'),
      ),
      criterion(
        'clean_room_parity_passes',
        'Clean-room reload and deterministic parity pass.',
        inputs.model.cleanRoomParityPassed,
        evidence(inputs, 'programState'),
      ),
      criterion(
        'lexical_benchmark_gate_passes',
        'The independently declared lexical gate passes.',
        inputs.model.lexicalGatePassed,
        evidence(inputs, 'benchmarks'),
      ),
      criterion(
        'qualified_review_passes',
        'The required qualified review snapshot passes.',
        qualifiedReview.pass,
        evidence(inputs, 'reviewWorkpack'),
      ),
    ],
  );

  const controlledSentence = gate(
    'controlled_sentence',
    'bounded controlled sentence generation',
    'Only the enumerated, reviewed construction contract may be mounted.',
    'No controlled sentence model capability may be presented.',
    [
      criterion(
        'grammar_stage_passes',
        'The playbook grammar stage is complete.',
        inputs.stages.grammar === 'pass',
        evidence(inputs, 'programState', 'grammar'),
      ),
      criterion(
        'accepted_generation_rules_exist',
        'At least one qualified-review-accepted generation rule exists.',
        inputs.grammar.acceptedGenerationRules > 0,
        evidence(inputs, 'grammar'),
      ),
      criterion(
        'grammar_training_allowed',
        'The grammar evidence used by the route permits training use.',
        inputs.grammar.trainingAllowed,
        evidence(inputs, 'grammar'),
      ),
      criterion(
        'eligible_sentence_training_evidence_exists',
        'Governed parallel or synthetic sentence evidence is eligible.',
        inputs.corpus.eligibleParallelSentenceRows > 0 ||
          inputs.corpus.eligibleSyntheticRows > 0,
        evidence(inputs, 'corpusReadiness'),
      ),
      criterion(
        'thresholds_preregistered',
        'Numeric controlled-route thresholds are preregistered.',
        inputs.benchmarks.numericThresholdsPreregistered,
        evidence(inputs, 'benchmarks'),
      ),
      criterion(
        'controlled_model_gate_passes',
        'The bounded controlled-generation model gate passes.',
        inputs.model.controlledSentenceGatePassed,
        evidence(inputs, 'benchmarks', 'programState'),
      ),
      criterion(
        'qualified_review_passes',
        'The required qualified review snapshot passes.',
        qualifiedReview.pass,
        evidence(inputs, 'reviewWorkpack'),
      ),
    ],
  );

  const freeFormSentence = gate(
    'free_form_sentence',
    'free-form sentence generation',
    'A visibly limited free-form research route may be mounted.',
    'No free-form Anindilyakwa generation may be exposed or implied.',
    [
      criterion(
        'natural_corpus_stage_passes',
        'The natural-corpus stage passes.',
        inputs.stages.naturalCorpus === 'pass',
        evidence(inputs, 'programState', 'corpusReadiness'),
      ),
      criterion(
        'benchmark_stage_passes',
        'The benchmark stage passes.',
        inputs.stages.benchmarks === 'pass',
        evidence(inputs, 'programState', 'benchmarks'),
      ),
      criterion(
        'independent_final_set',
        'The natural final set is blind or independently escrowed.',
        inputs.benchmarks.blindOrIndependentlyEscrowed,
        evidence(inputs, 'benchmarks'),
      ),
      criterion(
        'thresholds_preregistered',
        'Sentence-generation numeric thresholds are preregistered.',
        inputs.benchmarks.numericThresholdsPreregistered,
        evidence(inputs, 'benchmarks'),
      ),
      criterion(
        'qualified_sentence_review_passes',
        'Qualified fluent-language sentence review passes.',
        inputs.benchmarks.qualifiedSentenceReviewPassed,
        evidence(inputs, 'benchmarks', 'reviewWorkpack'),
      ),
      criterion(
        'free_form_model_gate_passes',
        'The independent free-form sentence model gate passes.',
        inputs.model.freeFormSentenceGatePassed,
        evidence(inputs, 'programState', 'benchmarks'),
      ),
      criterion(
        'explicit_route_authorization',
        'Free-form sentence routing is explicitly authorized.',
        inputs.authorization.freeFormSentenceRouteAuthorized,
        evidence(inputs, 'programState'),
      ),
    ],
  );

  const huggingFaceDataset = gate(
    'hugging_face_dataset',
    'Hugging Face dataset publication',
    'Only redistribution-approved, hash-manifested dataset files may be published.',
    'No Anindilyakwa dataset repository may be published.',
    [
      criterion(
        'corpus_ready',
        'The corpus-readiness gate passes.',
        inputs.corpus.corpusReady,
        evidence(inputs, 'corpusReadiness'),
      ),
      criterion(
        'qualified_review_passes',
        'The required scope-specific review snapshot passes.',
        qualifiedReview.pass,
        evidence(inputs, 'reviewWorkpack'),
      ),
      criterion(
        'dataset_release_gate_passes',
        'The program dataset-publication gate passes.',
        inputs.publication.datasetGatePassed &&
          inputs.corpus.huggingFaceDatasetReady,
        evidence(inputs, 'programState', 'corpusReadiness'),
      ),
    ],
  );

  const huggingFaceModel = gate(
    'hugging_face_model',
    'public Hugging Face model release',
    'The exact model, tokenizer, decoder, cards, manifests, and parity fixture may be published.',
    'No public or servable Anindilyakwa model release is admitted; a separately labelled private research artifact is not this gate.',
    [
      criterion(
        'model_artifact_and_manifest_exist',
        'The immutable model artifact and release manifest exist.',
        inputs.model.artifactExists &&
          inputs.model.immutableReleaseManifestExists,
        evidence(inputs, 'programState', 'spaceVerification'),
      ),
      criterion(
        'at_least_one_model_route_passes',
        'At least one accurately bounded model route passes.',
        lexicalModel.pass || controlledSentence.pass || freeFormSentence.pass,
        evidence(inputs, 'benchmarks', 'programState'),
      ),
      criterion(
        'clean_room_parity_passes',
        'Clean-room loading and deterministic parity pass.',
        inputs.model.cleanRoomParityPassed,
        evidence(inputs, 'programState'),
      ),
      criterion(
        'model_release_gate_passes',
        'The program model-publication gate passes.',
        inputs.publication.modelGatePassed &&
          inputs.corpus.huggingFaceModelReady,
        evidence(inputs, 'programState', 'corpusReadiness'),
      ),
    ],
  );

  const huggingFaceSpace = gate(
    'hugging_face_space',
    'Hugging Face Space inference',
    'The exact admitted model route may be enabled in the fail-closed Space.',
    'The Space may show program metadata only; inference must remain disabled.',
    [
      criterion(
        'local_fail_closed_descriptor_verified',
        'The local not-released descriptor fails closed.',
        inputs.space.localFailClosedDescriptorVerified,
        evidence(inputs, 'spaceVerification'),
      ),
      criterion(
        'model_publication_passes',
        'The Hugging Face model publication gate passes.',
        huggingFaceModel.pass && inputs.publication.modelPublished,
        evidence(inputs, 'programState', 'spaceVerification'),
      ),
      criterion(
        'space_change_published',
        'The Space code is committed and pushed.',
        inputs.space.committed && inputs.space.pushed,
        evidence(inputs, 'spaceVerification'),
      ),
      criterion(
        'space_deployed_and_ready',
        'The Space is deployed, inference-enabled, and readiness-verified.',
        inputs.space.deployed &&
          inputs.space.inferenceEnabled &&
          inputs.space.readinessGatePassed,
        evidence(inputs, 'spaceVerification', 'programState'),
      ),
    ],
  );

  const homepage = gate(
    'homepage',
    'MobTranslate homepage routing',
    'The homepage may route dictionary-first and then only to the admitted bounded model capability.',
    'No Anindilyakwa homepage model route or translation claim may be exposed.',
    [
      criterion(
        'dictionary_exact_route_passes',
        'The deterministic dictionary route passes and remains first.',
        dictionaryExact.pass && inputs.homepage.dictionaryFirstContractVerified,
        evidence(inputs, 'dictionary', 'programState'),
      ),
      criterion(
        'bounded_model_route_passes',
        'At least one model route and the Space gate pass.',
        (lexicalModel.pass ||
          controlledSentence.pass ||
          freeFormSentence.pass) &&
          huggingFaceSpace.pass,
        evidence(inputs, 'benchmarks', 'spaceVerification'),
      ),
      criterion(
        'unavailable_fallback_verified',
        'Unsupported or unavailable inference fails closed.',
        inputs.homepage.unavailableFallbackVerified,
        evidence(
          inputs,
          inputs.evidence.homepageVerification
            ? 'homepageVerification'
            : 'programState',
          'spaceVerification',
        ),
      ),
      criterion(
        'homepage_route_gate_passes',
        'The explicit homepage model-route gate passes.',
        inputs.homepage.modelRouteGatePassed &&
          inputs.corpus.homepageModelRouteReady,
        evidence(inputs, 'programState', 'corpusReadiness'),
      ),
      criterion(
        'homepage_live_browser_proof',
        'The deployed homepage route has live browser/runtime proof.',
        inputs.homepage.deployedAndBrowserVerified,
        evidence(
          inputs,
          inputs.evidence.homepageVerification
            ? 'homepageVerification'
            : 'programState',
        ),
      ),
    ],
  );

  const gates = {
    foundation,
    privateResearchBaseline,
    qualifiedReview,
    dictionaryExact,
    lexicalModel,
    controlledSentence,
    freeFormSentence,
    huggingFaceDataset,
    huggingFaceModel,
    huggingFaceSpace,
    homepage,
  };

  return {
    routingPolicy: {
      order: ['dictionary_exact', 'controlled_sentence', 'free_form_sentence'],
      dictionaryAlwaysFirst: true,
      routeGatesAreIndependent: true,
      lexicalSuccessDoesNotAuthorizeSentenceGeneration: true,
      controlledSuccessDoesNotAuthorizeFreeFormGeneration: true,
      unavailableOrUnsupportedInference: 'fail_closed',
    },
    gates,
    admittedCapabilities: Object.values(gates)
      .filter((item) => item.pass)
      .map((item) => item.gateId),
    releaseReady:
      huggingFaceDataset.pass &&
      huggingFaceModel.pass &&
      huggingFaceSpace.pass &&
      homepage.pass &&
      inputs.stages.release === 'pass',
  };
}
