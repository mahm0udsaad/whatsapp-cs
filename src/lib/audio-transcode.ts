/**
 * Voice-note transcoding helpers.
 *
 * WhatsApp voice notes arrive as Ogg/Opus. Android and Chrome play that
 * natively, but iOS AVPlayer does not — so the mobile app asks the server for
 * a "playable" copy on iOS. We decode Opus with a pure WASM decoder (no ffmpeg
 * binary on Vercel) and wrap the PCM in a WAV container, which every player
 * supports.
 *
 * Output is mono 16-bit PCM at 24 kHz (~2.9 MB per minute) — plenty for
 * speech, and well under the media cap for normal voice-note lengths.
 */

import { OggOpusDecoder } from "ogg-opus-decoder";

export const PLAYABLE_SAMPLE_RATE = 24_000;

/** Content types that iOS can't play and that we know how to convert. */
export function isOggOpusContentType(contentType: string | null | undefined): boolean {
  const ct = (contentType || "").toLowerCase().split(";")[0].trim();
  return ct === "audio/ogg" || ct === "audio/opus";
}

/** Storage path of the cached playable copy, stored next to the original. */
export function playableStoragePath(storagePath: string): string {
  return `${storagePath}.playable.wav`;
}

/**
 * Downmix to mono and decimate by an integer factor, averaging each window
 * (a cheap box low-pass that's adequate for speech).
 */
export function downmixAndDecimate(
  channelData: Float32Array[],
  samples: number,
  factor: number
): Float32Array {
  const channels = channelData.length;
  const outLen = Math.floor(samples / factor);
  const out = new Float32Array(outLen);
  if (channels === 0) return out;
  const scale = 1 / (channels * factor);
  for (let i = 0; i < outLen; i++) {
    let sum = 0;
    const start = i * factor;
    for (let c = 0; c < channels; c++) {
      const ch = channelData[c];
      for (let k = 0; k < factor; k++) sum += ch[start + k];
    }
    out[i] = sum * scale;
  }
  return out;
}

/** Encode mono float samples as a 16-bit PCM WAV file. */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), offset);
    offset += 2;
  }
  return buf;
}

/** Decode an Ogg/Opus buffer and return a mono 24 kHz WAV buffer. */
export async function oggOpusToWav(input: Uint8Array): Promise<Buffer> {
  const decoder = new OggOpusDecoder();
  try {
    await decoder.ready;
    const decoded = await decoder.decodeFile(input);
    if (!decoded.samplesDecoded) {
      throw new Error("No audio samples decoded");
    }
    const factor = Math.max(1, Math.round(decoded.sampleRate / PLAYABLE_SAMPLE_RATE));
    const mono = downmixAndDecimate(
      decoded.channelData,
      decoded.samplesDecoded,
      factor
    );
    return encodeWavPcm16(mono, Math.round(decoded.sampleRate / factor));
  } finally {
    decoder.free();
  }
}
