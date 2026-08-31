import { createHash } from 'node:crypto';

export interface AppendOnlyLedgerVerification {
  verifiedBytes: Buffer;
  currentSha256: string;
  verificationMode: 'exact_file' | 'historical_prefix';
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function verifyAppendOnlyLedger(
  currentBytes: Buffer,
  expectedHistoricalSha256: string,
): AppendOnlyLedgerVerification {
  const currentSha256 = sha256(currentBytes);
  if (currentSha256 === expectedHistoricalSha256)
    return {
      verifiedBytes: currentBytes,
      currentSha256,
      verificationMode: 'exact_file',
    };

  for (let offset = 0; offset < currentBytes.length; offset += 1) {
    if (currentBytes[offset] !== 0x0a) continue;
    const prefix = currentBytes.subarray(0, offset + 1);
    if (sha256(prefix) === expectedHistoricalSha256)
      return {
        verifiedBytes: prefix,
        currentSha256,
        verificationMode: 'historical_prefix',
      };
  }

  throw new Error(
    `append-only ledger does not contain historical hash ${expectedHistoricalSha256}; current hash is ${currentSha256}`,
  );
}
