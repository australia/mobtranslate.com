export type JsonRecord = Record<string, unknown>;

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function extendReviewedCheckpointState({
  parentCounts,
  parentReviewRouting,
  checkpoint,
}: {
  parentCounts: JsonRecord;
  parentReviewRouting: JsonRecord;
  checkpoint: JsonRecord;
}): { counts: JsonRecord; reviewRouting: JsonRecord } {
  const counterField =
    typeof checkpoint.counter_field === 'string'
      ? checkpoint.counter_field
      : 'sourceFidelityReviewCheckpoints';
  if (!/^[a-z][A-Za-z0-9]*$/u.test(counterField))
    throw new Error(`invalid checkpoint counter field: ${counterField}`);
  const counterIncrement = number(checkpoint.counter_increment) ?? 1;
  if (!Number.isInteger(counterIncrement) || ![0, 1].includes(counterIncrement))
    throw new Error(`invalid checkpoint counter increment: ${counterIncrement}`);
  const parentCounter = number(parentCounts[counterField]) ?? 0;
  const counts = {
    ...parentCounts,
    newAcceptedRows: 0,
    trainingEligibleRows: 0,
    [counterField]: parentCounter + counterIncrement,
  };

  const declaredRouting = checkpoint.review_routing;
  const reviewRouting: JsonRecord = { ...parentReviewRouting };
  if (
    declaredRouting !== undefined &&
    (!declaredRouting ||
      typeof declaredRouting !== 'object' ||
      Array.isArray(declaredRouting))
  )
    throw new Error('checkpoint review_routing must be an object');
  if (declaredRouting)
    Object.assign(reviewRouting, declaredRouting as JsonRecord);
  else {
    const candidateRecords = number(checkpoint.candidate_records_verified);
    const candidateClaims = number(checkpoint.candidate_claims_verified);
    const candidateExamples = number(checkpoint.candidate_examples_verified);
    const candidateParadigms = number(checkpoint.candidate_paradigms_verified);
    if (candidateRecords !== null)
      reviewRouting.source_fidelity_candidate_records_verified =
        candidateRecords;
    else if (
      candidateClaims !== null &&
      candidateExamples !== null &&
      candidateParadigms !== null
    )
      reviewRouting.source_fidelity_candidate_records_verified =
        candidateClaims + candidateExamples + candidateParadigms;
  }
  reviewRouting.integrated_into_linguistic_components = 0;
  return { counts, reviewRouting };
}
