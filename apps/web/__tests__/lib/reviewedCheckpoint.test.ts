import { extendReviewedCheckpointState } from '@/lib/research/reviewedCheckpoint';

describe('reviewed checkpoint state', () => {
  it('increments the contract-declared checkpoint counter and review routing', () => {
    const result = extendReviewedCheckpointState({
      parentCounts: {
        sourceAcquisitionReviewCheckpoints: 1,
        sourceFidelityReviewCheckpoints: 1,
      },
      parentReviewRouting: { inherited: true },
      checkpoint: {
        counter_field: 'sourceAcquisitionReviewCheckpoints',
        review_routing: {
          restricted_catalog_candidate_groups: 29,
          related_language_exclusions: 3,
        },
      },
    });

    expect(result.counts).toEqual(
      expect.objectContaining({
        sourceAcquisitionReviewCheckpoints: 2,
        sourceFidelityReviewCheckpoints: 1,
        newAcceptedRows: 0,
        trainingEligibleRows: 0,
      }),
    );
    expect(result.reviewRouting).toEqual({
      inherited: true,
      restricted_catalog_candidate_groups: 29,
      related_language_exclusions: 3,
      integrated_into_linguistic_components: 0,
    });
  });

  it('retains the source-fidelity default for historical contracts', () => {
    const result = extendReviewedCheckpointState({
      parentCounts: { sourceFidelityReviewCheckpoints: 2 },
      parentReviewRouting: {},
      checkpoint: {
        candidate_claims_verified: 4,
        candidate_examples_verified: 3,
        candidate_paradigms_verified: 2,
      },
    });

    expect(result.counts.sourceFidelityReviewCheckpoints).toBe(3);
    expect(
      result.reviewRouting.source_fidelity_candidate_records_verified,
    ).toBe(9);
  });

  it('can issue a metadata correction without double-counting review work', () => {
    const result = extendReviewedCheckpointState({
      parentCounts: { sourceAcquisitionReviewCheckpoints: 2 },
      parentReviewRouting: { catalog_groups: 83 },
      checkpoint: {
        counter_field: 'sourceAcquisitionReviewCheckpoints',
        counter_increment: 0,
        review_routing: {
          catalog_groups: 83,
          controlled_synthetic_pairs_authorized: 0,
        },
      },
    });

    expect(result.counts.sourceAcquisitionReviewCheckpoints).toBe(2);
    expect(result.reviewRouting).toEqual({
      catalog_groups: 83,
      controlled_synthetic_pairs_authorized: 0,
      integrated_into_linguistic_components: 0,
    });
  });
});
