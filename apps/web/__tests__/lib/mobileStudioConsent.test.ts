import { describe, expect, it } from 'vitest';
import {
  emptyStudioConsent,
  setSpeechRight,
  studioConsentFromSnapshot,
} from '../../../../mobile/src/lib/studioConsent';

describe('mobile curator speech permissions', () => {
  it('starts with every speech use off', () => {
    const consent = emptyStudioConsent();
    expect(Object.values(consent.rights).every((allowed) => allowed === false)).toBe(true);
    expect(consent.consentArtifactRef).toBe('app:curator-in-person');
  });

  it('enforces model dependency boundaries', () => {
    let consent = emptyStudioConsent();
    consent = setSpeechRight(consent, 'recordingAllowed', true);
    consent = setSpeechRight(consent, 'speakerVoiceReplicationAllowed', true);
    consent = setSpeechRight(consent, 'hostedProviderTransferAllowed', true);
    consent = setSpeechRight(consent, 'publicMetricsAllowed', true);

    expect(consent.rights.ttsTrainingAllowed).toBe(true);
    expect(consent.rights.speakerVoiceReplicationAllowed).toBe(true);

    consent = setSpeechRight(consent, 'ttsTrainingAllowed', false);
    expect(consent.rights.speakerVoiceReplicationAllowed).toBe(false);
    expect(consent.rights.hostedProviderTransferAllowed).toBe(false);
    expect(consent.rights.publicMetricsAllowed).toBe(false);
  });

  it('keeps earlier collective context but creates a new in-app artefact', () => {
    const consent = studioConsentFromSnapshot({
      recording_allowed: true,
      authorizing_body: 'Recorded family authority',
      consent_artifact_ref: 'paper:old-form',
      consent_artifact_sha256: 'a'.repeat(64),
      consent_notes: 'Earlier context retained for the next conversation.',
    });

    expect(consent.authorizingBody).toBe('Recorded family authority');
    expect(consent.notes).toContain('Earlier context');
    expect(consent.consentArtifactRef).toBe('app:curator-in-person');
    expect(consent.consentArtifactSha256).toBeNull();
  });
});
