// Encode raw Float32 PCM into a 16-bit PCM WAV blob (lossless master).
//
// Web Audio delivers samples as Float32 in [-1, 1]. We write a standard
// 44-byte RIFF/WAVE header followed by interleaved little-endian 16-bit
// samples — the universal, broadly-playable archival format for speech.

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * @param channels One Float32Array per channel (all the same length).
 * @param sampleRate Sample rate in Hz (e.g. 48000).
 */
export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const numChannels = Math.max(1, channels.length);
  const numFrames = channels[0]?.length ?? 0;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave + quantize to 16-bit
  let offset = 44;
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channels[ch][frame];
      // clamp then scale; asymmetric scaling avoids overflow at +1.0
      sample = sample < -1 ? -1 : sample > 1 ? 1 : sample;
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

/** Concatenate a list of Float32 chunks into one contiguous buffer. */
export function mergeChunks(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
