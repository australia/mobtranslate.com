export type PcmWavMetadata = {
  sampleRate: number;
  channels: number;
  bitDepth: 16;
  durationMs: number;
  peakAmplitude: number;
  clipped: boolean;
};

function chunkName(buffer: Buffer, offset: number): string {
  return buffer.toString('ascii', offset, offset + 4);
}

/** Validate and measure the browser studio's archival 16-bit PCM WAV. */
export function inspectPcmWav(buffer: Buffer): PcmWavMetadata {
  if (
    buffer.length < 44 ||
    chunkName(buffer, 0) !== 'RIFF' ||
    chunkName(buffer, 8) !== 'WAVE'
  ) {
    throw new Error('invalid_wav_header');
  }

  const declaredLength = buffer.readUInt32LE(4) + 8;
  if (declaredLength > buffer.length || declaredLength < 44) {
    throw new Error('invalid_wav_length');
  }

  let format: {
    audioFormat: number;
    channels: number;
    sampleRate: number;
    byteRate: number;
    blockAlign: number;
    bitDepth: number;
  } | null = null;
  let dataOffset = -1;
  let dataSize = 0;

  for (let offset = 12; offset + 8 <= declaredLength; ) {
    const name = chunkName(buffer, offset);
    const size = buffer.readUInt32LE(offset + 4);
    const bodyOffset = offset + 8;
    const bodyEnd = bodyOffset + size;
    if (bodyEnd > declaredLength) throw new Error('invalid_wav_chunk');

    if (name === 'fmt ' && size >= 16) {
      format = {
        audioFormat: buffer.readUInt16LE(bodyOffset),
        channels: buffer.readUInt16LE(bodyOffset + 2),
        sampleRate: buffer.readUInt32LE(bodyOffset + 4),
        byteRate: buffer.readUInt32LE(bodyOffset + 8),
        blockAlign: buffer.readUInt16LE(bodyOffset + 12),
        bitDepth: buffer.readUInt16LE(bodyOffset + 14),
      };
    } else if (name === 'data' && dataOffset < 0) {
      dataOffset = bodyOffset;
      dataSize = size;
    }

    offset = bodyEnd + (size % 2);
  }

  if (!format || dataOffset < 0 || dataSize === 0) {
    throw new Error('incomplete_wav');
  }
  if (
    format.audioFormat !== 1 ||
    format.channels !== 1 ||
    format.bitDepth !== 16 ||
    format.sampleRate < 8_000 ||
    format.sampleRate > 192_000 ||
    format.blockAlign !== 2 ||
    format.byteRate !== format.sampleRate * format.blockAlign ||
    dataSize % format.blockAlign !== 0
  ) {
    throw new Error('unsupported_wav_format');
  }

  let peak = 0;
  for (let offset = dataOffset; offset < dataOffset + dataSize; offset += 2) {
    const absolute = Math.abs(buffer.readInt16LE(offset));
    if (absolute > peak) peak = absolute;
  }

  const durationMs = Math.round(
    (dataSize / (format.sampleRate * format.blockAlign)) * 1000,
  );
  return {
    sampleRate: format.sampleRate,
    channels: format.channels,
    bitDepth: 16,
    durationMs,
    peakAmplitude: Number((peak / 32768).toFixed(4)),
    clipped: peak >= 32767,
  };
}
