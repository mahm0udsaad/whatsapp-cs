// The chat composer ships over OTA to binaries that may not include the
// ExpoAudio native module. Loading the recorder module there must not touch
// expo-audio (it throws at import when the native side is missing).

describe("voice recorder on a binary without ExpoAudio", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("loads without importing expo-audio and reports unsupported", () => {
    jest.doMock("expo", () => ({
      ...jest.requireActual("expo"),
      requireOptionalNativeModule: jest.fn(() => null),
    }));
    jest.doMock("expo-audio", () => {
      throw new Error("Cannot find native module 'ExpoAudio'");
    });

    const mod = require("../components/voice-recorder");
    expect(mod.voiceRecordingSupported).toBe(false);
    const recorder = mod.useVoiceRecorder();
    expect(recorder.supported).toBe(false);
    expect(recorder.active).toBe(false);
  });

  it("uses the native recorder when ExpoAudio is present", () => {
    jest.doMock("expo", () => ({
      ...jest.requireActual("expo"),
      requireOptionalNativeModule: jest.fn(() => ({})),
    }));
    const native = { useVoiceRecorder: jest.fn() };
    jest.doMock("../components/voice-recorder-native", () => native);

    const mod = require("../components/voice-recorder");
    expect(mod.voiceRecordingSupported).toBe(true);
    expect(mod.useVoiceRecorder).toBe(native.useVoiceRecorder);
  });
});

describe("formatClock", () => {
  it("formats seconds as m:ss", () => {
    const { formatClock } = require("../lib/format-clock");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9.7)).toBe("0:09");
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(NaN)).toBe("0:00");
  });
});
