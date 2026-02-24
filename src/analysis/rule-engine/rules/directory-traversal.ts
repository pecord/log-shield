import type { RawFinding, RuleContext } from "@/analysis/types";
import { computeFingerprint, truncateLine } from "../utils";

interface TraversalPattern {
  regex: RegExp;
  label: string;
  severity: "CRITICAL" | "HIGH";
  confidence: number;
  description: string;
}

const TRAVERSAL_PATTERNS: TraversalPattern[] = [
  // Basic directory traversal
  {
    regex: /\.\.\//,
    label: "../ path traversal",
    severity: "HIGH",
    confidence: 0.85,
    description: "Directory traversal attempt using ../ sequences to navigate outside the web root",
  },
  {
    regex: /\.\.\\/,
    label: "..\\ path traversal (Windows)",
    severity: "HIGH",
    confidence: 0.85,
    description: "Windows-style directory traversal attempt using ..\\ sequences",
  },
  // Deep traversal (multiple levels)
  {
    regex: /(\.\.\/?){3,}/,
    label: "Deep path traversal (3+ levels)",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Deep directory traversal with multiple ../ sequences, strongly suggesting an attack rather than a misconfigured link",
  },
  // URL-encoded variants
  {
    regex: /%2e%2e[%2f%5c]/i,
    label: "URL-encoded traversal (%2e%2e)",
    severity: "HIGH",
    confidence: 0.9,
    description: "Directory traversal using URL-encoded dots and slashes to evade input filters",
  },
  {
    regex: /\.\.%2f/i,
    label: "Partially encoded traversal (..%2f)",
    severity: "HIGH",
    confidence: 0.9,
    description: "Directory traversal using partially URL-encoded path separators",
  },
  {
    regex: /%2e%2e\//i,
    label: "Partially encoded traversal (%2e%2e/)",
    severity: "HIGH",
    confidence: 0.9,
    description: "Directory traversal using URL-encoded dots with literal slash",
  },
  // Double encoding
  {
    regex: /%252e%252e/i,
    label: "Double-encoded traversal",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Double URL-encoded directory traversal attempt designed to bypass WAF and input validation",
  },
  // Null byte injection (classic for older runtimes)
  {
    regex: /%00/,
    label: "Null byte injection",
    severity: "HIGH",
    confidence: 0.85,
    description: "Null byte injection that may terminate strings early and allow path traversal in older runtimes",
  },
  // Sensitive Unix files
  {
    regex: /\/etc\/passwd/i,
    label: "/etc/passwd access",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Attempt to read the Unix password file, a classic indicator of directory traversal exploitation",
  },
  {
    regex: /\/etc\/shadow/i,
    label: "/etc/shadow access",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Attempt to read the Unix shadow password file containing hashed passwords",
  },
  {
    regex: /\/etc\/hosts/i,
    label: "/etc/hosts access",
    severity: "HIGH",
    confidence: 0.85,
    description: "Attempt to read the system hosts file for network reconnaissance",
  },
  // proc filesystem
  {
    regex: /\/proc\/self\/environ/i,
    label: "/proc/self/environ access",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Attempt to read process environment variables which may contain secrets, API keys, or database credentials",
  },
  {
    regex: /\/proc\/self\/cmdline/i,
    label: "/proc/self/cmdline access",
    severity: "HIGH",
    confidence: 0.9,
    description: "Attempt to read the process command line arguments for information disclosure",
  },
  {
    regex: /\/proc\/version/i,
    label: "/proc/version access",
    severity: "HIGH",
    confidence: 0.85,
    description: "Attempt to read kernel version information for targeted exploitation",
  },
  // PHP wrappers
  {
    regex: /php:\/\/filter/i,
    label: "PHP filter wrapper",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "PHP stream wrapper exploitation to read source code via Base64 encoding, bypassing normal file restrictions",
  },
  {
    regex: /php:\/\/input/i,
    label: "PHP input wrapper",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "PHP input wrapper that allows reading raw POST data, often used for remote code execution via LFI",
  },
  {
    regex: /expect:\/\//i,
    label: "PHP expect wrapper",
    severity: "CRITICAL",
    confidence: 0.9,
    description: "PHP expect:// wrapper that enables command execution through local file inclusion vulnerabilities",
  },
  // Windows-specific paths
  {
    regex: /[Cc]:\\[Ww]indows\\system32/i,
    label: "Windows system32 access",
    severity: "CRITICAL",
    confidence: 0.9,
    description: "Attempt to access Windows system32 directory, indicating path traversal on a Windows host",
  },
  {
    regex: /[Cc]:\\boot\.ini/i,
    label: "Windows boot.ini access",
    severity: "CRITICAL",
    confidence: 0.9,
    description: "Attempt to read Windows boot configuration file through directory traversal",
  },
];

export function checkDirectoryTraversal(
  line: string,
  lineNumber: number,
  _context: RuleContext
): RawFinding[] {
  const findings: RawFinding[] = [];
  const lineContent = truncateLine(line);

  for (const pattern of TRAVERSAL_PATTERNS) {
    const match = line.match(pattern.regex);
    if (match) {
      findings.push({
        severity: pattern.severity,
        category: "DIRECTORY_TRAVERSAL",
        title: `Directory Traversal Detected: ${pattern.label}`,
        description: pattern.description,
        lineNumber,
        lineContent,
        matchedPattern: match[0],
        source: "RULE_BASED",
        fingerprint: computeFingerprint(
          "DIRECTORY_TRAVERSAL",
          lineNumber,
          match[0]
        ),
        recommendation:
          "Validate and canonicalize all file paths before use. Use a whitelist of allowed files or directories. Never pass user input directly to file system APIs. Deploy chroot jails or containerization to limit filesystem access. Strip or reject path traversal sequences in input validation.",
        confidence: pattern.confidence,
        mitreTactic: "Collection",
        mitreTechnique: "T1005 - Data from Local System",
      });
    }
  }

  return findings;
}
