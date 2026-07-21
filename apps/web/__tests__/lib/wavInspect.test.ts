// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { inspectPcmWav } from '@/lib/recording/wav-inspect.server';

function wav(samples: number[], sampleRate = 16_000): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2));
  return buffer;
}

describe('PCM WAV inspection', () => {
  it('derives authoritative audio metadata and clipping from PCM samples', () => {
    const result = inspectPcmWav(wav(new Array(16_000).fill(0).map((_, i) => (i === 10 ? 32767 : 1000))));
    expect(result).toEqual({
      sampleRate: 16_000,
      channels: 1,
      bitDepth: 16,
      durationMs: 1000,
      peakAmplitude: 1,
      clipped: true,
    });
  });

  it('rejects non-WAV input', () => {
    expect(() => inspectPcmWav(Buffer.from('not audio'))).toThrow('invalid_wav_header');
  });

  it('rejects stereo input from outside the governed recorder', () => {
    const input = wav([0, 0]);
    input.writeUInt16LE(2, 22);
    input.writeUInt16LE(4, 32);
    expect(() => inspectPcmWav(input)).toThrow('unsupported_wav_format');
  });
});
