export type TranslationFailureKind =
  | 'provider_rate_limited'
  | 'provider_authentication'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'internal_error';

export interface SafeTranslationErrorDiagnostic {
  kind: TranslationFailureKind;
  name: string;
  statusCode?: number;
  code?: string;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9_.-]{1,80}$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_IDENTIFIER.test(value)
    ? value
    : undefined;
}

function errorNodes(error: unknown): Record<string, unknown>[] {
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  const nodes: Record<string, unknown>[] = [];

  while (queue.length > 0 && nodes.length < 12) {
    const value = queue.shift();
    if (seen.has(value)) continue;
    seen.add(value);
    const node = record(value);
    if (!node) continue;
    nodes.push(node);

    if (node.cause) queue.push(node.cause);
    if (node.lastError) queue.push(node.lastError);
    if (Array.isArray(node.errors)) queue.push(...node.errors.slice(-4));
    const data = record(node.data);
    if (data) {
      queue.push(data);
      if (data.error) queue.push(data.error);
    }
  }
  return nodes;
}

export function safeTranslationErrorDiagnostic(
  error: unknown,
): SafeTranslationErrorDiagnostic {
  const nodes = errorNodes(error);
  const names = nodes
    .map((node) => safeIdentifier(node.name))
    .filter((value): value is string => Boolean(value));
  const statuses = nodes
    .flatMap((node) => [node.statusCode, node.status])
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isInteger(value),
    );
  const codes = nodes
    .flatMap((node) => [node.code, node.type])
    .map(safeIdentifier)
    .filter((value): value is string => Boolean(value));

  const statusCode = statuses[0];
  const code = codes[0];
  const name =
    names[0] ?? (error instanceof Error ? error.name : 'UnknownError');
  const lowerNames = names.map((value) => value.toLocaleLowerCase());
  const lowerCodes = codes.map((value) => value.toLocaleLowerCase());

  let kind: TranslationFailureKind = 'internal_error';
  if (
    statuses.includes(429) ||
    lowerCodes.some(
      (value) => value.includes('rate_limit') || value.includes('quota'),
    )
  ) {
    kind = 'provider_rate_limited';
  } else if (
    statuses.some((value) => value === 401 || value === 403) ||
    lowerCodes.some(
      (value) => value.includes('api_key') || value.includes('auth'),
    )
  ) {
    kind = 'provider_authentication';
  } else if (
    statuses.some((value) => value === 408 || value === 504) ||
    lowerNames.some(
      (value) => value.includes('timeout') || value.includes('abort'),
    )
  ) {
    kind = 'provider_timeout';
  } else if (
    statuses.some((value) => value >= 500) ||
    lowerNames.some(
      (value) =>
        value.startsWith('ai_') ||
        value.includes('apicall') ||
        value.includes('retryerror') ||
        value.includes('inferenceerror'),
    )
  ) {
    kind = 'provider_unavailable';
  }

  return {
    kind,
    name: SAFE_IDENTIFIER.test(name) ? name : 'UnknownError',
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(code === undefined ? {} : { code }),
  };
}

export function isTranslationProviderFailure(
  diagnostic: SafeTranslationErrorDiagnostic,
): boolean {
  return diagnostic.kind !== 'internal_error';
}

export const TRANSLATION_UNAVAILABLE_MESSAGE =
  'Translation is temporarily unavailable. Please try again later.';
