import type { RawFinding, RuleContext } from "@/analysis/types";
import { computeFingerprint, truncateLine } from "../utils";

interface SqlPattern {
  regex: RegExp;
  label: string;
  severity: "CRITICAL" | "HIGH";
  confidence: number;
  description: string;
}

const SQL_PATTERNS: SqlPattern[] = [
  // Classic UNION-based injection
  {
    regex: /UNION\s+(ALL\s+)?SELECT/i,
    label: "UNION SELECT",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "UNION-based SQL injection attempting to extract data from other tables",
  },
  // Tautology-based injection
  {
    regex: /['"]?\s*OR\s+['"]?1['"]?\s*=\s*['"]?1/i,
    label: "OR 1=1 tautology",
    severity: "HIGH",
    confidence: 0.9,
    description: "Tautology-based SQL injection attempting to bypass authentication or extract all records",
  },
  {
    regex: /['"]?\s*OR\s+['"]?1['"]?\s*=\s*['"]?1\s*--/i,
    label: "OR 1=1 with comment",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Tautology-based SQL injection with comment terminator to bypass query logic",
  },
  // DROP TABLE
  {
    regex: /DROP\s+TABLE/i,
    label: "DROP TABLE",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "SQL injection attempting to destroy database tables",
  },
  // DELETE FROM without WHERE (dangerous)
  {
    regex: /DELETE\s+FROM\s+\w+\s*(?:;|--|$)/i,
    label: "DELETE FROM",
    severity: "CRITICAL",
    confidence: 0.85,
    description: "SQL injection attempting to delete records from a database table",
  },
  // INSERT INTO
  {
    regex: /INSERT\s+INTO\s+\w+/i,
    label: "INSERT INTO",
    severity: "HIGH",
    confidence: 0.8,
    description: "SQL injection attempting to insert malicious data into database tables",
  },
  // Time-based blind SQLi
  {
    regex: /WAITFOR\s+DELAY/i,
    label: "WAITFOR DELAY (time-based blind SQLi)",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Time-based blind SQL injection using MSSQL WAITFOR DELAY to infer data",
  },
  {
    regex: /BENCHMARK\s*\(/i,
    label: "BENCHMARK() (time-based blind SQLi)",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Time-based blind SQL injection using MySQL BENCHMARK function to infer data",
  },
  {
    regex: /SLEEP\s*\(\s*\d+\s*\)/i,
    label: "SLEEP() (time-based blind SQLi)",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Time-based blind SQL injection using SLEEP function to infer data",
  },
  // URL-encoded variants
  {
    regex: /%27\s*(OR|AND)\s*%27/i,
    label: "URL-encoded quote injection",
    severity: "HIGH",
    confidence: 0.85,
    description: "SQL injection using URL-encoded single quotes to evade input filters",
  },
  {
    regex: /%55NION\s+%53ELECT/i,
    label: "URL-encoded UNION SELECT",
    severity: "CRITICAL",
    confidence: 0.9,
    description: "SQL injection using partial URL encoding to bypass WAF rules",
  },
  {
    regex: /UNION%20SELECT/i,
    label: "URL-encoded UNION SELECT (space)",
    severity: "CRITICAL",
    confidence: 0.9,
    description: "UNION-based SQL injection with URL-encoded spaces",
  },
  {
    regex: /UNION%0ASELECT/i,
    label: "URL-encoded UNION SELECT (newline)",
    severity: "CRITICAL",
    confidence: 0.9,
    description: "UNION-based SQL injection with URL-encoded newline to bypass WAF",
  },
  // Stacked queries
  {
    regex: /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\s/i,
    label: "Stacked SQL query",
    severity: "HIGH",
    confidence: 0.8,
    description: "Potential stacked SQL query injection attempting to execute multiple statements",
  },
  // Comment-based evasion
  {
    regex: /\/\*.*\*\/\s*(UNION|SELECT|DROP|INSERT|DELETE)/i,
    label: "Comment-based SQL injection evasion",
    severity: "HIGH",
    confidence: 0.85,
    description: "SQL injection using inline comments to evade pattern-matching defenses",
  },
  // CHAR() obfuscation
  {
    regex: /CHAR\s*\(\s*\d+/i,
    label: "CHAR() function obfuscation",
    severity: "HIGH",
    confidence: 0.75,
    description: "SQL injection using CHAR() function to build strings and evade detection",
  },
  // CONCAT for data extraction
  {
    regex: /CONCAT\s*\(.*SELECT/i,
    label: "CONCAT with SELECT subquery",
    severity: "HIGH",
    confidence: 0.85,
    description: "SQL injection using CONCAT to extract and combine data from queries",
  },
  // Information schema enumeration
  {
    regex: /INFORMATION_SCHEMA\.(TABLES|COLUMNS|SCHEMATA)/i,
    label: "INFORMATION_SCHEMA enumeration",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "SQL injection enumerating database metadata to map table and column structures",
  },
  // Hex-encoded injection
  {
    regex: /0x[0-9a-f]{8,}/i,
    label: "Hex-encoded SQL payload",
    severity: "HIGH",
    confidence: 0.7,
    description: "Potential SQL injection using hexadecimal encoding to obfuscate payloads",
  },
];

export function checkSqlInjection(
  line: string,
  lineNumber: number,
  _context: RuleContext
): RawFinding[] {
  const findings: RawFinding[] = [];
  const lineContent = truncateLine(line);

  for (const pattern of SQL_PATTERNS) {
    const match = line.match(pattern.regex);
    if (match) {
      findings.push({
        severity: pattern.severity,
        category: "SQL_INJECTION",
        title: `SQL Injection Detected: ${pattern.label}`,
        description: pattern.description,
        lineNumber,
        lineContent,
        matchedPattern: match[0],
        source: "RULE_BASED",
        fingerprint: computeFingerprint("SQL_INJECTION", lineNumber, match[0]),
        recommendation:
          "Use parameterized queries or prepared statements. Validate and sanitize all user input. Deploy a Web Application Firewall (WAF) to block known injection patterns. Review application code for concatenated SQL queries.",
        confidence: pattern.confidence,
        mitreTactic: "Initial Access",
        mitreTechnique: "T1190 - Exploit Public-Facing Application",
      });
    }
  }

  return findings;
}
