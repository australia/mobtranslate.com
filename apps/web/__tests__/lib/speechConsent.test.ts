// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  EMPTY_SPEECH_RIGHTS,
  SPEECH_CONSENT_FORM_VERSION,
  SpeechConsentGrantSchema,
  legacySpeechConsentFlags,
} from '@/lib/recording/speech-consent';

function consent(rights = { ...EMPTY_SPEECH_RIGHTS, recordingAllowed: true }) {
  return {
    consentFormVersion: SPEECH_CONSENT_FORM_VERSION,
    withdrawalProcess: 'Contact the governed corpus custodian to withdraw permission.',
    authorizingBody: null,
    consentArtifactRef: null,
    consentArtifactSha256: null,
    notes: null,
    rights,
  };
}

describe('speech consent contract', () => {
  it('starts with no permission, including no permission to retain a recording', () => {
    expect(Object.values(EMPTY_SPEECH_RIGHTS).every((value) => value === false)).toBe(true);
  });

  it('accepts private recording permission without silently granting model use', () => {
    const parsed = SpeechConsentGrantSchema.parse(consent());
    expect(parsed.rights.recordingAllowed).toBe(true);
    expect(parsed.rights.asrEvaluationAllowed).toBe(false);
    expect(parsed.rights.asrTrainingAllowed).toBe(false);
    expect(parsed.rights.ttsTrainingAllowed).toBe(false);
    expect(parsed.rights.publicAudioAllowed).toBe(false);
  });

  it('keeps recognizable voice replication separate from ordinary TTS training', () => {
    const result = SpeechConsentGrantSchema.safeParse(
      consent({
        ...EMPTY_SPEECH_RIGHTS,
        recordingAllowed: true,
        speakerVoiceReplicationAllowed: true,
      }),
    );
    expect(result.success).toBe(false);
  });

  it('requires model creation before model-weight distribution', () => {
    const result = SpeechConsentGrantSchema.safeParse(
      consent({
        ...EMPTY_SPEECH_RIGHTS,
        recordingAllowed: true,
        asrTrainingAllowed: true,
        asrWeightDistributionAllowed: true,
      }),
    );
    expect(result.success).toBe(false);
  });

  it('does not permit hosted transfer without a named speech purpose', () => {
    const result = SpeechConsentGrantSchema.safeParse(
      consent({
        ...EMPTY_SPEECH_RIGHTS,
        recordingAllowed: true,
        hostedProviderTransferAllowed: true,
      }),
    );
    expect(result.success).toBe(false);
  });

  it('derives legacy flags without allowing them to broaden the granular rights', () => {
    expect(
      legacySpeechConsentFlags({
        ...EMPTY_SPEECH_RIGHTS,
        recordingAllowed: true,
        asrEvaluationAllowed: true,
      }),
    ).toEqual({ culturalConsent: false, trainingConsent: false });
    expect(
      legacySpeechConsentFlags({
        ...EMPTY_SPEECH_RIGHTS,
        recordingAllowed: true,
        ttsTrainingAllowed: true,
      }),
    ).toEqual({ culturalConsent: false, trainingConsent: true });
  });
});
