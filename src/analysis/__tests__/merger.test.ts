import { describe, it, expect } from "vitest";
import { mergeFindings, mergeFindingsProgressive } from "../merger";
import type { RawFinding } from "../types";

function makeFinding(overrides: Partial<RawFinding> = {}): RawFinding {
  return {
    severity: "HIGH",
    category: "SQL_INJECTION",
    title: "Test Finding",
    description: "Test description",
    lineNumber: 1,
    lineContent: "test line content",
    matchedPattern: "UNION SELECT",
    source: "RULE_BASED",
    fingerprint: "abc123",
    recommendation: "Fix it",
    confidence: 0.85,
    mitreTactic: "Initial Access",
    mitreTechnique: "T1190",
    eventTimestamp: null,
    ...overrides,
  };
}

describe("mergeFindings", () => {
  it("deduplicates findings by fingerprint", () => {
    const rule = [makeFinding({ fingerprint: "fp1" })];
    const llm = [makeFinding({ fingerprint: "fp1", source: "LLM" })];
    const merged = mergeFindings(rule, llm);
    expect(merged).toHaveLength(1);
  });

  it("LLM findings override rule-based with same fingerprint", () => {
    const rule = [
      makeFinding({
        fingerprint: "fp1",
        source: "RULE_BASED",
        description: "Rule description",
      }),
    ];
    const llm = [
      makeFinding({
        fingerprint: "fp1",
        source: "LLM",
        description: "Richer LLM description",
      }),
    ];
    const merged = mergeFindings(rule, llm);
    expect(merged[0].source).toBe("LLM");
    expect(merged[0].description).toBe("Richer LLM description");
  });

  it("boosts confidence when both sources agree", () => {
    const rule = [
      makeFinding({ fingerprint: "fp1", confidence: 0.9 }),
    ];
    const llm = [
      makeFinding({ fingerprint: "fp1", source: "LLM", confidence: 0.7 }),
    ];
    const merged = mergeFindings(rule, llm);
    // Should take the max confidence
    expect(merged[0].confidence).toBe(0.9);
  });

  it("preserves lineContent from rule finding if LLM lacks it", () => {
    const rule = [
      makeFinding({
        fingerprint: "fp1",
        lineContent: "GET /page?id=1 OR 1=1",
      }),
    ];
    const llm = [
      makeFinding({
        fingerprint: "fp1",
        source: "LLM",
        lineContent: null,
      }),
    ];
    const merged = mergeFindings(rule, llm);
    expect(merged[0].lineContent).toBe("GET /page?id=1 OR 1=1");
  });

  it("sorts by severity (CRITICAL first, then HIGH, etc.)", () => {
    const rule = [
      makeFinding({ fingerprint: "fp1", severity: "LOW", lineNumber: 1 }),
      makeFinding({ fingerprint: "fp2", severity: "CRITICAL", lineNumber: 2 }),
      makeFinding({ fingerprint: "fp3", severity: "HIGH", lineNumber: 3 }),
    ];
    const merged = mergeFindings(rule, []);
    expect(merged[0].severity).toBe("CRITICAL");
    expect(merged[1].severity).toBe("HIGH");
    expect(merged[2].severity).toBe("LOW");
  });

  it("sorts by line number within same severity", () => {
    const rule = [
      makeFinding({ fingerprint: "fp1", severity: "HIGH", lineNumber: 10 }),
      makeFinding({ fingerprint: "fp2", severity: "HIGH", lineNumber: 3 }),
      makeFinding({ fingerprint: "fp3", severity: "HIGH", lineNumber: 7 }),
    ];
    const merged = mergeFindings(rule, []);
    expect(merged[0].lineNumber).toBe(3);
    expect(merged[1].lineNumber).toBe(7);
    expect(merged[2].lineNumber).toBe(10);
  });

  it("handles empty arrays", () => {
    expect(mergeFindings([], [])).toEqual([]);
  });

  it("handles only rule findings", () => {
    const rule = [makeFinding({ fingerprint: "fp1" })];
    const merged = mergeFindings(rule, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("RULE_BASED");
  });

  it("handles only LLM findings", () => {
    const llm = [makeFinding({ fingerprint: "fp1", source: "LLM" })];
    const merged = mergeFindings([], llm);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("LLM");
  });

  it("keeps unique findings from both sources when on different lines", () => {
    const rule = [makeFinding({ fingerprint: "fp-rule-only", lineNumber: 1 })];
    const llm = [makeFinding({ fingerprint: "fp-llm-only", source: "LLM", lineNumber: 2 })];
    const merged = mergeFindings(rule, llm);
    expect(merged).toHaveLength(2);
  });

  it("deduplicates cross-engine by category:lineNumber even with different fingerprints", () => {
    // Rule engine uses regex match as fingerprint content
    const rule = [
      makeFinding({
        fingerprint: "rule-fp-abc",
        source: "RULE_BASED",
        category: "SQL_INJECTION",
        lineNumber: 5,
        matchedPattern: "UNION SELECT",
        lineContent: "GET /page?id=1 UNION SELECT * FROM users",
        description: "SQL injection pattern detected",
      }),
    ];
    // LLM uses title as fingerprint content — different fingerprint!
    const llm = [
      makeFinding({
        fingerprint: "llm-fp-xyz",
        source: "LLM",
        category: "SQL_INJECTION",
        lineNumber: 5,
        matchedPattern: null,
        lineContent: null,
        description: "Richer LLM description of SQL injection",
      }),
    ];
    const merged = mergeFindings(rule, llm);
    // Should produce 1 finding, not 2
    expect(merged).toHaveLength(1);
    // LLM wins
    expect(merged[0].source).toBe("LLM");
    expect(merged[0].description).toBe("Richer LLM description of SQL injection");
    // But inherits lineContent and matchedPattern from rule
    expect(merged[0].lineContent).toBe("GET /page?id=1 UNION SELECT * FROM users");
    expect(merged[0].matchedPattern).toBe("UNION SELECT");
  });

  it("does not cross-engine dedup findings with null lineNumber", () => {
    const rule = [
      makeFinding({
        fingerprint: "rule-rate",
        category: "RATE_ANOMALY",
        lineNumber: null,
      }),
    ];
    const llm = [
      makeFinding({
        fingerprint: "llm-rate",
        source: "LLM",
        category: "RATE_ANOMALY",
        lineNumber: null,
      }),
    ];
    const merged = mergeFindings(rule, llm);
    // null lineNumber findings skip correlation — both kept
    expect(merged).toHaveLength(2);
  });

  it("does not merge findings on same line with different categories", () => {
    const rule = [
      makeFinding({
        fingerprint: "rule-sql",
        category: "SQL_INJECTION",
        lineNumber: 10,
      }),
    ];
    const llm = [
      makeFinding({
        fingerprint: "llm-xss",
        source: "LLM",
        category: "XSS",
        lineNumber: 10,
      }),
    ];
    const merged = mergeFindings(rule, llm);
    expect(merged).toHaveLength(2);
  });
});

// ── mergeFindingsProgressive tests ──────────────────────
describe("mergeFindingsProgressive", () => {
  it("returns all LLM findings when no overlap", () => {
    const rule = [makeFinding({ fingerprint: "rule-fp", lineNumber: 1 })];
    const llm = [
      makeFinding({ fingerprint: "llm-fp", source: "LLM", lineNumber: 10, category: "XSS" }),
    ];
    const result = mergeFindingsProgressive(rule, llm);
    expect(result.llmFindings).toHaveLength(1);
    expect(result.supersededRuleFingerprints).toHaveLength(0);
  });

  it("returns superseded rule fingerprints for cross-engine match", () => {
    const rule = [
      makeFinding({
        fingerprint: "rule-fp-abc",
        source: "RULE_BASED",
        category: "SQL_INJECTION",
        lineNumber: 5,
        matchedPattern: "UNION SELECT",
        lineContent: "GET /page?id=1 UNION SELECT * FROM users",
      }),
    ];
    const llm = [
      makeFinding({
        fingerprint: "llm-fp-xyz",
        source: "LLM",
        category: "SQL_INJECTION",
        lineNumber: 5,
        matchedPattern: null,
        lineContent: null,
      }),
    ];
    const result = mergeFindingsProgressive(rule, llm);
    expect(result.llmFindings).toHaveLength(1);
    expect(result.supersededRuleFingerprints).toEqual(["rule-fp-abc"]);
  });

  it("enriches LLM findings with rule lineContent and matchedPattern", () => {
    const rule = [
      makeFinding({
        fingerprint: "rule-fp",
        source: "RULE_BASED",
        category: "SQL_INJECTION",
        lineNumber: 5,
        matchedPattern: "UNION SELECT",
        lineContent: "GET /page?id=1 UNION SELECT * FROM users",
      }),
    ];
    const llm = [
      makeFinding({
        fingerprint: "llm-fp",
        source: "LLM",
        category: "SQL_INJECTION",
        lineNumber: 5,
        matchedPattern: null,
        lineContent: null,
      }),
    ];
    const result = mergeFindingsProgressive(rule, llm);
    expect(result.llmFindings[0].lineContent).toBe("GET /page?id=1 UNION SELECT * FROM users");
    expect(result.llmFindings[0].matchedPattern).toBe("UNION SELECT");
  });

  it("boosts confidence on cross-engine match", () => {
    const rule = [
      makeFinding({
        fingerprint: "rule-fp",
        category: "SQL_INJECTION",
        lineNumber: 5,
        confidence: 0.95,
      }),
    ];
    const llm = [
      makeFinding({
        fingerprint: "llm-fp",
        source: "LLM",
        category: "SQL_INJECTION",
        lineNumber: 5,
        confidence: 0.7,
      }),
    ];
    const result = mergeFindingsProgressive(rule, llm);
    expect(result.llmFindings[0].confidence).toBe(0.95);
  });

  it("handles same-fingerprint overlap", () => {
    const rule = [
      makeFinding({
        fingerprint: "shared-fp",
        source: "RULE_BASED",
        lineNumber: null,
        lineContent: "some content",
      }),
    ];
    const llm = [
      makeFinding({
        fingerprint: "shared-fp",
        source: "LLM",
        lineNumber: null,
        lineContent: null,
      }),
    ];
    const result = mergeFindingsProgressive(rule, llm);
    expect(result.llmFindings).toHaveLength(1);
    expect(result.supersededRuleFingerprints).toEqual(["shared-fp"]);
    expect(result.llmFindings[0].lineContent).toBe("some content");
  });

  it("handles empty arrays", () => {
    const result = mergeFindingsProgressive([], []);
    expect(result.llmFindings).toHaveLength(0);
    expect(result.supersededRuleFingerprints).toHaveLength(0);
  });

  it("does not supersede rules for different categories on same line", () => {
    const rule = [
      makeFinding({
        fingerprint: "rule-sql",
        category: "SQL_INJECTION",
        lineNumber: 10,
      }),
    ];
    const llm = [
      makeFinding({
        fingerprint: "llm-xss",
        source: "LLM",
        category: "XSS",
        lineNumber: 10,
      }),
    ];
    const result = mergeFindingsProgressive(rule, llm);
    expect(result.llmFindings).toHaveLength(1);
    expect(result.supersededRuleFingerprints).toHaveLength(0);
  });

  it("does not supersede rules with null lineNumber", () => {
    const rule = [
      makeFinding({
        fingerprint: "rule-rate",
        category: "RATE_ANOMALY",
        lineNumber: null,
      }),
    ];
    const llm = [
      makeFinding({
        fingerprint: "llm-rate",
        source: "LLM",
        category: "RATE_ANOMALY",
        lineNumber: null,
      }),
    ];
    const result = mergeFindingsProgressive(rule, llm);
    expect(result.llmFindings).toHaveLength(1);
    // No superseding since null lineNumber doesn't correlate
    expect(result.supersededRuleFingerprints).toHaveLength(0);
  });
});
