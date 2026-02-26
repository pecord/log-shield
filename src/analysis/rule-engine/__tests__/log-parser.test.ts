import { describe, it, expect } from "vitest";
import { detectFormat, parseLogLines } from "../log-parser";

describe("detectFormat", () => {
  it("detects JSONL from valid JSON first line", () => {
    const lines = ['{"timestamp":"2026-01-01","message":"test"}', '{"other":"line"}'];
    expect(detectFormat(lines)).toBe("jsonl");
  });

  it("detects CSV from header-like first line with commas", () => {
    const lines = ["timestamp,src_ip,method,url,status", "2026-01-01,10.0.0.1,GET,/,200"];
    expect(detectFormat(lines)).toBe("csv");
  });

  it("falls back to plain for Apache combined log format", () => {
    const lines = [
      '192.168.1.10 - - [23/Feb/2026:10:15:01 +0000] "GET /dashboard HTTP/1.1" 200 5432',
    ];
    expect(detectFormat(lines)).toBe("plain");
  });

  it("handles empty input array", () => {
    expect(detectFormat([])).toBe("plain");
  });

  it("skips leading empty lines when detecting format", () => {
    const lines = ["", "  ", '{"valid":"json"}'];
    expect(detectFormat(lines)).toBe("jsonl");
  });

  it("returns plain when JSON parse fails on { line", () => {
    const lines = ["{this is not valid json}"];
    expect(detectFormat(lines)).toBe("plain");
  });

  it("detects CSV with various header field names", () => {
    const lines = ["date,host,status,url", "2026-01-01,server1,200,/api"];
    expect(detectFormat(lines)).toBe("csv");
  });
});

describe("parseLogLines", () => {
  describe("plain text passthrough", () => {
    it("returns lines as-is for plain format", () => {
      const lines = [
        '192.168.1.10 - - [23/Feb/2026:10:15:01 +0000] "GET / HTTP/1.1" 200 1234',
        "Failed password for root from 10.0.0.5 port 22",
      ];
      const result = parseLogLines(lines);
      expect(result.format).toBe("plain");
      expect(result.lines[0].normalized).toBe(lines[0]);
      expect(result.lines[0].raw).toBe(lines[0]);
      expect(result.parseErrors).toBe(0);
    });
  });

  describe("JSONL normalization", () => {
    it("flattens JSON objects to key=value format", () => {
      const lines = ['{"timestamp":"2026-01-01","src_ip":"10.0.0.1","message":"test"}'];
      const result = parseLogLines(lines);
      expect(result.format).toBe("jsonl");
      expect(result.lines[0].normalized).toContain("timestamp=2026-01-01");
      expect(result.lines[0].normalized).toContain("src_ip=10.0.0.1");
      expect(result.lines[0].normalized).toContain("message=test");
    });

    it("flattens nested objects with underscore separator", () => {
      const lines = ['{"event":"login","details":{"user":"admin","result":"fail"}}'];
      const result = parseLogLines(lines);
      expect(result.lines[0].normalized).toContain("details_user=admin");
      expect(result.lines[0].normalized).toContain("details_result=fail");
    });

    it("counts parse errors for malformed JSON lines", () => {
      const lines = [
        '{"valid":"json"}',
        "{broken json",
        '{"also":"valid"}',
      ];
      const result = parseLogLines(lines);
      expect(result.parseErrors).toBe(1);
    });

    it("preserves raw line alongside normalized version", () => {
      const raw = '{"key":"value"}';
      const result = parseLogLines([raw]);
      expect(result.lines[0].raw).toBe(raw);
      expect(result.lines[0].normalized).toBe("key=value");
    });
  });

  describe("CSV normalization", () => {
    it("parses CSV header and converts rows to key=value", () => {
      const lines = [
        "timestamp,src_ip,method",
        "2026-01-01,10.0.0.1,GET",
      ];
      const result = parseLogLines(lines);
      expect(result.format).toBe("csv");
      expect(result.lines[1].normalized).toContain("timestamp=2026-01-01");
      expect(result.lines[1].normalized).toContain("src_ip=10.0.0.1");
      expect(result.lines[1].normalized).toContain("method=GET");
    });

    it("handles quoted fields containing commas", () => {
      const lines = [
        "timestamp,message,status",
        '2026-01-01,"hello, world",200',
      ];
      const result = parseLogLines(lines);
      expect(result.lines[1].normalized).toContain("message=hello, world");
    });

    it("handles escaped quotes in CSV", () => {
      const lines = [
        "timestamp,message",
        '2026-01-01,"he said ""hello"""',
      ];
      const result = parseLogLines(lines);
      expect(result.lines[1].normalized).toContain('message=he said "hello"');
    });

    it("header row is preserved as-is", () => {
      const lines = ["timestamp,src_ip", "2026-01-01,10.0.0.1"];
      const result = parseLogLines(lines);
      expect(result.lines[0].normalized).toBe("timestamp,src_ip");
    });
  });

  describe("edge cases", () => {
    it("handles empty file (no lines)", () => {
      const result = parseLogLines([]);
      expect(result.lines).toHaveLength(0);
      expect(result.format).toBe("plain");
    });

    it("handles file with only empty lines", () => {
      const result = parseLogLines(["", "  ", ""]);
      expect(result.format).toBe("plain");
      expect(result.lines).toHaveLength(3);
    });

    it("handles extremely long lines without crashing", () => {
      const longLine = "x".repeat(100_000);
      expect(() => parseLogLines([longLine])).not.toThrow();
    });
  });
});
