import {
  captureException,
  captureMessage,
  initObservability,
  wrap,
} from "../lib/observability";

describe("observability shim", () => {
  let errSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("captureException emits on console.error with structured payload", () => {
    const err = new Error("boom");
    captureException(err, { source: "test" });
    expect(errSpy).toHaveBeenCalledWith(
      "[obs:exception]",
      expect.objectContaining({
        message: "boom",
        name: "Error",
        context: { source: "test" },
      })
    );
  });

  it("captureException tolerates non-Error throws", () => {
    captureException("just a string", { source: "test" });
    expect(errSpy).toHaveBeenCalledWith(
      "[obs:exception]",
      expect.objectContaining({
        message: "just a string",
        name: "NonErrorThrown",
      })
    );
  });

  it("captureMessage routes by level", () => {
    captureMessage("info msg", "info");
    captureMessage("warn msg", "warning");
    captureMessage("err msg", "error");
    expect(logSpy).toHaveBeenCalledWith("[obs:info]", "info msg", "");
    expect(warnSpy).toHaveBeenCalledWith("[obs:warning]", "warn msg", "");
    expect(errSpy).toHaveBeenCalledWith("[obs:error]", "err msg", "");
  });

  it("initObservability is idempotent", () => {
    expect(() => {
      initObservability();
      initObservability();
    }).not.toThrow();
  });

  it("wrap is a pass-through", () => {
    const Component = () => null;
    expect(wrap(Component)).toBe(Component);
  });
});
