/**
 * Simple in-memory rate limiter for API routes.
 * For production at scale, replace with Redis-based rate limiting.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given key (e.g., IP address or phone number).
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // First request or window expired
    store.set(key, {
      count: 1,
      resetAt: now + options.windowSeconds * 1000,
    });
    return { allowed: true, remaining: options.limit - 1, resetAt: now + options.windowSeconds * 1000 };
  }

  if (entry.count >= options.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: options.limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Rate limit presets for different route types.
 */
export const RATE_LIMITS = {
  /** Twilio webhook: 60 requests per minute per phone number */
  webhook: { limit: 60, windowSeconds: 60 },
  /** Dashboard API: 30 requests per minute per user */
  dashboardApi: { limit: 30, windowSeconds: 60 },
  /** Menu crawl: 5 requests per minute per user */
  menuCrawl: { limit: 5, windowSeconds: 60 },
  /** AI worker: 10 requests per minute */
  aiWorker: { limit: 10, windowSeconds: 60 },
} as const;
