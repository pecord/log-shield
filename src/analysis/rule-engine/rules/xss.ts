import type { RawFinding, RuleContext } from "@/analysis/types";
import { computeFingerprint, truncateLine } from "../utils";

interface XssPattern {
  regex: RegExp;
  label: string;
  severity: "HIGH" | "MEDIUM";
  confidence: number;
  description: string;
}

export const XSS_PATTERNS: XssPattern[] = [
  // Script tags
  {
    regex: /<\s*script[^>]*>/i,
    label: "<script> tag injection",
    severity: "HIGH",
    confidence: 0.95,
    description: "Cross-site scripting attempt using inline script tag to execute arbitrary JavaScript",
  },
  {
    regex: /<\s*\/\s*script\s*>/i,
    label: "</script> closing tag",
    severity: "HIGH",
    confidence: 0.9,
    description: "Closing script tag detected, indicating possible script injection payload",
  },
  // Encoded script tags
  {
    regex: /%3C\s*script/i,
    label: "URL-encoded <script>",
    severity: "HIGH",
    confidence: 0.9,
    description: "Cross-site scripting attempt using URL-encoded script tags to bypass input filters",
  },
  {
    regex: /&lt;\s*script/i,
    label: "HTML-encoded <script>",
    severity: "MEDIUM",
    confidence: 0.8,
    description: "HTML-encoded script tag detected; may indicate XSS attempt or double-encoding bypass",
  },
  // javascript: URI scheme
  {
    regex: /javascript\s*:/i,
    label: "javascript: URI",
    severity: "HIGH",
    confidence: 0.9,
    description: "Cross-site scripting attempt using javascript: URI scheme to execute code via links or attributes",
  },
  // Event handlers
  {
    regex: /\bon(load|error|click|mouseover|mouseout|focus|blur|submit|change|input|keydown|keyup|keypress)\s*=/i,
    label: "Event handler injection",
    severity: "HIGH",
    confidence: 0.85,
    description: "Cross-site scripting attempt injecting HTML event handler attributes to execute JavaScript",
  },
  // data: URI with scripts
  {
    regex: /data\s*:\s*text\/html/i,
    label: "data: text/html URI",
    severity: "HIGH",
    confidence: 0.85,
    description: "Cross-site scripting attempt using data: URI with HTML content type to execute scripts",
  },
  // eval() calls
  {
    regex: /eval\s*\(/i,
    label: "eval() call",
    severity: "MEDIUM",
    confidence: 0.75,
    description: "Potential XSS payload using eval() to dynamically execute JavaScript code",
  },
  // document.cookie access
  {
    regex: /document\s*\.\s*cookie/i,
    label: "document.cookie access",
    severity: "HIGH",
    confidence: 0.9,
    description: "Attempt to access session cookies via document.cookie, commonly used for session hijacking",
  },
  // document.write
  {
    regex: /document\s*\.\s*write\s*\(/i,
    label: "document.write() call",
    severity: "MEDIUM",
    confidence: 0.8,
    description: "Potential XSS using document.write() to inject content into the page DOM",
  },
  // innerHTML manipulation
  {
    regex: /\.innerHTML\s*=/i,
    label: "innerHTML assignment",
    severity: "MEDIUM",
    confidence: 0.7,
    description: "Potential DOM-based XSS through innerHTML assignment that could render untrusted HTML",
  },
  // SVG-based XSS
  {
    regex: /<\s*svg[^>]*\s+on\w+\s*=/i,
    label: "SVG-based XSS",
    severity: "HIGH",
    confidence: 0.9,
    description: "Cross-site scripting attempt using SVG elements with event handlers",
  },
  // IMG tag with onerror
  {
    regex: /<\s*img[^>]*\s+onerror\s*=/i,
    label: "IMG onerror XSS",
    severity: "HIGH",
    confidence: 0.95,
    description: "Cross-site scripting using img tag with onerror event handler to execute JavaScript",
  },
  // iframe injection
  {
    regex: /<\s*iframe[^>]*>/i,
    label: "iframe injection",
    severity: "MEDIUM",
    confidence: 0.8,
    description: "Potential XSS or phishing attack via injected iframe element",
  },
  // String.fromCharCode obfuscation
  {
    regex: /String\s*\.\s*fromCharCode/i,
    label: "String.fromCharCode obfuscation",
    severity: "MEDIUM",
    confidence: 0.8,
    description: "JavaScript obfuscation technique commonly used to hide XSS payloads",
  },
  // window.location manipulation
  {
    regex: /window\s*\.\s*location\s*[=.]/i,
    label: "window.location manipulation",
    severity: "MEDIUM",
    confidence: 0.75,
    description: "Potential XSS or open redirect attempt by manipulating window.location",
  },
  // atob() decoding (common in obfuscated XSS)
  {
    regex: /atob\s*\(/i,
    label: "atob() Base64 decoding",
    severity: "MEDIUM",
    confidence: 0.7,
    description: "Base64 decoding function commonly used to obfuscate XSS payloads",
  },
  // Expression() CSS XSS (IE-specific but still checked)
  {
    regex: /expression\s*\(/i,
    label: "CSS expression() XSS",
    severity: "MEDIUM",
    confidence: 0.7,
    description: "CSS expression() function that can execute JavaScript, primarily affects older browsers",
  },
];

export function checkXss(
  line: string,
  lineNumber: number,
  _context: RuleContext
): RawFinding[] {
  const findings: RawFinding[] = [];
  const lineContent = truncateLine(line);

  for (const pattern of XSS_PATTERNS) {
    const match = line.match(pattern.regex);
    if (match) {
      findings.push({
        severity: pattern.severity,
        category: "XSS",
        title: `XSS Detected: ${pattern.label}`,
        description: pattern.description,
        lineNumber,
        lineContent,
        matchedPattern: match[0],
        source: "RULE_BASED",
        fingerprint: computeFingerprint("XSS", lineNumber, match[0]),
        recommendation:
          "Implement context-aware output encoding for all user-supplied data. Use Content Security Policy (CSP) headers to restrict inline script execution. Sanitize HTML input with a library like DOMPurify. Validate input on both client and server side.",
        confidence: pattern.confidence,
        mitreTactic: "Initial Access",
        mitreTechnique: "T1189 - Drive-by Compromise",
      });
    }
  }

  return findings;
}
