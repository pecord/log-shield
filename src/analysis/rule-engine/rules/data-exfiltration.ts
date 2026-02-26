import type { RawFinding, RuleContext } from "@/analysis/types";
import { computeFingerprint, truncateLine } from "../utils";

interface ExfilPattern {
  regex: RegExp;
  label: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  confidence: number;
  description: string;
}

export const EXFIL_PATTERNS: ExfilPattern[] = [
  // Known exfiltration tools
  {
    regex: /\brclone\s+(sync|copy|move)\b/i,
    label: "rclone data transfer",
    severity: "CRITICAL",
    confidence: 0.9,
    description:
      "rclone used to sync/copy data to a remote storage provider, commonly used for data exfiltration",
  },
  {
    regex: /\bmegacmd\b|\bmega-put\b|\bmega-sync\b/i,
    label: "MEGA cloud exfil tool",
    severity: "CRITICAL",
    confidence: 0.9,
    description:
      "MEGA cloud storage CLI tool detected, frequently used by threat actors for data exfiltration",
  },

  // Cloud storage uploads in suspicious contexts
  {
    regex: /s3\.amazonaws\.com.*PUT/i,
    label: "S3 upload detected",
    severity: "HIGH",
    confidence: 0.7,
    description:
      "Data uploaded to AWS S3, which could be a legitimate operation or data exfiltration to an attacker-controlled bucket",
  },
  {
    regex: /blob\.core\.windows\.net.*PUT/i,
    label: "Azure Blob upload detected",
    severity: "HIGH",
    confidence: 0.7,
    description:
      "Data uploaded to Azure Blob Storage, potentially exfiltrating data to an external account",
  },
  {
    regex: /storage\.googleapis\.com.*PUT/i,
    label: "GCS upload detected",
    severity: "HIGH",
    confidence: 0.7,
    description:
      "Data uploaded to Google Cloud Storage, possibly exfiltrating data to an external project",
  },

  // Large outbound data transfers (bytes_out / bytes_sent in logs)
  {
    regex: /bytes_(?:out|sent)[=:\s]+(\d{8,})/i,
    label: "Large outbound data transfer",
    severity: "HIGH",
    confidence: 0.75,
    description:
      "Unusually large outbound data transfer detected (>10MB), which may indicate bulk data exfiltration",
  },
  {
    regex: /content[_-]length[=:\s]+(\d{8,})/i,
    label: "Large response content-length",
    severity: "MEDIUM",
    confidence: 0.65,
    description:
      "Large content-length in response may indicate bulk data being served to an unauthorized client",
  },

  // DNS tunneling indicators (long subdomain labels)
  {
    regex: /\b[a-z0-9]{50,}\.[a-z0-9-]+\.[a-z]{2,}\b/i,
    label: "DNS tunneling indicator",
    severity: "HIGH",
    confidence: 0.8,
    description:
      "Unusually long DNS subdomain label detected, a common indicator of DNS tunneling used to exfiltrate data covertly",
  },

  // Base64-encoded payloads in URLs
  {
    regex: /[?&=][A-Za-z0-9+/]{40,}={0,2}(&|$|\s)/,
    label: "Base64 payload in URL",
    severity: "HIGH",
    confidence: 0.75,
    description:
      "Large Base64-encoded payload detected in URL parameter, potentially encoding exfiltrated data",
  },

  // Suspicious archive creation targeting sensitive paths
  {
    regex: /\b(tar|zip|7z|rar)\b.*\/(etc|var\/log|home|root|\.ssh|\.aws|\.gnupg)/i,
    label: "Archive of sensitive directories",
    severity: "CRITICAL",
    confidence: 0.88,
    description:
      "Archive creation targeting sensitive system directories (credentials, keys, logs), a precursor to data exfiltration",
  },
  {
    regex: /\b(tar|zip|7z)\b.*\.(sql|dump|bak|backup|csv|xlsx?)\b/i,
    label: "Archive of database/backup files",
    severity: "HIGH",
    confidence: 0.8,
    description:
      "Archive creation involving database dumps or backup files, commonly staged before exfiltration",
  },

  // FTP/SCP/SFTP to external IPs
  {
    regex: /\bftp\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
    label: "FTP to external IP",
    severity: "HIGH",
    confidence: 0.8,
    description:
      "FTP connection to an IP address detected, commonly used for data exfiltration over unencrypted channels",
  },
  {
    regex: /\bscp\s+.*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:/,
    label: "SCP file transfer to external IP",
    severity: "HIGH",
    confidence: 0.8,
    description:
      "SCP file transfer to an external IP detected, potentially exfiltrating files over SSH",
  },
  {
    regex: /\bsftp\s+\w*@?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
    label: "SFTP connection to external IP",
    severity: "HIGH",
    confidence: 0.8,
    description:
      "SFTP connection to an external IP address, potentially transferring data out of the network",
  },

  // Curl/wget POST of local files
  {
    regex: /curl\s+.*-[dFT]\s+@?\//i,
    label: "curl uploading local file",
    severity: "HIGH",
    confidence: 0.8,
    description:
      "curl used to POST or upload a local file to a remote server, potentially exfiltrating data",
  },

  // Email-based exfiltration
  {
    regex: /\b(sendmail|mail|mutt|mailx)\b.*-[as]\s/i,
    label: "Email-based exfiltration",
    severity: "HIGH",
    confidence: 0.75,
    description:
      "Command-line mail utility used with attachment flag, potentially exfiltrating data via email",
  },
];

export function checkDataExfiltration(
  line: string,
  lineNumber: number,
  _context: RuleContext
): RawFinding[] {
  const findings: RawFinding[] = [];
  const lineContent = truncateLine(line);

  for (const pattern of EXFIL_PATTERNS) {
    const match = line.match(pattern.regex);
    if (match) {
      findings.push({
        severity: pattern.severity,
        category: "DATA_EXFILTRATION",
        title: `Data Exfiltration: ${pattern.label}`,
        description: pattern.description,
        lineNumber,
        lineContent,
        matchedPattern: match[0],
        source: "RULE_BASED",
        fingerprint: computeFingerprint(
          "DATA_EXFILTRATION",
          lineNumber,
          match[0]
        ),
        recommendation:
          "Implement Data Loss Prevention (DLP) controls. Monitor and alert on large outbound transfers. Restrict access to cloud storage and file transfer tools. Use network segmentation to limit lateral movement. Audit and log all data access to sensitive directories and databases.",
        confidence: pattern.confidence,
        mitreTactic: "Exfiltration",
        mitreTechnique: "T1048 - Exfiltration Over Alternative Protocol",
      });
    }
  }

  return findings;
}
