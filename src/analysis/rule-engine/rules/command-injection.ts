import type { RawFinding, RuleContext } from "@/analysis/types";
import { computeFingerprint, truncateLine } from "../utils";

interface CmdPattern {
  regex: RegExp;
  label: string;
  severity: "CRITICAL";
  confidence: number;
  description: string;
}

export const CMD_PATTERNS: CmdPattern[] = [
  // Shell metacharacters in request parameters (common injection vectors)
  {
    regex: /[?&=][^&]*[;|`]\s*(ls|cat|id|whoami|uname|pwd|wget|curl|nc|bash|sh|python|perl|ruby|php)\b/i,
    label: "Shell command in URL parameter",
    severity: "CRITICAL",
    confidence: 0.9,
    description: "Command injection via URL parameter using shell metacharacters to execute system commands",
  },
  // Reverse shell patterns
  {
    regex: /bash\s+-i\s+>&?\s*\/dev\/tcp/i,
    label: "Bash reverse shell",
    severity: "CRITICAL",
    confidence: 0.98,
    description: "Bash reverse shell payload attempting to establish an interactive connection back to the attacker",
  },
  {
    regex: /\/dev\/tcp\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d+/,
    label: "/dev/tcp reverse connection",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Attempt to establish a TCP connection using Bash /dev/tcp pseudo-device for reverse shell",
  },
  {
    regex: /nc\s+(-[enlvp]+\s+)*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\s+\d+\s*(-e\s+\/bin\/(ba)?sh)?/i,
    label: "Netcat reverse shell",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Netcat-based reverse shell attempting to connect back to the attacker with shell access",
  },
  {
    regex: /python[23]?\s+-c\s+['"]import\s+socket/i,
    label: "Python reverse shell",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Python-based reverse shell using socket library to establish attacker connection",
  },
  {
    regex: /perl\s+-e\s+['"]use\s+Socket/i,
    label: "Perl reverse shell",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Perl-based reverse shell using Socket module for attacker connection",
  },
  // wget/curl downloading payloads
  {
    regex: /wget\s+https?:\/\//i,
    label: "wget downloading remote payload",
    severity: "CRITICAL",
    confidence: 0.85,
    description: "Command injection using wget to download a remote payload, potentially a malware dropper",
  },
  {
    regex: /curl\s+(-[sSkLfO]+\s+)*https?:\/\//i,
    label: "curl downloading remote payload",
    severity: "CRITICAL",
    confidence: 0.85,
    description: "Command injection using curl to download a remote payload from an external server",
  },
  {
    regex: /curl\s+.*\|\s*(ba)?sh/i,
    label: "curl piped to shell",
    severity: "CRITICAL",
    confidence: 0.98,
    description: "Extremely dangerous pattern: downloading and directly executing a remote script via curl piped to shell",
  },
  {
    regex: /wget\s+.*\|\s*(ba)?sh/i,
    label: "wget piped to shell",
    severity: "CRITICAL",
    confidence: 0.98,
    description: "Extremely dangerous pattern: downloading and directly executing a remote script via wget piped to shell",
  },
  // Destructive commands
  {
    regex: /rm\s+(-[rf]+\s+)*\//i,
    label: "rm -rf / destructive command",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Destructive command attempting to recursively delete files from the root filesystem",
  },
  {
    regex: /mkfs\./i,
    label: "mkfs filesystem format attempt",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Attempt to format a filesystem, which would destroy all data on the target device",
  },
  {
    regex: /dd\s+if=.*of=\/dev\//i,
    label: "dd disk overwrite",
    severity: "CRITICAL",
    confidence: 0.95,
    description: "Attempt to overwrite disk devices using dd, which would destroy data",
  },
  // Backtick and $() command substitution
  {
    regex: /`[^`]*\b(cat|ls|id|whoami|uname|wget|curl|nc|bash|sh|python|perl)\b[^`]*`/i,
    label: "Backtick command substitution",
    severity: "CRITICAL",
    confidence: 0.9,
    description: "Command injection via backtick command substitution to execute embedded system commands",
  },
  {
    regex: /\$\(\s*(cat|ls|id|whoami|uname|wget|curl|nc|bash|sh|python|perl)\b/i,
    label: "$() command substitution",
    severity: "CRITICAL",
    confidence: 0.9,
    description: "Command injection via $() command substitution to execute embedded system commands",
  },
  // Pipe to shell
  {
    regex: /\|\s*(ba)?sh\s*$/i,
    label: "Pipe to shell",
    severity: "CRITICAL",
    confidence: 0.9,
    description: "Output piped directly into a shell interpreter for execution",
  },
  // chmod for privilege manipulation
  {
    regex: /chmod\s+[0-7]{3,4}\s+/i,
    label: "chmod permission change",
    severity: "CRITICAL",
    confidence: 0.8,
    description: "Command injection attempting to change file permissions, potentially making files executable or world-writable",
  },
  // chown for ownership manipulation
  {
    regex: /chown\s+\w+/i,
    label: "chown ownership change",
    severity: "CRITICAL",
    confidence: 0.8,
    description: "Command injection attempting to change file ownership for privilege escalation",
  },
  // crontab manipulation
  {
    regex: /crontab\s/i,
    label: "crontab manipulation",
    severity: "CRITICAL",
    confidence: 0.85,
    description: "Attempt to modify cron jobs for persistence or scheduled malicious command execution",
  },
  // Environment variable injection
  {
    regex: /\bexport\s+\w+=.*[;|`]/i,
    label: "Environment variable injection",
    severity: "CRITICAL",
    confidence: 0.85,
    description: "Environment variable manipulation combined with command chaining, potentially altering program behavior",
  },
];

export function checkCommandInjection(
  line: string,
  lineNumber: number,
  _context: RuleContext
): RawFinding[] {
  const findings: RawFinding[] = [];
  const lineContent = truncateLine(line);

  for (const pattern of CMD_PATTERNS) {
    const match = line.match(pattern.regex);
    if (match) {
      findings.push({
        severity: pattern.severity,
        category: "COMMAND_INJECTION",
        title: `Command Injection Detected: ${pattern.label}`,
        description: pattern.description,
        lineNumber,
        lineContent,
        matchedPattern: match[0],
        source: "RULE_BASED",
        fingerprint: computeFingerprint(
          "COMMAND_INJECTION",
          lineNumber,
          match[0]
        ),
        recommendation:
          "Never pass user input directly to system shell commands. Use parameterized APIs or safe library functions instead of shell execution. Apply strict input validation with allowlists. Run application processes with least-privilege accounts. Implement sandboxing or containerization to limit blast radius.",
        confidence: pattern.confidence,
        mitreTactic: "Execution",
        mitreTechnique: "T1059 - Command and Scripting Interpreter",
      });
    }
  }

  return findings;
}
