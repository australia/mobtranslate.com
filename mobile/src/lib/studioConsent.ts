export const SPEECH_CONSENT_FORM_VERSION = 'mobtranslate-speech-v1' as const;

export interface SpeechRights {
  recordingAllowed: boolean;
  asrEvaluationAllowed: boolean;
  asrTrainingAllowed: boolean;
  hostedProviderTransferAllowed: boolean;
  publicMetricsAllowed: boolean;
  publicAudioAllowed: boolean;
  publicTranscriptAllowed: boolean;
  asrDerivedWeightsAllowed: boolean;
  asrWeightDistributionAllowed: boolean;
  ttsTrainingAllowed: boolean;
  speakerVoiceReplicationAllowed: boolean;
  ttsDerivedWeightsAllowed: boolean;
  ttsWeightDistributionAllowed: boolean;
  commercialUseAllowed: boolean;
}

export interface SpeechConsentGrant {
  consentFormVersion: typeof SPEECH_CONSENT_FORM_VERSION;
  withdrawalProcess: string;
  authorizingBody?: string | null;
  consentArtifactRef?: string | null;
  consentArtifactSha256?: string | null;
  notes?: string | null;
  rights: SpeechRights;
}

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

export const STUDIO_WITHDRAWAL_PROCESS =
  'Tell the recording operator or email ajax@mobtranslate.com to record a withdrawal. Mob Translate will stop future capture, publication, training, and project export under this permission. Copies or model artefacts already distributed may be outside Mob Translate’s control.';

export function emptyStudioConsent(): SpeechConsentGrant {
  return {
    consentFormVersion: SPEECH_CONSENT_FORM_VERSION,
    withdrawalProcess: STUDIO_WITHDRAWAL_PROCESS,
    authorizingBody: null,
    consentArtifactRef: 'app:curator-in-person',
    consentArtifactSha256: null,
    notes: null,
    rights: { ...EMPTY_SPEECH_RIGHTS },
  };
}

type ConsentSnapshot = Partial<Record<
  | 'recording_allowed'
  | 'asr_evaluation_allowed'
  | 'asr_training_allowed'
  | 'hosted_provider_transfer_allowed'
  | 'public_metrics_allowed'
  | 'public_audio_allowed'
  | 'public_transcript_allowed'
  | 'asr_derived_weights_allowed'
  | 'asr_weight_distribution_allowed'
  | 'tts_training_allowed'
  | 'speaker_voice_replication_allowed'
  | 'tts_derived_weights_allowed'
  | 'tts_weight_distribution_allowed'
  | 'commercial_use_allowed',
  boolean | null
>> & {
  withdrawal_process?: string | null;
  authorizing_body?: string | null;
  consent_artifact_ref?: string | null;
  consent_artifact_sha256?: string | null;
  consent_notes?: string | null;
};

export function studioConsentFromSnapshot(snapshot: ConsentSnapshot): SpeechConsentGrant {
  return {
    ...emptyStudioConsent(),
    withdrawalProcess: snapshot.withdrawal_process || STUDIO_WITHDRAWAL_PROCESS,
    authorizingBody: snapshot.authorizing_body ?? null,
    // A replacement made in the app is its own speaker-present artefact. The
    // superseded ledger event retains any earlier paper reference and hash.
    consentArtifactRef: 'app:curator-in-person',
    consentArtifactSha256: null,
    notes: snapshot.consent_notes ?? null,
    rights: {
      recordingAllowed: snapshot.recording_allowed === true,
      asrEvaluationAllowed: snapshot.asr_evaluation_allowed === true,
      asrTrainingAllowed: snapshot.asr_training_allowed === true,
      hostedProviderTransferAllowed: snapshot.hosted_provider_transfer_allowed === true,
      publicMetricsAllowed: snapshot.public_metrics_allowed === true,
      publicAudioAllowed: snapshot.public_audio_allowed === true,
      publicTranscriptAllowed: snapshot.public_transcript_allowed === true,
      asrDerivedWeightsAllowed: snapshot.asr_derived_weights_allowed === true,
      asrWeightDistributionAllowed: snapshot.asr_weight_distribution_allowed === true,
      ttsTrainingAllowed: snapshot.tts_training_allowed === true,
      speakerVoiceReplicationAllowed: snapshot.speaker_voice_replication_allowed === true,
      ttsDerivedWeightsAllowed: snapshot.tts_derived_weights_allowed === true,
      ttsWeightDistributionAllowed: snapshot.tts_weight_distribution_allowed === true,
      commercialUseAllowed: snapshot.commercial_use_allowed === true,
    },
  };
}

export function setSpeechRight(
  consent: SpeechConsentGrant,
  key: keyof SpeechRights,
  checked: boolean,
): SpeechConsentGrant {
  const rights = { ...consent.rights, [key]: checked };
  if (key === 'recordingAllowed' && !checked) {
    Object.assign(rights, EMPTY_SPEECH_RIGHTS);
  }
  if (key === 'asrTrainingAllowed' && !checked) {
    rights.asrDerivedWeightsAllowed = false;
    rights.asrWeightDistributionAllowed = false;
  }
  if (key === 'asrDerivedWeightsAllowed') {
    if (checked) rights.asrTrainingAllowed = true;
    else rights.asrWeightDistributionAllowed = false;
  }
  if (key === 'asrWeightDistributionAllowed' && checked) {
    rights.asrTrainingAllowed = true;
    rights.asrDerivedWeightsAllowed = true;
  }
  if (key === 'ttsTrainingAllowed' && !checked) {
    rights.speakerVoiceReplicationAllowed = false;
    rights.ttsDerivedWeightsAllowed = false;
    rights.ttsWeightDistributionAllowed = false;
  }
  if (key === 'ttsDerivedWeightsAllowed') {
    if (checked) rights.ttsTrainingAllowed = true;
    else rights.ttsWeightDistributionAllowed = false;
  }
  if (key === 'ttsWeightDistributionAllowed' && checked) {
    rights.ttsTrainingAllowed = true;
    rights.ttsDerivedWeightsAllowed = true;
  }
  if (key === 'speakerVoiceReplicationAllowed' && checked) rights.ttsTrainingAllowed = true;
  if (
    key !== 'hostedProviderTransferAllowed'
    && !rights.asrEvaluationAllowed
    && !rights.asrTrainingAllowed
    && !rights.ttsTrainingAllowed
  ) {
    rights.hostedProviderTransferAllowed = false;
    rights.publicMetricsAllowed = false;
  }
  return { ...consent, rights };
}

const USE_LABELS: Array<[keyof SpeechRights, string]> = [
  ['recordingAllowed', 'make and keep today’s recordings'],
  ['publicAudioAllowed', 'publish the recordings for listening'],
  ['publicTranscriptAllowed', 'publish reviewed transcripts'],
  ['asrEvaluationAllowed', 'test speech recognition'],
  ['asrTrainingAllowed', 'train speech recognition'],
  ['ttsTrainingAllowed', 'train Kuku Yalanji computer speech'],
  ['speakerVoiceReplicationAllowed', 'make a voice recognisably like this speaker'],
  ['hostedProviderTransferAllowed', 'send audio to an outside compute provider'],
  ['asrDerivedWeightsAllowed', 'create speech-recognition model weights'],
  ['asrWeightDistributionAllowed', 'share speech-recognition model weights'],
  ['ttsDerivedWeightsAllowed', 'create computer-speech model weights'],
  ['ttsWeightDistributionAllowed', 'share computer-speech model weights'],
  ['publicMetricsAllowed', 'publish combined model results'],
  ['commercialUseAllowed', 'allow commercial use'],
];

export function selectedSpeechUses(rights: SpeechRights): string[] {
  return USE_LABELS.filter(([key]) => rights[key]).map(([, label]) => label);
}
