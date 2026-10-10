// Shared (client + server) shape of a community contribution to a Country page.
import { z } from 'zod';

export const CONTRIBUTION_KINDS = ['photo', 'note', 'page'] as const;
export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

export const KIND_LABELS: Record<ContributionKind, string> = {
  photo: 'Photo from country',
  note: 'Words, uses, corrections',
  page: 'Proposed new page',
};

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export const contributionTargetSchema = z.string().regex(/^(?:(?:entry|place):[a-z0-9]+(?:-[a-z0-9]+)*|new)$/);

const text = (max: number) => z.string().trim().max(max);

export const contributionFieldsSchema = z
  .object({
    language: z.string().regex(/^[a-z_]+$/),
    target: contributionTargetSchema,
    kind: z.enum(CONTRIBUTION_KINDS),
    name: text(80).min(1, 'Please add your name'),
    title: text(120).optional(),
    words: text(500).optional(),
    body: text(8000).optional(),
    where: text(200).optional(),
    when: text(80).optional(),
  })
  .superRefine((fields, ctx) => {
    if ((fields.kind === 'page') !== (fields.target === 'new')) {
      ctx.addIssue({ code: 'custom', message: 'A new page proposal has no target page, and other contributions need one', path: ['target'] });
    }
    if (fields.kind === 'note' && !fields.body) {
      ctx.addIssue({ code: 'custom', message: 'Write what you know', path: ['body'] });
    }
    if (fields.kind === 'page') {
      if (!fields.title) ctx.addIssue({ code: 'custom', message: 'Give the page a name', path: ['title'] });
      if (!fields.body) ctx.addIssue({ code: 'custom', message: 'Say what it is and what it is for', path: ['body'] });
    }
    if (fields.kind === 'photo' && (fields.body?.length ?? 0) > 500) {
      ctx.addIssue({ code: 'custom', message: 'Keep the caption under 500 characters', path: ['body'] });
    }
  });

export type ContributionFields = z.infer<typeof contributionFieldsSchema>;

// What the API returns and the page renders.
export type Contribution = {
  id: string;
  language: string;
  target: string;
  kind: ContributionKind;
  userId: string | null;
  name: string;
  title: string | null;
  words: string | null;
  body: string | null;
  where: string | null;
  when: string | null;
  photoUrl: string | null;
  photoWidth: number | null;
  photoHeight: number | null;
  createdAt: string;
};
