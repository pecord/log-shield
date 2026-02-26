import { describe, it, expect } from "vitest";
import {
  extractIp,
  extractAllIps,
  extractTimestamp,
  computeFingerprint,
  truncateLine,
  extractUsername,
} from "../utils";

describe("extractIp", () => {
  it("extracts IPv4 from Apache combined log line", () => {
    const line =
      '192.168.1.10 - admin [23/Feb/2026:10:15:01 +0000] "GET /dashboard HTTP/1.1" 200 5432';
    expect(extractIp(line)).toBe("192.168.1.10");
  });

  it("extracts IP from syslog line", () => {
    expect(extractIp("Failed password for root from 10.0.0.5 port 22")).toBe(
      "10.0.0.5"
    );
  });

  it("returns null when no IP is present", () => {
    expect(extractIp("just a plain log message with no addresses")).toBeNull();
  });

  it("returns the first IP when multiple are present", () => {
    expect(extractIp("src=192.168.1.1 dst=10.0.0.1")).toBe("192.168.1.1");
  });

  it("does not match partial numbers that look like IPs", () => {
    // 999.999.999.999 technically matches the regex but is not a valid IP
    // We're testing that the regex matches dotted-quad format
    expect(extractIp("version 1.2.3")).toBeNull();
  });
});

describe("extractAllIps", () => {
  it("extracts all IPs from a line with multiple", () => {
    const ips = extractAllIps("src=192.168.1.1 dst=10.0.0.1 via=172.16.0.1");
    expect(ips).toEqual(["192.168.1.1", "10.0.0.1", "172.16.0.1"]);
  });

  it("returns empty array when no IPs present", () => {
    expect(extractAllIps("no ip here")).toEqual([]);
  });

  it("returns single IP in array", () => {
    expect(extractAllIps("from 10.0.0.5")).toEqual(["10.0.0.5"]);
  });
});

describe("extractTimestamp", () => {
  it("parses ISO 8601 timestamp with Z timezone", () => {
    const ts = extractTimestamp(
      '{"timestamp":"2026-02-23T10:15:01Z","message":"test"}'
    );
    expect(ts).toBe(Date.parse("2026-02-23T10:15:01Z"));
  });

  it("parses ISO 8601 timestamp with offset", () => {
    const ts = extractTimestamp("2026-02-23T10:15:01+05:00 some log");
    expect(ts).toBeTypeOf("number");
    expect(ts).not.toBeNull();
  });

  it("parses Apache combined format timestamp", () => {
    const ts = extractTimestamp(
      '192.168.1.10 - - [23/Feb/2026:10:15:01 +0000] "GET / HTTP/1.1" 200 1234'
    );
    expect(ts).toBeTypeOf("number");
    expect(ts).not.toBeNull();
  });

  it("returns null for non-parseable format", () => {
    expect(extractTimestamp("no timestamp here")).toBeNull();
  });

  it("handles malformed dates without throwing", () => {
    expect(() => extractTimestamp("timestamp: not-a-date")).not.toThrow();
  });
});

describe("computeFingerprint", () => {
  it("produces a 16-char hex hash", () => {
    const fp = computeFingerprint("SQL_INJECTION", 5, "UNION SELECT");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for same inputs", () => {
    const fp1 = computeFingerprint("XSS", 10, "<script>alert(1)</script>");
    const fp2 = computeFingerprint("XSS", 10, "<script>alert(1)</script>");
    expect(fp1).toBe(fp2);
  });

  it("produces different hashes for different inputs", () => {
    const fp1 = computeFingerprint("SQL_INJECTION", 1, "test");
    const fp2 = computeFingerprint("XSS", 1, "test");
    expect(fp1).not.toBe(fp2);
  });

  it("handles null lineNumber and content", () => {
    const fp = computeFingerprint("RATE_ANOMALY", null, null);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("truncateLine", () => {
  it("returns short lines unchanged", () => {
    expect(truncateLine("short line")).toBe("short line");
  });

  it("truncates lines over 500 chars with ellipsis", () => {
    const longLine = "a".repeat(600);
    const result = truncateLine(longLine);
    expect(result.length).toBe(503); // 500 + "..."
    expect(result.endsWith("...")).toBe(true);
  });

  it("returns exactly 500-char line unchanged", () => {
    const line = "b".repeat(500);
    expect(truncateLine(line)).toBe(line);
  });

  it("respects custom maxLength", () => {
    const result = truncateLine("hello world", 5);
    expect(result).toBe("hello...");
  });
});

describe("extractUsername", () => {
  it("extracts username from SSH failed password log", () => {
    expect(
      extractUsername("Failed password for root from 10.0.0.5 port 22 ssh2")
    ).toBe("root");
  });

  it("extracts username from SSH invalid user log", () => {
    expect(
      extractUsername(
        "Failed password for invalid user admin from 10.0.0.5 port 22 ssh2"
      )
    ).toBe("admin");
  });

  it("extracts username from key-value format", () => {
    expect(extractUsername("auth failure user=deploy src=10.0.0.5")).toBe(
      "deploy"
    );
  });

  it("extracts username from Login failed format", () => {
    expect(
      extractUsername("Login failed for user postgres from 10.0.0.5")
    ).toBe("postgres");
  });

  it("returns null when no username pattern matches", () => {
    expect(extractUsername("Connection closed by remote host")).toBeNull();
  });
});
