// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  isTranslationProviderFailure,
  safeTranslationErrorDiagnostic,
} from '../../lib/translation-service-error.server';

describe('translation service error sanitization', () => {
  it('unwraps a retry error without retaining provider payloads or headers', () => {
    const diagnostic = safeTranslationErrorDiagnostic({
      name: 'AI_RetryError',
      message: 'secret response body',
      errors: [
        {
          name: 'AI_APICallError',
          statusCode: 429,
          responseHeaders: { authorization: 'secret' },
          responseBody: '{"error":{"code":"insufficient_quota"}}',
          data: { error: { code: 'insufficient_quota' } },
        },
      ],
    });

    expect(diagnostic).toEqual({
      kind: 'provider_rate_limited',
      name: 'AI_RetryError',
      statusCode: 429,
      code: 'insufficient_quota',
    });
    expect(JSON.stringify(diagnostic)).not.toContain('secret');
    expect(isTranslationProviderFailure(diagnostic)).toBe(true);
  });

  it('classifies aborts as provider timeouts', () => {
    expect(
      safeTranslationErrorDiagnostic(
        new DOMException('timed out', 'TimeoutError'),
      ),
    ).toMatchObject({ kind: 'provider_timeout', name: 'TimeoutError' });
  });

  it('keeps ordinary application errors separate from provider failures', () => {
    const diagnostic = safeTranslationErrorDiagnostic(
      new Error('unexpected invariant'),
    );
    expect(diagnostic).toEqual({ kind: 'internal_error', name: 'Error' });
    expect(isTranslationProviderFailure(diagnostic)).toBe(false);
  });
});
