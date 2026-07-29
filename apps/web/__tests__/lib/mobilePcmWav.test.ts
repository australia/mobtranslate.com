import { describe, expect, it } from 'vitest';
import { encodeMonoPcm16Wav } from '../../../../mobile/src/lib/pcm-wav';
import { inspectPcmWav } from '@/lib/recording/wav-inspect.server';

describe('mobile PCM WAV encoding', () => {
  it('produces the mono 16-bit WAV contract accepted by the governed upload', () => {
    const samples = new Int16Array(16_000);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.round(Math.sin(index / 12) * 12_000);
    }

    const encoded = encodeMonoPcm16Wav([{
      bytes: new Uint8Array(samples.buffer),
      sampleRate: 16_000,
      channels: 1,
    }]);
    const measured = inspectPcmWav(Buffer.from(encoded.bytes));

    expect(measured).toMatchObject({
      sampleRate: 16_000,
      channels: 1,
      bitDepth: 16,
      durationMs: 1_000,
      clipped: false,
    });
    expect(measured.peakAmplitude).toBeCloseTo(encoded.peakAmplitude, 4);
  });

  it('downmixes interleaved stereo without changing duration', () => {
    const stereo = new Int16Array([
      10_000, -10_000,
      8_000, 4_000,
      -8_000, -4_000,
      0, 0,
    ]);
    const encoded = encodeMonoPcm16Wav([{
      bytes: new Uint8Array(stereo.buffer),
      sampleRate: 8_000,
      channels: 2,
    }]);
    const pcm = new DataView(encoded.bytes.buffer, 44);

    expect(encoded.durationMs).toBe(1);
    expect(encoded.channels).toBe(1);
    expect([
      pcm.getInt16(0, true),
      pcm.getInt16(2, true),
      pcm.getInt16(4, true),
      pcm.getInt16(6, true),
    ]).toEqual([0, 6_000, -6_000, 0]);
  });
});
