/**
 * Convert a recorded audio Blob (e.g. webm/opus from MediaRecorder) to 16-bit WAV
 * so ElevenLabs voice cloning accepts it.
 */

export async function blobToWavFile(blob: Blob, filename = "recording.wav"): Promise<File> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const wav = encodeWavFromAudioBuffer(audioBuffer);
    return new File([wav], filename, { type: "audio/wav" });
  } finally {
    await ctx.close().catch(() => {});
  }
}

function encodeWavFromAudioBuffer(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const samples = buffer.length;
  const dataSize = samples * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const offset = 44;
  const ch0 = buffer.getChannelData(0);
  const ch1 = numChannels > 1 ? buffer.getChannelData(1) : ch0;

  for (let i = 0; i < samples; i++) {
    const s0 = Math.max(-1, Math.min(1, ch0[i] ?? 0));
    const s1 = Math.max(-1, Math.min(1, ch1[i] ?? 0));
    const i16 = (c: number) => (c < 0 ? c * 0x8000 : c * 0x7fff);
    view.setInt16(offset + i * blockAlign, i16(s0), true);
    if (numChannels > 1) {
      view.setInt16(offset + i * blockAlign + 2, i16(s1), true);
    }
  }

  return out;
}

function writeString(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) {
    view.setUint8(offset + i, s.charCodeAt(i));
  }
}
