import { z } from 'zod';

export const SPEECH_CONSENT_FORM_VERSION = 'mobtranslate-speech-v1';

export const SpeechRightsSchema = z
  .object({
    recordingAllowed: z.boolean(),
    asrEvaluationAllowed: z.boolean(),
    asrTrainingAllowed: z.boolean(),
    hostedProviderTransferAllowed: z.boolean(),
    publicMetricsAllowed: z.boolean(),
    publicAudioAllowed: z.boolean(),
    publicTranscriptAllowed: z.boolean(),
    asrDerivedWeightsAllowed: z.boolean(),
    asrWeightDistributionAllowed: z.boolean(),
    ttsTrainingAllowed: z.boolean(),
    speakerVoiceReplicationAllowed: z.boolean(),
    ttsDerivedWeightsAllowed: z.boolean(),
    ttsWeightDistributionAllowed: z.boolean(),
    commercialUseAllowed: z.boolean(),
  })
  .strict()
  .superRefine((rights, context) => {
    if (!rights.recordingAllowed) {
      context.addIssue({
        code: 'custom',
        path: ['recordingAllowed'],
        message: 'Permission to make and keep the recordings is required.',
      });
    }
    if (rights.asrDerivedWeightsAllowed && !rights.asrTrainingAllowed) {
      context.addIssue({
        code: 'custom',
        path: ['asrDerivedWeightsAllowed'],
        message: 'ASR model creation requires ASR training permission.',
      });
    }
    if (rights.asrWeightDistributionAllowed && !rights.asrDerivedWeightsAllowed) {
      context.addIssue({
        code: 'custom',
        path: ['asrWeightDistributionAllowed'],
        message: 'ASR weight sharing requires permission to create ASR weights.',
      });
    }
    if (rights.speakerVoiceReplicationAllowed && !rights.ttsTrainingAllowed) {
      context.addIssue({
        code: 'custom',
        path: ['speakerVoiceReplicationAllowed'],
        message: 'Voice replication requires TTS training permission.',
      });
    }
    if (rights.ttsDerivedWeightsAllowed && !rights.ttsTrainingAllowed) {
      context.addIssue({
        code: 'custom',
        path: ['ttsDerivedWeightsAllowed'],
        message: 'TTS model creation requires TTS training permission.',
      });
    }
    if (rights.ttsWeightDistributionAllowed && !rights.ttsDerivedWeightsAllowed) {
      context.addIssue({
        code: 'custom',
        path: ['ttsWeightDistributionAllowed'],
        message: 'TTS weight sharing requires permission to create TTS weights.',
      });
    }
    if (
      rights.hostedProviderTransferAllowed &&
      !rights.asrEvaluationAllowed &&
      !rights.asrTrainingAllowed &&
      !rights.ttsTrainingAllowed
    ) {
      context.addIssue({
        code: 'custom',
        path: ['hostedProviderTransferAllowed'],
        message: 'Provider transfer needs an explicitly permitted speech purpose.',
      });
    }
  });

export const SpeechConsentGrantSchema = z
  .object({
    consentFormVersion: z.literal(SPEECH_CONSENT_FORM_VERSION),
    withdrawalProcess: z.string().trim().min(10).max(2000),
    authorizingBody: z.string().trim().max(500).nullable().optional(),
    consentArtifactRef: z.string().trim().max(2000).nullable().optional(),
    consentArtifactSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable()
      .optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    rights: SpeechRightsSchema,
  })
  .strict();

export type SpeechRights = z.infer<typeof SpeechRightsSchema>;
export type SpeechConsentGrant = z.infer<typeof SpeechConsentGrantSchema>;

export const EMPTY_SPEECH_RIGHTS: SpeechRights = Object.freeze({
  recordingAllowed: false,
  asrEvaluationAllowed: false,
  asrTrainingAllowed: false,
  hostedProviderTransferAllowed: false,
  publicMetricsAllowed: false,
  publicAudioAllowed: false,
  publicTranscriptAllowed: false,
  asrDerivedWeightsAllowed: false,
  asrWeightDistributionAllowed: false,
  ttsTrainingAllowed: false,
  speakerVoiceReplicationAllowed: false,
  ttsDerivedWeightsAllowed: false,
  ttsWeightDistributionAllowed: false,
  commercialUseAllowed: false,
});

export function legacySpeechConsentFlags(rights: SpeechRights): {
  culturalConsent: boolean;
  trainingConsent: boolean;
} {
  return {
    culturalConsent: rights.publicAudioAllowed,
    trainingConsent: rights.asrTrainingAllowed || rights.ttsTrainingAllowed,
  };
}
