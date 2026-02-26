import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync, mkdirSync, unlinkSync, readdirSync, rmdirSync } from "fs";
import { join } from "path";
import { runRuleEngine } from "../index";

const TMP_DIR = join(process.cwd(), ".test-tmp-skipped");

function tmpFile(name: string, content: string): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const filePath = join(TMP_DIR, name);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

afterAll(() => {
  try {
    for (const f of readdirSync(TMP_DIR)) {
      unlinkSync(join(TMP_DIR, f));
    }
    rmdirSync(TMP_DIR);
  } catch {
    /* ignore */
  }
});

describe("skippedLineCount tracking", () => {
  it("counts empty and whitespace-only lines as skipped", async () => {
    const path = tmpFile(
      "empty-lines.log",
      [
        '192.168.1.1 - - [01/Jan/2026:00:00:01 +0000] "GET / HTTP/1.1" 200 100',
        "",
        "   ",
        '192.168.1.1 - - [01/Jan/2026:00:00:02 +0000] "GET /page HTTP/1.1" 200 200',
        "",
      ].join("\n"),
    );

    const result = await runRuleEngine(path);
    // Two empty/whitespace lines should be counted as skipped
    // (trailing newline doesn't produce a readline event)
    expect(result.skippedLineCount).toBeGreaterThanOrEqual(2);
    expect(result.totalLinesProcessed).toBe(4);
  });

  it("returns zero skipped for a clean file", async () => {
    const path = tmpFile(
      "clean.log",
      [
        '192.168.1.1 - - [01/Jan/2026:00:00:01 +0000] "GET / HTTP/1.1" 200 100',
        '192.168.1.1 - - [01/Jan/2026:00:00:02 +0000] "GET /page HTTP/1.1" 200 200',
      ].join("\n"),
    );

    const result = await runRuleEngine(path);
    expect(result.skippedLineCount).toBe(0);
  });

  it("counts malformed JSONL lines as skipped", async () => {
    const path = tmpFile(
      "malformed.jsonl",
      [
        '{"timestamp":"2026-01-01T00:00:00Z","message":"valid line","level":"info"}',
        "{this is broken json",
        '{"timestamp":"2026-01-02T00:00:00Z","message":"also valid","level":"warn"}',
      ].join("\n"),
    );

    const result = await runRuleEngine(path);
    expect(result.skippedLineCount).toBeGreaterThanOrEqual(1);
    expect(result.logFormat).toBe("jsonl");
  });

  it("handles short file (fewer lines than FORMAT_SAMPLE_SIZE)", async () => {
    // FORMAT_SAMPLE_SIZE is 10, so 3 lines exercises the post-loop path
    const path = tmpFile(
      "short.log",
      [
        '10.0.0.1 - - [01/Jan/2026:00:00:01 +0000] "GET / HTTP/1.1" 200 100',
        "",
        '10.0.0.1 - - [01/Jan/2026:00:00:02 +0000] "GET /page HTTP/1.1" 200 200',
      ].join("\n"),
    );

    const result = await runRuleEngine(path);
    expect(result.skippedLineCount).toBeGreaterThanOrEqual(1);
    expect(result.totalLinesProcessed).toBe(3);
  });

  it("handles long file (more lines than FORMAT_SAMPLE_SIZE)", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 15; i++) {
      if (i === 5 || i === 10) {
        lines.push(""); // empty lines scattered through sample and stream phases
      } else {
        lines.push(
          `10.0.0.1 - - [01/Jan/2026:00:00:${String(i).padStart(2, "0")} +0000] "GET /page${i} HTTP/1.1" 200 100`,
        );
      }
    }
    const path = tmpFile("long.log", lines.join("\n"));

    const result = await runRuleEngine(path);
    expect(result.skippedLineCount).toBeGreaterThanOrEqual(2);
    expect(result.totalLinesProcessed).toBe(15);
  });
});
