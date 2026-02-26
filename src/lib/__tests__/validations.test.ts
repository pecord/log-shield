import { describe, it, expect } from "vitest";
import { validateFileExtension, sanitizeFileName } from "../validations/upload";

describe("validateFileExtension", () => {
  it("accepts .txt files", () => {
    expect(validateFileExtension("server.txt")).toBe(true);
  });

  it("accepts .log files", () => {
    expect(validateFileExtension("access.log")).toBe(true);
  });

  it("accepts .csv files", () => {
    expect(validateFileExtension("data.csv")).toBe(true);
  });

  it("accepts .jsonl files", () => {
    expect(validateFileExtension("events.jsonl")).toBe(true);
  });

  it("rejects .exe files", () => {
    expect(validateFileExtension("malware.exe")).toBe(false);
  });

  it("rejects .js files", () => {
    expect(validateFileExtension("script.js")).toBe(false);
  });

  it("rejects files with no extension", () => {
    expect(validateFileExtension("noextension")).toBe(false);
  });

  it("handles uppercase extensions", () => {
    // .toLowerCase() is applied in the function
    expect(validateFileExtension("data.TXT")).toBe(true);
  });

  it("rejects .html files", () => {
    expect(validateFileExtension("page.html")).toBe(false);
  });
});

describe("sanitizeFileName", () => {
  it("preserves alphanumeric characters", () => {
    expect(sanitizeFileName("logfile123.txt")).toBe("logfile123.txt");
  });

  it("replaces special characters with underscores", () => {
    expect(sanitizeFileName("log file (2).txt")).toBe("log_file_2_.txt");
  });

  it("preserves dots and hyphens", () => {
    expect(sanitizeFileName("access-2026.01.log")).toBe("access-2026.01.log");
  });

  it("collapses multiple underscores", () => {
    expect(sanitizeFileName("log   file!!!.txt")).toBe("log_file_.txt");
  });

  it("truncates to 200 characters", () => {
    const longName = "a".repeat(250) + ".txt";
    const result = sanitizeFileName(longName);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it("handles empty string input", () => {
    expect(sanitizeFileName("")).toBe("");
  });
});
