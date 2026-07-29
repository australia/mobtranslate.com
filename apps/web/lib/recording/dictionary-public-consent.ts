import {
  EMPTY_SPEECH_RIGHTS,
  SPEECH_CONSENT_FORM_VERSION,
  type SpeechRights,
} from '@/lib/recording/speech-consent';

/** Ordinary dictionary contribution is deliberately narrow: Mob Translate may
 * keep the clip and play it beside its public word/sentence. It grants no model
 * evaluation, training, provider transfer, voice replication, weight creation,
 * commercial reuse, or public metrics permission. */
export const PUBLIC_DICTIONARY_SPEECH_RIGHTS: SpeechRights = Object.freeze({
  ...EMPTY_SPEECH_RIGHTS,
  recordingAllowed: true,
  publicAudioAllowed: true,
  publicTranscriptAllowed: true,
});

export const PUBLIC_DICTIONARY_CONSENT_FORM_VERSION = SPEECH_CONSENT_FORM_VERSION;

export const PUBLIC_DICTIONARY_WITHDRAWAL_PROCESS =
  'Withdraw in Mob Translate under You → Voice sharing permission, use the account-deletion form, or email hello@mobtranslate.com.';

export const PUBLIC_DICTIONARY_CONSENT_NOTE =
  'Self-service dictionary contribution. The contributor confirmed they are the recorded speaker and have permission to share the recording and language content publicly.';

export function isNarrowPublicDictionaryConsent(rights: SpeechRights): boolean {
  return Object.entries(PUBLIC_DICTIONARY_SPEECH_RIGHTS).every(
    ([key, value]) => rights[key as keyof SpeechRights] === value,
  );
}
