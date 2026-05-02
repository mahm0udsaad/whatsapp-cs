/**
 * Vendor-neutral observability shim.
 *
 * Today: routes to console (with structured context) and never crashes the
 * caller. Designed so swapping in a real backend (Sentry, Bugsnag, Crashlytics)
 * is a single-file change — only this module needs to know the SDK.
 *
 * To wire Sentry later:
 *   1. `npx expo install @sentry/react-native`
 *   2. In `init()`, call `Sentry.init({ dsn, enabled: !__DEV__, ... })`
 *   3. In `captureException` / `captureMessage`, forward to Sentry
 *   4. Export `Sentry.wrap` from `wrap()`
 *
 * Until then, exceptions still surface in dev (red box) and prod logs.
 */

type Level = "info" | "warning" | "error";

type Context = Record<string, unknown>;

let initialized = false;

export function initObservability() {
  if (initialized) return;
  initialized = true;
  // Catch otherwise-silent unhandled promise rejections in JS.
  // RN's default ErrorUtils does NOT surface these clearly in prod.
  const g = globalThis as unknown as {
    HermesInternal?: unknown;
    process?: { on?: (e: string, cb: (r: unknown) => void) => void };
  };
  g.process?.on?.("unhandledRejection", (reason) => {
    captureException(reason, { source: "unhandledRejection" });
  });
}

export function captureException(error: unknown, context?: Context) {
  const payload = {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : "NonErrorThrown",
    stack: error instanceof Error ? error.stack : undefined,
    context,
  };
  // In dev, console.error pops the red box — that's what we want.
  // In prod, this is the only signal until a real backend is wired.
  console.error("[obs:exception]", payload);
}

export function captureMessage(
  message: string,
  level: Level = "info",
  context?: Context
) {
  const fn =
    level === "error"
      ? console.error
      : level === "warning"
        ? console.warn
        : console.log;
  fn(`[obs:${level}]`, message, context ?? "");
}

/**
 * Pass-through component wrapper. Swap to `Sentry.wrap` to enable native
 * crash capture + automatic tracing.
 */
export function wrap<T>(component: T): T {
  return component;
}
