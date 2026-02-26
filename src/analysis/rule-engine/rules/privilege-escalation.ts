import type { RawFinding, RuleContext } from "@/analysis/types";
import { computeFingerprint, truncateLine } from "../utils";

interface EscalationPattern {
  regex: RegExp;
  label: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  confidence: number;
  description: string;
}

export const ESCALATION_PATTERNS: EscalationPattern[] = [
  // sudo invocations
  {
    regex: /sudo\s+(-[isSHEu]\s+)*\b(su|bash|sh|passwd|visudo|useradd|usermod|groupadd)\b/i,
    label: "sudo privilege command",
    severity: "HIGH",
    confidence: 0.85,
    description:
      "Privileged command executed via sudo, potentially escalating user permissions to root",
  },
  {
    regex: /sudo\s+-i\b/,
    label: "sudo interactive root shell",
    severity: "CRITICAL",
    confidence: 0.9,
    description:
      "Interactive root shell obtained via sudo -i, granting full system control",
  },
  {
    regex: /sudo\s+su\s*(-\s*)?$/,
    label: "sudo su root escalation",
    severity: "CRITICAL",
    confidence: 0.9,
    description:
      "Escalation to root user via sudo su, gaining unrestricted access",
  },

  // setuid/setgid bit manipulation
  {
    regex: /chmod\s+[u+]*s\s/i,
    label: "chmod setuid/setgid",
    severity: "CRITICAL",
    confidence: 0.92,
    description:
      "Setting the setuid or setgid bit on a file, allowing it to execute with the owner's privileges",
  },
  {
    regex: /chmod\s+[42][0-7]{3}\s/,
    label: "chmod numeric setuid/setgid",
    severity: "CRITICAL",
    confidence: 0.92,
    description:
      "Setting setuid (4xxx) or setgid (2xxx) via numeric permissions, a common privilege escalation technique",
  },

  // Ownership changes on sensitive files
  {
    regex: /chown\s+(root|0)[:.]?\s/i,
    label: "chown to root",
    severity: "HIGH",
    confidence: 0.8,
    description:
      "Changing file ownership to root, potentially enabling privileged execution",
  },

  // sudoers file modifications
  {
    regex: /\/etc\/sudoers/,
    label: "sudoers file access",
    severity: "CRITICAL",
    confidence: 0.95,
    description:
      "Access or modification of /etc/sudoers, which controls sudo privileges for all users",
  },
  {
    regex: /visudo/,
    label: "visudo invocation",
    severity: "HIGH",
    confidence: 0.85,
    description:
      "visudo invoked to edit sudoers configuration, potentially granting new privileges",
  },

  // User/group membership changes
  {
    regex: /usermod\s+.*-[aG]+\s/i,
    label: "usermod group membership change",
    severity: "HIGH",
    confidence: 0.85,
    description:
      "User added to a group via usermod, potentially granting elevated access (e.g., sudo, docker, wheel)",
  },
  {
    regex: /gpasswd\s+-a\s+\w+\s+(sudo|wheel|admin|docker|root)/i,
    label: "gpasswd privileged group add",
    severity: "CRITICAL",
    confidence: 0.9,
    description:
      "User added to a privileged group (sudo/wheel/admin/docker) via gpasswd",
  },

  // pkexec / doas (alternative privilege escalation tools)
  {
    regex: /\bpkexec\b/,
    label: "pkexec invocation",
    severity: "HIGH",
    confidence: 0.8,
    description:
      "pkexec used to execute a command with elevated privileges via PolicyKit",
  },
  {
    regex: /\bdoas\b/,
    label: "doas invocation",
    severity: "HIGH",
    confidence: 0.8,
    description:
      "doas used to execute commands as another user, similar to sudo",
  },

  // Password/shadow file access
  {
    regex: /\/etc\/(shadow|passwd|gshadow|master\.passwd)/,
    label: "sensitive auth file access",
    severity: "HIGH",
    confidence: 0.85,
    description:
      "Access to critical authentication files (shadow/passwd) which contain user credential data",
  },

  // Windows privilege escalation
  {
    regex: /net\s+localgroup\s+administrators\s+/i,
    label: "Windows admin group modification",
    severity: "CRITICAL",
    confidence: 0.92,
    description:
      "Modification of the local Administrators group on Windows, granting full system access",
  },
  {
    regex: /runas\s+\/user:/i,
    label: "Windows runas privilege switch",
    severity: "HIGH",
    confidence: 0.8,
    description:
      "runas used to execute a command as another user on Windows, potentially escalating privileges",
  },

  // Capability manipulation (Linux)
  {
    regex: /setcap\s/i,
    label: "Linux capability assignment",
    severity: "HIGH",
    confidence: 0.85,
    description:
      "File capabilities being set via setcap, which can grant root-equivalent powers to executables",
  },

  // PAM configuration changes
  {
    regex: /\/etc\/pam\.d\//,
    label: "PAM configuration access",
    severity: "HIGH",
    confidence: 0.8,
    description:
      "Access to PAM configuration files, which control authentication policies and could weaken security",
  },
];

export function checkPrivilegeEscalation(
  line: string,
  lineNumber: number,
  _context: RuleContext
): RawFinding[] {
  const findings: RawFinding[] = [];
  const lineContent = truncateLine(line);

  for (const pattern of ESCALATION_PATTERNS) {
    const match = line.match(pattern.regex);
    if (match) {
      findings.push({
        severity: pattern.severity,
        category: "PRIVILEGE_ESCALATION",
        title: `Privilege Escalation: ${pattern.label}`,
        description: pattern.description,
        lineNumber,
        lineContent,
        matchedPattern: match[0],
        source: "RULE_BASED",
        fingerprint: computeFingerprint(
          "PRIVILEGE_ESCALATION",
          lineNumber,
          match[0]
        ),
        recommendation:
          "Review and restrict sudo/su access. Enforce the principle of least privilege. Monitor and alert on privilege changes. Audit sudoers and group membership modifications regularly. Use centralized identity management to control elevated access.",
        confidence: pattern.confidence,
        mitreTactic: "Privilege Escalation",
        mitreTechnique: "T1548 - Abuse Elevation Control Mechanism",
      });
    }
  }

  return findings;
}
