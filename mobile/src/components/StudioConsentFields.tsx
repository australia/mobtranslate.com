import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  setSpeechRight,
  type SpeechConsentGrant,
  type SpeechRights,
} from '../lib/studioConsent';
import { C, F, S, radius } from '../lib/theme';

function PurposeToggle({
  checked, title, description, disabled, onChange,
}: {
  checked: boolean;
  title: string;
  description: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onChange(!checked);
      }}
      style={[styles.toggle, checked && styles.toggleOn, disabled && styles.disabled]}
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={25} color={checked ? C.forest : C.faint} />
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
    </Pressable>
  );
}

function PurposeGroup({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupEyebrow}>{eyebrow}</Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

export function StudioConsentFields({
  value,
  onChange,
  presentConfirmed,
  onPresentConfirmed,
}: {
  value: SpeechConsentGrant;
  onChange: (value: SpeechConsentGrant) => void;
  presentConfirmed: boolean;
  onPresentConfirmed: (value: boolean) => void;
}) {
  const setRight = (key: keyof SpeechRights, checked: boolean) => {
    onChange(setSpeechRight(value, key, checked));
  };
  const modelPurpose = value.rights.asrEvaluationAllowed
    || value.rights.asrTrainingAllowed
    || value.rights.ttsTrainingAllowed;
  const canUseRecording = value.rights.recordingAllowed;

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.intro}>
        <View style={styles.shield}><Ionicons name="shield-checkmark" size={25} color={C.cream} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.introTitle}>Ask about each use separately</Text>
          <Text style={styles.introBody}>Nothing is selected for publication, AI, providers, model creation, sharing, or commercial use by default.</Text>
        </View>
      </View>

      <PurposeGroup eyebrow="TODAY’S RECORDING">
        <PurposeToggle
          checked={value.rights.recordingAllowed}
          onChange={(checked) => setRight('recordingAllowed', checked)}
          title="Make and keep these recordings"
          description="Required for this session. By itself, this does not allow publication, AI training, provider transfer, or a computer voice."
        />
      </PurposeGroup>

      <PurposeGroup eyebrow="PUBLIC LISTENING">
        <PurposeToggle disabled={!canUseRecording} checked={value.rights.publicAudioAllowed} onChange={(checked) => setRight('publicAudioAllowed', checked)} title="Publish the recordings" description="Anyone using Mob Translate may hear these sentence recordings." />
        <PurposeToggle disabled={!canUseRecording} checked={value.rights.publicTranscriptAllowed} onChange={(checked) => setRight('publicTranscriptAllowed', checked)} title="Publish reviewed transcripts" description="The reviewed Kuku Yalanji text may appear in a public dataset." />
      </PurposeGroup>

      <PurposeGroup eyebrow="SPEECH RECOGNITION · A COMPUTER LISTENS">
        <PurposeToggle disabled={!canUseRecording} checked={value.rights.asrEvaluationAllowed} onChange={(checked) => setRight('asrEvaluationAllowed', checked)} title="Test speech recognition" description="Compare automatic transcripts with reviewed transcripts." />
        <PurposeToggle disabled={!canUseRecording} checked={value.rights.asrTrainingAllowed} onChange={(checked) => setRight('asrTrainingAllowed', checked)} title="Train speech recognition" description="Use the recordings to improve a model that listens to Kuku Yalanji." />
        <PurposeToggle disabled={!canUseRecording} checked={value.rights.asrDerivedWeightsAllowed} onChange={(checked) => setRight('asrDerivedWeightsAllowed', checked)} title="Create listening-model weights" description="Keep a trained recognition model derived from these recordings." />
        <PurposeToggle disabled={!canUseRecording} checked={value.rights.asrWeightDistributionAllowed} onChange={(checked) => setRight('asrWeightDistributionAllowed', checked)} title="Share listening-model weights" description="Allow that derived model to be downloaded or hosted by others." />
      </PurposeGroup>

      <PurposeGroup eyebrow="COMPUTER SPEECH · A COMPUTER SPEAKS">
        <PurposeToggle disabled={!canUseRecording} checked={value.rights.ttsTrainingAllowed} onChange={(checked) => setRight('ttsTrainingAllowed', checked)} title="Train Kuku Yalanji computer speech" description="Use the recordings to teach a computer to pronounce Kuku Yalanji text." />
        <PurposeToggle disabled={!canUseRecording} checked={value.rights.speakerVoiceReplicationAllowed} onChange={(checked) => setRight('speakerVoiceReplicationAllowed', checked)} title="Make a voice recognisably like this speaker" description="Separate permission for voice replication. Leave off for a non-identifying shared computer voice." />
        <PurposeToggle disabled={!canUseRecording} checked={value.rights.ttsDerivedWeightsAllowed} onChange={(checked) => setRight('ttsDerivedWeightsAllowed', checked)} title="Create speaking-model weights" description="Keep a trained speaking model derived from these recordings." />
        <PurposeToggle disabled={!canUseRecording} checked={value.rights.ttsWeightDistributionAllowed} onChange={(checked) => setRight('ttsWeightDistributionAllowed', checked)} title="Share speaking-model weights" description="Allow that derived model to be downloaded or hosted by others." />
      </PurposeGroup>

      <PurposeGroup eyebrow="TRANSFER, RESULTS & COMMERCIAL USE">
        <PurposeToggle disabled={!canUseRecording || !modelPurpose} checked={value.rights.hostedProviderTransferAllowed} onChange={(checked) => setRight('hostedProviderTransferAllowed', checked)} title="Send audio to an outside compute provider" description="Allows transfer to RunPod or another hosted GPU provider for an approved selected purpose." />
        <PurposeToggle disabled={!canUseRecording || !modelPurpose} checked={value.rights.publicMetricsAllowed} onChange={(checked) => setRight('publicMetricsAllowed', checked)} title="Publish combined model results" description="Share aggregate accuracy results without publishing this speaker’s audio or transcript." />
        <PurposeToggle disabled={!canUseRecording} checked={value.rights.commercialUseAllowed} onChange={(checked) => setRight('commercialUseAllowed', checked)} title="Allow commercial use" description="Optional and separate. Leave off for non-commercial use only." />
      </PurposeGroup>

      <View style={styles.fields}>
        <Text style={styles.fieldLabel}>How to withdraw permission</Text>
        <TextInput
          value={value.withdrawalProcess}
          onChangeText={(withdrawalProcess) => onChange({ ...value, withdrawalProcess })}
          multiline
          style={styles.textArea}
          placeholderTextColor={C.muted}
        />
        <Text style={styles.fieldLabel}>Authorizing family, organisation, or body (optional)</Text>
        <TextInput
          value={value.authorizingBody ?? ''}
          onChangeText={(authorizingBody) => onChange({ ...value, authorizingBody: authorizingBody || null })}
          style={styles.input}
          placeholder="Record collective authority where relevant"
          placeholderTextColor={C.muted}
        />
        <Text style={styles.fieldLabel}>Consent note (optional)</Text>
        <TextInput
          value={value.notes ?? ''}
          onChangeText={(notes) => onChange({ ...value, notes: notes || null })}
          multiline
          style={styles.textArea}
          placeholder="Questions, limits, family guidance, or other context"
          placeholderTextColor={C.muted}
        />
      </View>

      <PurposeToggle
        checked={presentConfirmed}
        onChange={onPresentConfirmed}
        title="The speaker is here and made these choices"
        description="I asked about each selected use, explained how to withdraw, and recorded their answers without preselecting model or publication rights."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: C.sageSoft, borderWidth: 1, borderColor: C.sageLine },
  shield: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: C.forest, alignItems: 'center', justifyContent: 'center' },
  introTitle: { fontFamily: F.display, fontSize: S.body, color: C.ink },
  introBody: { fontFamily: F.body, fontSize: S.small, lineHeight: 19, color: C.inkSoft, marginTop: 3 },
  group: { gap: 8 },
  groupEyebrow: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.15, color: C.sage },
  toggle: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 13, borderRadius: radius.md, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  toggleOn: { borderColor: C.forest, backgroundColor: C.sageSoft },
  disabled: { opacity: 0.45 },
  toggleTitle: { fontFamily: F.semibold, fontSize: S.label, color: C.ink },
  toggleDescription: { fontFamily: F.body, fontSize: S.small, lineHeight: 19, color: C.muted, marginTop: 2 },
  fields: { gap: 8, padding: 14, borderRadius: radius.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.hair },
  fieldLabel: { fontFamily: F.semibold, fontSize: S.small, color: C.ink, marginTop: 4 },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, paddingHorizontal: 13, fontFamily: F.body, fontSize: S.label, color: C.ink },
  textArea: { minHeight: 82, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: 13, fontFamily: F.body, fontSize: S.small, lineHeight: 19, color: C.ink, textAlignVertical: 'top' },
});
