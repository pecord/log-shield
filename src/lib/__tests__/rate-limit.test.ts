import { describe, it, expect, afterEach } from "vitest";
import { createRateLimiter } from "../rate-limit";

describe("createRateLimiter", () => {
  let limiter: ReturnType<typeof createRateLimiter>;

  afterEach(() => {
    limiter?.destroy();
  });

  it("allows requests within limit", () => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 });

    expect(limiter.check("user-1").allowed).toBe(true);
    expect(limiter.check("user-1").allowed).toBe(true);
    expect(limiter.check("user-1").allowed).toBe(true);
  });

  it("blocks requests exceeding limit", () => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 });

    limiter.check("user-1");
    limiter.check("user-1");
    const result = limiter.check("user-1");

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.remaining).toBe(0);
  });

  it("tracks different keys independently", () => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 });

    expect(limiter.check("user-1").allowed).toBe(true);
    expect(limiter.check("user-2").allowed).toBe(true);
    // user-1 is now exhausted
    expect(limiter.check("user-1").allowed).toBe(false);
    // user-2 is also exhausted
    expect(limiter.check("user-2").allowed).toBe(false);
  });

  it("returns correct remaining count", () => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 });

    expect(limiter.check("user-1").remaining).toBe(2);
    expect(limiter.check("user-1").remaining).toBe(1);
    expect(limiter.check("user-1").remaining).toBe(0);
  });

  it("resets after window expires", async () => {
    limiter = createRateLimiter({ windowMs: 50, maxRequests: 1 });

    expect(limiter.check("user-1").allowed).toBe(true);
    expect(limiter.check("user-1").allowed).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));

    expect(limiter.check("user-1").allowed).toBe(true);
  });
});
