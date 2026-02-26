import { describe, it, expect, beforeEach } from "vitest";

// Set AUTH_SECRET before importing the module
process.env.AUTH_SECRET = "test-secret-for-encryption-at-least-32-chars-long";

import { encrypt, decrypt, maskApiKey, _resetKeyCache } from "../encryption";

describe("encryption", () => {
  beforeEach(() => {
    _resetKeyCache();
  });

  it("round-trips: decrypt(encrypt(plaintext)) === plaintext", () => {
    const plaintext = "sk-ant-api03-reallyLongKeyHere123456";
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "same-key-value";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it("throws on tampered ciphertext", () => {
    const ciphertext = encrypt("test-value");
    const buf = Buffer.from(ciphertext, "base64");
    // Flip a byte in the middle
    buf[Math.floor(buf.length / 2)] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("handles empty string", () => {
    const ciphertext = encrypt("");
    expect(decrypt(ciphertext)).toBe("");
  });

  it("handles unicode content", () => {
    const plaintext = "api-key-with-émojis-🔑";
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("throws when AUTH_SECRET is missing", () => {
    const original = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    _resetKeyCache();
    expect(() => encrypt("test")).toThrow("AUTH_SECRET");
    process.env.AUTH_SECRET = original;
  });
});

describe("maskApiKey", () => {
  it("masks long keys as prefix...suffix", () => {
    expect(maskApiKey("sk-ant-api03-abc123xyz")).toBe("sk-...xyz");
  });

  it("masks short keys as ****", () => {
    expect(maskApiKey("abc")).toBe("****");
    expect(maskApiKey("abcdef")).toBe("****");
  });

  it("masks 7-char keys correctly", () => {
    expect(maskApiKey("abcdefg")).toBe("abc...efg");
  });
});
