import { z } from 'zod';

export {
  KUKU_YALANJI_VOICE_PROMPTS,
  REQUIRED_KUKU_YALANJI_VOICE_PROMPTS,
  type KukuYalanjiVoicePrompt,
  type KukuYalanjiVoicePromptId,
} from './kuku-yalanji-speech-prompts';

export const KukuYalanjiAsrResultSchema = z.object({
  success: z.literal(true),
  transcript: z.string().trim().min(1).max(600),
  language: z.literal('kuku_yalanji'),
  model: z.literal('omniASR_LLM_7B_ZS'),
  validation: z.literal('experimental_same_speaker_voice_examples'),
  decoder: z.object({ beamSize: z.number().int().min(1).max(10) }),
  timing: z.object({
    queueMs: z.number().int().nonnegative(),
    inferenceMs: z.number().int().nonnegative(),
    workerModelLoadMs: z.number().int().nonnegative().optional(),
  }),
  audio: z.object({
    target: z.object({
      duration_seconds: z.number().positive().max(30),
      sample_rate: z.number().int().min(8_000).max(96_000),
      channels: z.number().int().min(1).max(2),
      sample_width_bytes: z.number().int().min(1).max(4),
    }),
    contextCount: z.number().int().min(1).max(10),
    contextSeconds: z.number().nonnegative(),
    retained: z.literal(false),
  }),
});

export const KukuYalanjiAsrPendingSchema = z.object({
  success: z.literal(true),
  status: z.literal('pending'),
  pollToken: z.string().min(32).max(512),
  retryAfterMs: z.number().int().min(1_000).max(10_000),
});

export const KukuYalanjiAsrResponseSchema = z.union([
  KukuYalanjiAsrResultSchema,
  KukuYalanjiAsrPendingSchema,
]);

export type KukuYalanjiAsrResult = z.infer<typeof KukuYalanjiAsrResultSchema>;

export const KukuYalanjiConversationTurnSchema = z.object({
  transcript: z.string().trim().min(1).max(600),
  understanding: z.string().trim().min(1).max(600),
  replyEnglish: z.string().trim().min(1).max(300),
  replyKuku: z.string().trim().min(1).max(600),
});

export const KukuYalanjiReplyRequestSchema = z.object({
  transcript: z.string().trim().min(1).max(600),
  history: z.array(KukuYalanjiConversationTurnSchema).max(4).default([]),
});

export const KukuYalanjiReplyEvidenceSchema = z.object({
  heard: z.string().trim().min(1),
  headword: z.string().trim().min(1),
  gloss: z.string().trim().min(1),
  similarity: z.number().min(0).max(1),
  exact: z.boolean(),
});

export const KukuYalanjiReplyToolSchema = z.object({
  understanding: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .describe(
      'A cautious, plain-English account of what the speaker may have said',
    ),
  replyEnglish: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe('A warm, natural English reply of no more than twelve words'),
  confidence: z.enum(['low', 'medium']),
  note: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .describe('One short plain-English reason for the confidence level'),
  evidenceHeadwords: z.array(z.string().trim().min(1)).max(8),
});

export const KukuYalanjiReplyResponseSchema = z.object({
  success: z.literal(true),
  ...KukuYalanjiReplyToolSchema.shape,
  evidence: z.array(KukuYalanjiReplyEvidenceSchema).max(48),
  validation: z.literal('unverified_dictionary_assisted_interpretation'),
});

export type KukuYalanjiReplyResponse = z.infer<
  typeof KukuYalanjiReplyResponseSchema
>;
