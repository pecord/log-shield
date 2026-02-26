/**
 * Centralized registry of all detection rules for display in the Rules page.
 * Imports pattern arrays from each rule file and re-exports them
 * in a typed, display-friendly format.
 */

import { SQL_PATTERNS } from "@/analysis/rule-engine/rules/sql-injection";
import { XSS_PATTERNS } from "@/analysis/rule-engine/rules/xss";
import { FAILED_AUTH_PATTERNS } from "@/analysis/rule-engine/rules/brute-force";
import { TRAVERSAL_PATTERNS } from "@/analysis/rule-engine/rules/directory-traversal";
import { CMD_PATTERNS } from "@/analysis/rule-engine/rules/command-injection";
import { STATUS_MAP } from "@/analysis/rule-engine/rules/suspicious-status";
import { MALICIOUS_AGENT_PATTERNS } from "@/analysis/rule-engine/rules/malicious-agents";
import { ESCALATION_PATTERNS } from "@/analysis/rule-engine/rules/privilege-escalation";
import { EXFIL_PATTERNS } from "@/analysis/rule-engine/rules/data-exfiltration";
import { CATEGORY_LABELS } from "@/lib/constants";

// ---- Types ----

export interface RulePattern {
  label: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  confidence: number;
  description: string;
  pattern: string; // regex.source
}

export interface RuleCategory {
  category: string;
  label: string;
  description: string;
  mitreTactic: string;
  mitreTechnique: string;
  patternCount: number;
  patterns: RulePattern[];
}

// ---- Helpers ----

/** Convert a typed pattern object (with regex, label, severity, confidence, description) to RulePattern */
function fromTypedPattern(p: {
  regex: RegExp;
  label: string;
  severity: string;
  confidence: number;
  description: string;
}): RulePattern {
  return {
    label: p.label,
    severity: p.severity as RulePattern["severity"],
    confidence: p.confidence,
    description: p.description,
    pattern: p.regex.source,
  };
}

// ---- Build the registry ----

export const RULES_REGISTRY: RuleCategory[] = [
  // 1. SQL Injection (19 patterns)
  {
    category: "SQL_INJECTION",
    label: CATEGORY_LABELS.SQL_INJECTION,
    description:
      "Detects SQL injection payloads including UNION-based, tautology-based, time-based blind, stacked queries, and encoded variants.",
    mitreTactic: "Initial Access",
    mitreTechnique: "T1190 - Exploit Public-Facing Application",
    patternCount: SQL_PATTERNS.length,
    patterns: SQL_PATTERNS.map(fromTypedPattern),
  },

  // 2. XSS (18 patterns)
  {
    category: "XSS",
    label: CATEGORY_LABELS.XSS,
    description:
      "Detects cross-site scripting attempts via script tags, event handlers, javascript: URIs, DOM manipulation, and encoded payloads.",
    mitreTactic: "Initial Access",
    mitreTechnique: "T1189 - Drive-by Compromise",
    patternCount: XSS_PATTERNS.length,
    patterns: XSS_PATTERNS.map(fromTypedPattern),
  },

  // 3. Brute Force (16 auth patterns + password spray detection)
  // FAILED_AUTH_PATTERNS is RegExp[] with no metadata — generate labels from regex source
  {
    category: "BRUTE_FORCE",
    label: CATEGORY_LABELS.BRUTE_FORCE,
    description:
      "Detects brute-force, credential-stuffing, and password spray attacks by counting failed authentication attempts per IP and tracking distinct targeted usernames.",
    mitreTactic: "Credential Access",
    mitreTechnique: "T1110 - Brute Force",
    patternCount: FAILED_AUTH_PATTERNS.length + 1, // +1 for password spray detection
    patterns: [
      ...FAILED_AUTH_PATTERNS.map((regex, i) => ({
        label: `Auth failure pattern #${i + 1}`,
        severity: "HIGH" as const,
        confidence: 0.9,
        description:
          "Matches a failed authentication log entry. Findings are generated when a single IP exceeds the brute-force threshold (10 failures).",
        pattern: regex.source,
      })),
      {
        label: "Password Spray Detection",
        severity: "CRITICAL" as const,
        confidence: 0.95,
        description:
          "Detects password spray attacks where a single IP targets 5+ distinct user accounts. Maps to MITRE T1110.003 - Password Spraying.",
        pattern: "distinct users >= 5 per source IP",
      },
    ],
  },

  // 4. Directory Traversal (20 patterns)
  {
    category: "DIRECTORY_TRAVERSAL",
    label: CATEGORY_LABELS.DIRECTORY_TRAVERSAL,
    description:
      "Detects path traversal attacks including ../ sequences, URL-encoded and double-encoded variants, sensitive file access, and PHP wrapper exploitation.",
    mitreTactic: "Collection",
    mitreTechnique: "T1005 - Data from Local System",
    patternCount: TRAVERSAL_PATTERNS.length,
    patterns: TRAVERSAL_PATTERNS.map(fromTypedPattern),
  },

  // 5. Command Injection (19 patterns)
  {
    category: "COMMAND_INJECTION",
    label: CATEGORY_LABELS.COMMAND_INJECTION,
    description:
      "Detects OS command injection payloads including reverse shells, command substitution, destructive commands, and payload downloads.",
    mitreTactic: "Execution",
    mitreTechnique: "T1059 - Command and Scripting Interpreter",
    patternCount: CMD_PATTERNS.length,
    patterns: CMD_PATTERNS.map(fromTypedPattern),
  },

  // 6. Suspicious Status Codes (8 status entries + directory enumeration)
  {
    category: "SUSPICIOUS_STATUS_CODE",
    label: CATEGORY_LABELS.SUSPICIOUS_STATUS_CODE,
    description:
      "Flags HTTP error responses (4xx/5xx) that may indicate attack activity, scanning, or denial of service. Also detects directory enumeration via repeated 404s.",
    mitreTactic: "Reconnaissance / Impact",
    mitreTechnique: "T1595 / T1499",
    patternCount: STATUS_MAP.length + 1, // +1 for directory enumeration check
    patterns: [
      ...STATUS_MAP.map((s) => ({
        label: s.label,
        severity: s.severity as RulePattern["severity"],
        confidence: 0.6,
        description: s.description,
        pattern: `HTTP status ${s.code}`,
      })),
      {
        label: "Directory Enumeration (404 threshold)",
        severity: "HIGH" as const,
        confidence: 0.85,
        description:
          "Flags IPs generating 20+ 404 responses, indicating automated directory/file enumeration scanning.",
        pattern: "404 count >= 20 per IP",
      },
    ],
  },

  // 7. Rate Anomaly (3 checks — post-processing rule, no regex patterns)
  {
    category: "RATE_ANOMALY",
    label: CATEGORY_LABELS.RATE_ANOMALY,
    description:
      "Post-processing rule that analyzes request volume, error rates, and burst patterns across all log lines to detect anomalous traffic from individual IPs.",
    mitreTactic: "Impact / Reconnaissance",
    mitreTechnique: "T1498 / T1595",
    patternCount: 3,
    patterns: [
      {
        label: "High Request Volume",
        severity: "MEDIUM",
        confidence: 0.85,
        description:
          "Flags IPs exceeding 100 total requests. Severity escalates to HIGH at 500+ and CRITICAL at 1000+.",
        pattern: "totalRequests >= 100",
      },
      {
        label: "High Error Rate",
        severity: "HIGH",
        confidence: 0.8,
        description:
          "Flags IPs with >80% error response rate (4xx/5xx) across 10+ requests, indicating scanning or fuzzing.",
        pattern: "errorRate >= 80% AND totalRequests >= 10",
      },
      {
        label: "Request Burst Detection",
        severity: "HIGH",
        confidence: 0.85,
        description:
          "Flags IPs sending 20+ requests within a 5-second window, indicating automated burst traffic.",
        pattern: "20+ requests within 5000ms window",
      },
    ],
  },

  // 8. Malicious User Agents (22 tool patterns + 1 empty UA check = 23)
  {
    category: "MALICIOUS_USER_AGENT",
    label: CATEGORY_LABELS.MALICIOUS_USER_AGENT,
    description:
      "Identifies requests from known attack tools (Nikto, sqlmap, Nmap, etc.), directory brute-forcers, scripting libraries, and empty User-Agent headers.",
    mitreTactic: "Reconnaissance",
    mitreTechnique: "T1595 - Active Scanning",
    patternCount: MALICIOUS_AGENT_PATTERNS.length + 1, // +1 for empty UA check
    patterns: [
      ...MALICIOUS_AGENT_PATTERNS.map(fromTypedPattern),
      {
        label: "Empty User-Agent",
        severity: "LOW",
        confidence: 0.7,
        description:
          "Detects requests with an empty User-Agent header, which typically indicates automated tools or manually crafted requests.",
        pattern: 'User-Agent: ""',
      },
    ],
  },

  // 9. Privilege Escalation (18 patterns)
  {
    category: "PRIVILEGE_ESCALATION",
    label: CATEGORY_LABELS.PRIVILEGE_ESCALATION,
    description:
      "Detects privilege escalation attempts including sudo abuse, setuid/setgid manipulation, sudoers modifications, group membership changes, and Windows admin group modifications.",
    mitreTactic: "Privilege Escalation",
    mitreTechnique: "T1548 - Abuse Elevation Control Mechanism",
    patternCount: ESCALATION_PATTERNS.length,
    patterns: ESCALATION_PATTERNS.map(fromTypedPattern),
  },

  // 10. Data Exfiltration (17 patterns)
  {
    category: "DATA_EXFILTRATION",
    label: CATEGORY_LABELS.DATA_EXFILTRATION,
    description:
      "Detects data exfiltration activities including cloud storage uploads, large outbound transfers, DNS tunneling, archive creation of sensitive directories, and file transfers via FTP/SCP/SFTP.",
    mitreTactic: "Exfiltration",
    mitreTechnique: "T1048 - Exfiltration Over Alternative Protocol",
    patternCount: EXFIL_PATTERNS.length,
    patterns: EXFIL_PATTERNS.map(fromTypedPattern),
  },
];

/** Total count of all detection patterns across all categories */
export const TOTAL_PATTERN_COUNT = RULES_REGISTRY.reduce(
  (sum, cat) => sum + cat.patternCount,
  0
);

/** Total number of rule categories */
export const TOTAL_CATEGORY_COUNT = RULES_REGISTRY.length;
