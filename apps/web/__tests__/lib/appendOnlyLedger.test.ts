import { createHash } from 'node:crypto';
import { verifyAppendOnlyLedger } from '@/lib/research/appendOnlyLedger';

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('append-only ledger verification', () => {
  const historical = Buffer.from('{"id":1}\n{"id":2}\n');

  it('accepts the exact historical file', () => {
    const result = verifyAppendOnlyLedger(historical, sha256(historical));

    expect(result.verificationMode).toBe('exact_file');
    expect(result.verifiedBytes).toEqual(historical);
  });

  it('recovers only a line-complete historical prefix', () => {
    const current = Buffer.concat([historical, Buffer.from('{"id":3}\n')]);
    const result = verifyAppendOnlyLedger(current, sha256(historical));

    expect(result.verificationMode).toBe('historical_prefix');
    expect(result.verifiedBytes).toEqual(historical);
  });

  it('rejects rewritten history', () => {
    const rewritten = Buffer.from('{"id":9}\n{"id":2}\n{"id":3}\n');

    expect(() => verifyAppendOnlyLedger(rewritten, sha256(historical))).toThrow(
      'does not contain historical hash',
    );
  });
});
