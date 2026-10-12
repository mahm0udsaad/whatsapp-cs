import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  downmixAndDecimate,
  encodeWavPcm16,
  isOggOpusContentType,
  oggOpusToWav,
  playableStoragePath,
  PLAYABLE_SAMPLE_RATE,
} from "@/lib/audio-transcode";

describe("isOggOpusContentType", () => {
  it("matches WhatsApp voice-note types", () => {
    expect(isOggOpusContentType("audio/ogg")).toBe(true);
    expect(isOggOpusContentType("audio/ogg; codecs=opus")).toBe(true);
    expect(isOggOpusContentType("audio/opus")).toBe(true);
  });
  it("ignores types iOS already plays", () => {
    expect(isOggOpusContentType("audio/mp4")).toBe(false);
    expect(isOggOpusContentType("audio/mpeg")).toBe(false);
    expect(isOggOpusContentType(null)).toBe(false);
  });
});

describe("playableStoragePath", () => {
  it("keeps the tenant/conversation prefix", () => {
    expect(playableStoragePath("r1/c1/2026/10/abc.ogg")).toBe(
      "r1/c1/2026/10/abc.ogg.playable.wav"
    );
  });
});

describe("downmixAndDecimate", () => {
  it("averages channels and windows", () => {
    const left = new Float32Array([1, 1, 0, 0]);
    const right = new Float32Array([0, 0, 1, 1]);
    const out = downmixAndDecimate([left, right], 4, 2);
    expect(Array.from(out)).toEqual([0.5, 0.5]);
  });
});

describe("encodeWavPcm16", () => {
  it("writes a valid RIFF/WAVE header", () => {
    const wav = encodeWavPcm16(new Float32Array([0, 1, -1]), 24_000);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt32LE(40)).toBe(6);
    expect(wav.readInt16LE(46)).toBe(0x7fff);
    expect(wav.readInt16LE(48)).toBe(-0x8000);
  });
});

describe("oggOpusToWav", () => {
  it("decodes a real Ogg/Opus voice note to mono 24 kHz WAV", async () => {
    const ogg = readFileSync(join(__dirname, "fixtures", "voice-note.ogg"));
    const wav = await oggOpusToWav(new Uint8Array(ogg));
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(PLAYABLE_SAMPLE_RATE);
    const seconds = wav.readUInt32LE(40) / 2 / PLAYABLE_SAMPLE_RATE;
    expect(seconds).toBeGreaterThan(0.9);
    expect(seconds).toBeLessThan(1.1);
  });

  it("rejects non-audio input", async () => {
    await expect(oggOpusToWav(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });
});
