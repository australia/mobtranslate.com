export interface Pcm16Chunk {
  bytes: Uint8Array;
  sampleRate: number;
  channels: number;
}

export interface EncodedPcmWav {
  bytes: Uint8Array;
  sampleRate: number;
  channels: 1;
  bitDepth: 16;
  durationMs: number;
  peakAmplitude: number;
  clipped: boolean;
}

function fourCc(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

/** Wrap Expo AudioStream's little-endian int16 PCM buffers in a canonical
 * mono WAV. Hardware that returns stereo is downmixed frame-by-frame. */
export function encodeMonoPcm16Wav(chunks: Pcm16Chunk[]): EncodedPcmWav {
  if (chunks.length === 0) throw new Error('No microphone audio was captured.');
  const sampleRate = chunks[0].sampleRate;
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) {
    throw new Error('The microphone returned an unsupported sample rate.');
  }

  let frames = 0;
  for (const chunk of chunks) {
    if (chunk.sampleRate !== sampleRate || !Number.isInteger(chunk.channels) || chunk.channels < 1) {
      throw new Error('The microphone format changed during recording.');
    }
    const frameBytes = chunk.channels * 2;
    if (chunk.bytes.byteLength === 0 || chunk.bytes.byteLength % frameBytes !== 0) {
      throw new Error('The microphone returned an incomplete PCM buffer.');
    }
    frames += chunk.bytes.byteLength / frameBytes;
  }
  if (frames === 0) throw new Error('No microphone audio was captured.');

  const dataSize = frames * 2;
  const output = new Uint8Array(44 + dataSize);
  const view = new DataView(output.buffer);
  fourCc(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  fourCc(view, 8, 'WAVE');
  fourCc(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  fourCc(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let targetOffset = 44;
  let peak = 0;
  for (const chunk of chunks) {
    const source = new DataView(chunk.bytes.buffer, chunk.bytes.byteOffset, chunk.bytes.byteLength);
    const chunkFrames = chunk.bytes.byteLength / (chunk.channels * 2);
    for (let frame = 0; frame < chunkFrames; frame += 1) {
      let total = 0;
      for (let channel = 0; channel < chunk.channels; channel += 1) {
        total += source.getInt16((frame * chunk.channels + channel) * 2, true);
      }
      const sample = Math.max(-32768, Math.min(32767, Math.round(total / chunk.channels)));
      view.setInt16(targetOffset, sample, true);
      targetOffset += 2;
      peak = Math.max(peak, Math.abs(sample));
    }
  }

  return {
    bytes: output,
    sampleRate,
    channels: 1,
    bitDepth: 16,
    durationMs: Math.round((frames / sampleRate) * 1000),
    peakAmplitude: Number((peak / 32768).toFixed(4)),
    clipped: peak >= 32767,
  };
}
