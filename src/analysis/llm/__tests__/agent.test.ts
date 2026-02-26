import { describe, it, expect } from "vitest";
import { parseAgentResponse } from "../agent";

describe("parseAgentResponse", () => {
  it("parses JSON from a markdown code block", () => {
    const content = `After analyzing the log file, I found several issues.

\`\`\`json
{
  "findings": [
    {
      "title": "SQL Injection Attempt",
      "description": "Found UNION SELECT on line 42",
      "severity": "HIGH",
      "category": "SQL_INJECTION",
      "lineNumber": 42,
      "recommendation": "Block the request",
      "confidence": 0.9,
      "mitreTactic": "Initial Access",
      "mitreTechnique": "T1190"
    }
  ],
  "summary": "One high-severity finding detected.",
  "false_positive_line_numbers": [10]
}
\`\`\``;

    const result = parseAgentResponse(content);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toBe("SQL Injection Attempt");
    expect(result.findings[0].severity).toBe("HIGH");
    expect(result.findings[0].category).toBe("SQL_INJECTION");
    expect(result.findings[0].lineNumber).toBe(42);
    expect(result.findings[0].source).toBe("LLM");
    expect(result.findings[0].fingerprint).toBeTruthy();
    expect(result.findings[0].confidence).toBe(0.9);
    expect(result.summary).toBe("One high-severity finding detected.");
    expect(result.falsePositiveLineNumbers).toEqual([10]);
  });

  it("parses raw JSON without code block", () => {
    const content = `{
      "findings": [
        {
          "title": "Brute Force",
          "description": "Multiple failed logins",
          "severity": "MEDIUM",
          "category": "BRUTE_FORCE",
          "lineNumber": 5
        }
      ],
      "summary": "Brute force detected.",
      "false_positive_line_numbers": []
    }`;

    const result = parseAgentResponse(content);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].category).toBe("BRUTE_FORCE");
    expect(result.findings[0].confidence).toBe(0.7); // default
  });

  it("normalizes invalid severity to MEDIUM", () => {
    const content = JSON.stringify({
      findings: [{
        title: "Test",
        description: "Test desc",
        severity: "SUPER_HIGH",
        category: "XSS",
      }],
      summary: "",
      false_positive_line_numbers: [],
    });

    const result = parseAgentResponse(content);
    expect(result.findings[0].severity).toBe("MEDIUM");
  });

  it("normalizes invalid category to OTHER", () => {
    const content = JSON.stringify({
      findings: [{
        title: "Test",
        description: "Test desc",
        severity: "LOW",
        category: "UNKNOWN_CATEGORY",
      }],
      summary: "",
      false_positive_line_numbers: [],
    });

    const result = parseAgentResponse(content);
    expect(result.findings[0].category).toBe("OTHER");
  });

  it("filters out findings missing required fields", () => {
    const content = JSON.stringify({
      findings: [
        { title: "Valid", description: "desc", severity: "HIGH", category: "XSS" },
        { title: "No description", severity: "HIGH", category: "XSS" },
        { description: "No title", severity: "HIGH", category: "XSS" },
        { title: "No severity", description: "desc", category: "XSS" },
      ],
      summary: "",
      false_positive_line_numbers: [],
    });

    const result = parseAgentResponse(content);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toBe("Valid");
  });

  it("clamps confidence to [0, 1]", () => {
    const content = JSON.stringify({
      findings: [{
        title: "Test",
        description: "desc",
        severity: "HIGH",
        category: "XSS",
        confidence: 1.5,
      }],
      summary: "",
      false_positive_line_numbers: [],
    });

    const result = parseAgentResponse(content);
    expect(result.findings[0].confidence).toBe(1.0);
  });

  it("handles null lineNumber", () => {
    const content = JSON.stringify({
      findings: [{
        title: "Rate anomaly",
        description: "Unusual traffic pattern",
        severity: "MEDIUM",
        category: "RATE_ANOMALY",
        lineNumber: null,
      }],
      summary: "",
      false_positive_line_numbers: [],
    });

    const result = parseAgentResponse(content);
    expect(result.findings[0].lineNumber).toBeNull();
  });

  it("returns empty findings and defaults for missing fields", () => {
    const content = JSON.stringify({
      findings: [],
      summary: "",
      false_positive_line_numbers: [],
    });

    const result = parseAgentResponse(content);
    expect(result.findings).toEqual([]);
    expect(result.summary).toBe("");
    expect(result.falsePositiveLineNumbers).toEqual([]);
  });

  it("handles missing optional top-level fields", () => {
    const content = JSON.stringify({ findings: [] });

    const result = parseAgentResponse(content);
    expect(result.summary).toBe("");
    expect(result.falsePositiveLineNumbers).toEqual([]);
  });

  it("truncates long title and description", () => {
    const content = JSON.stringify({
      findings: [{
        title: "A".repeat(600),
        description: "B".repeat(2500),
        severity: "HIGH",
        category: "XSS",
      }],
      summary: "",
      false_positive_line_numbers: [],
    });

    const result = parseAgentResponse(content);
    expect(result.findings[0].title.length).toBe(500);
    expect(result.findings[0].description.length).toBe(2000);
  });

  it("throws on completely invalid content", () => {
    expect(() => parseAgentResponse("not json at all")).toThrow();
  });

  it("sets all RawFinding fields correctly", () => {
    const content = JSON.stringify({
      findings: [{
        title: "Test Finding",
        description: "Test description",
        severity: "CRITICAL",
        category: "COMMAND_INJECTION",
        lineNumber: 100,
        recommendation: "Fix it",
        confidence: 0.85,
        mitreTactic: "Execution",
        mitreTechnique: "T1059",
      }],
      summary: "Summary text",
      false_positive_line_numbers: [1, 2, 3],
    });

    const result = parseAgentResponse(content);
    const f = result.findings[0];

    expect(f.source).toBe("LLM");
    expect(f.lineContent).toBeNull(); // populated by caller
    expect(f.matchedPattern).toBeNull();
    expect(f.recommendation).toBe("Fix it");
    expect(f.mitreTactic).toBe("Execution");
    expect(f.mitreTechnique).toBe("T1059");
    expect(f.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });
});
