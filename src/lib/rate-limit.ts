/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 });
 *   const { allowed, remaining, retryAfterMs } = limiter.check(userId);
 *   if (!allowed) return 429;
 *
 * NOTE: This is process-local. In a multi-instance deployment, replace with
 * a shared store (Redis, Upstash) or an edge rate-limit service.
 */

interface RateLimitConfig {
  /** Window duration in milliseconds */
  windowMs: number;
  /** Maximum requests allowed per window */
  maxRequests: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function createRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, RateLimitEntry>();

  // Periodically purge expired entries to prevent unbounded memory growth
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, config.windowMs * 2);

  // Don't keep the process alive just for cleanup
  if (cleanup.unref) cleanup.unref();

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      const entry = store.get(key);

      // New window or expired window → allow and start fresh
      if (!entry || entry.resetAt <= now) {
        store.set(key, { count: 1, resetAt: now + config.windowMs });
        return { allowed: true, remaining: config.maxRequests - 1, retryAfterMs: 0 };
      }

      // Within window and under limit
      if (entry.count < config.maxRequests) {
        entry.count++;
        return { allowed: true, remaining: config.maxRequests - entry.count, retryAfterMs: 0 };
      }

      // Over limit
      return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
    },

    /** Tear down the cleanup interval (for tests) */
    destroy() {
      clearInterval(cleanup);
      store.clear();
    },
  };
}
