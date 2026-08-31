import {
  findUniqueExactDictionaryMatch,
  type ExactDictionaryIndex,
  type ExactDictionaryMatch,
} from './dictionary-exact.server';

export interface ControlledConstructionSpec {
  id: string;
  sourceTemplate: string;
  modelTemplate: string;
}

export interface ControlledTranslationSpec {
  contractId: string;
  task: string;
  slotToken: string;
  constructions: readonly ControlledConstructionSpec[];
}

export interface ControlledTranslationRequest {
  contractId: string;
  constructionId: string;
  task: string;
  modelText: string;
  modelTemplate: string;
  bindings: Record<string, string>;
  dictionaryMatch: ExactDictionaryMatch;
}

function normalizeSentence(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');
}

function splitTemplate(
  template: string,
  slotToken: string,
): { prefix: string; suffix: string } {
  const first = template.indexOf(slotToken);
  if (first < 0 || first !== template.lastIndexOf(slotToken)) {
    throw new Error('Controlled source template must contain exactly one slot.');
  }
  return {
    prefix: normalizeSentence(template.slice(0, first)),
    suffix: normalizeSentence(template.slice(first + slotToken.length)),
  };
}

function extractSubject(
  source: string,
  construction: ControlledConstructionSpec,
  slotToken: string,
): string | null {
  const normalized = normalizeSentence(source);
  const { prefix, suffix } = splitTemplate(
    construction.sourceTemplate,
    slotToken,
  );
  const prefixWithSpace = prefix ? `${prefix} ` : '';
  const suffixWithSpace = suffix ? ` ${suffix}` : '';
  if (
    !normalized.startsWith(prefixWithSpace) ||
    !normalized.endsWith(suffixWithSpace)
  ) {
    return null;
  }
  const end = normalized.length - suffixWithSpace.length;
  const subject = normalized.slice(prefixWithSpace.length, end).trim();
  return subject || null;
}

export function resolveControlledTranslation(
  source: string,
  dictionaryIndex: ExactDictionaryIndex,
  spec: ControlledTranslationSpec,
): ControlledTranslationRequest | null {
  if (!spec.contractId || !spec.task || !spec.slotToken) {
    throw new Error('Controlled translation contract identity is incomplete.');
  }
  const matches = spec.constructions.flatMap((construction) => {
    const subject = extractSubject(source, construction, spec.slotToken);
    if (!subject) return [];
    const dictionaryMatch = findUniqueExactDictionaryMatch(
      subject,
      dictionaryIndex,
    );
    return dictionaryMatch ? [{ construction, dictionaryMatch }] : [];
  });
  if (matches.length !== 1) return null;

  const [{ construction, dictionaryMatch }] = matches;
  if (construction.modelTemplate.split(spec.slotToken).length !== 2) {
    throw new Error('Controlled model template must contain exactly one slot.');
  }
  return {
    contractId: spec.contractId,
    constructionId: construction.id,
    task: spec.task,
    modelText: construction.sourceTemplate,
    modelTemplate: construction.modelTemplate,
    bindings: { [spec.slotToken]: dictionaryMatch.word },
    dictionaryMatch,
  };
}

export function renderExpectedControlledTranslation(
  request: ControlledTranslationRequest,
): string {
  let output = request.modelTemplate;
  for (const [token, value] of Object.entries(request.bindings)) {
    if (output.split(token).length !== 2) {
      throw new Error('Controlled model template does not match its bindings.');
    }
    output = output.replace(token, value);
  }
  return output.replace(/\s+/g, ' ').trim();
}
