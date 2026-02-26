import type { RawFinding, RuleContext, Severity } from "@/analysis/types";
import { computeFingerprint, truncateLine } from "../utils";

interface AgentPattern {
  regex: RegExp;
  label: string;
  severity: Severity;
  confidence: number;
  description: string;
}

/**
 * Known attack tool user agents and suspicious agent patterns.
 */
export const MALICIOUS_AGENT_PATTERNS: AgentPattern[] = [
  // Vulnerability scanners
  {
    regex: /nikto/i,
    label: "Nikto web scanner",
    severity: "MEDIUM",
    confidence: 0.95,
    description: "Request from Nikto, an open-source web server vulnerability scanner commonly used in penetration testing and unauthorized scanning",
  },
  {
    regex: /sqlmap/i,
    label: "sqlmap SQL injection tool",
    severity: "MEDIUM",
    confidence: 0.95,
    description: "Request from sqlmap, an automated SQL injection exploitation tool used to discover and exploit SQL injection flaws",
  },
  {
    regex: /nmap/i,
    label: "Nmap network scanner",
    severity: "MEDIUM",
    confidence: 0.9,
    description: "Request from Nmap or Nmap scripting engine, a network discovery and security auditing tool",
  },
  {
    regex: /nessus/i,
    label: "Nessus vulnerability scanner",
    severity: "MEDIUM",
    confidence: 0.9,
    description: "Request from Nessus, a commercial vulnerability assessment scanner",
  },
  {
    regex: /acunetix/i,
    label: "Acunetix web scanner",
    severity: "MEDIUM",
    confidence: 0.95,
    description: "Request from Acunetix, a web application security scanner that tests for a wide range of vulnerabilities",
  },
  // Directory brute-force tools
  {
    regex: /dirbuster/i,
    label: "DirBuster directory scanner",
    severity: "MEDIUM",
    confidence: 0.95,
    description: "Request from DirBuster, a tool for brute-forcing directories and file names on web servers",
  },
  {
    regex: /gobuster/i,
    label: "Gobuster directory scanner",
    severity: "MEDIUM",
    confidence: 0.95,
    description: "Request from Gobuster, a fast directory and DNS brute-force scanner written in Go",
  },
  {
    regex: /wfuzz/i,
    label: "Wfuzz web fuzzer",
    severity: "MEDIUM",
    confidence: 0.9,
    description: "Request from Wfuzz, a web application brute-forcer and fuzzer used for discovering hidden resources",
  },
  {
    regex: /feroxbuster/i,
    label: "Feroxbuster directory scanner",
    severity: "MEDIUM",
    confidence: 0.95,
    description: "Request from Feroxbuster, a fast recursive content discovery tool",
  },
  {
    regex: /ffuf/i,
    label: "ffuf web fuzzer",
    severity: "MEDIUM",
    confidence: 0.9,
    description: "Request from ffuf (Fuzz Faster U Fool), a fast web fuzzer commonly used for directory discovery",
  },
  // Credential attack tools
  {
    regex: /hydra/i,
    label: "Hydra brute-force tool",
    severity: "MEDIUM",
    confidence: 0.9,
    description: "Request from THC Hydra, a parallelized login cracker supporting numerous protocols for brute-force attacks",
  },
  // Network scanning tools
  {
    regex: /masscan/i,
    label: "Masscan port scanner",
    severity: "MEDIUM",
    confidence: 0.9,
    description: "Request from Masscan, a high-speed port scanner capable of scanning the entire internet in under 6 minutes",
  },
  {
    regex: /zmap/i,
    label: "ZMap network scanner",
    severity: "MEDIUM",
    confidence: 0.85,
    description: "Request from ZMap, a fast single-packet network scanner designed for internet-wide surveys",
  },
  // Proxy/interception tools
  {
    regex: /burp\s*suite/i,
    label: "Burp Suite proxy",
    severity: "LOW",
    confidence: 0.85,
    description: "Request from Burp Suite, a web security testing platform commonly used by penetration testers",
  },
  {
    regex: /zaproxy|owasp\s*zap/i,
    label: "OWASP ZAP proxy",
    severity: "LOW",
    confidence: 0.85,
    description: "Request from OWASP ZAP (Zed Attack Proxy), an open-source web application security scanner",
  },
  // Exploitation frameworks
  {
    regex: /metasploit/i,
    label: "Metasploit framework",
    severity: "MEDIUM",
    confidence: 0.95,
    description: "Request from the Metasploit framework, an exploitation and post-exploitation toolkit",
  },
  // Web scraping / bot indicators
  {
    regex: /scrapy/i,
    label: "Scrapy web scraper",
    severity: "LOW",
    confidence: 0.7,
    description: "Request from Scrapy, a web scraping framework that may be used for unauthorized data collection",
  },
  // Generic scripting tools / CLI clients
  {
    regex: /\bcurl\//i,
    label: "curl command-line client",
    severity: "LOW",
    confidence: 0.45,
    description: "Request from curl, a command-line HTTP client. While commonly used for legitimate purposes, curl in web proxy logs can indicate automated scripts, C2 beaconing, or data exfiltration when used from non-server endpoints.",
  },
  {
    regex: /\bwget\//i,
    label: "wget download utility",
    severity: "LOW",
    confidence: 0.50,
    description: "Request from wget, a command-line download utility. May indicate automated file retrieval, payload downloads, or scripted activity.",
  },
  {
    regex: /python-requests/i,
    label: "Python Requests library",
    severity: "LOW",
    confidence: 0.5,
    description: "Request from Python Requests library; while legitimate, automated Python scripts are commonly used in attacks",
  },
  {
    regex: /python-urllib/i,
    label: "Python urllib library",
    severity: "LOW",
    confidence: 0.5,
    description: "Request from Python urllib; automated scripts using this library may indicate scanning or scraping activity",
  },
  {
    regex: /libwww-perl/i,
    label: "Perl LWP library",
    severity: "LOW",
    confidence: 0.6,
    description: "Request from Perl LWP library, historically associated with automated attack scripts and web scanners",
  },
  {
    regex: /java\/\d/i,
    label: "Raw Java HTTP client",
    severity: "LOW",
    confidence: 0.5,
    description: "Request from a raw Java HTTP client, which may indicate automated scanning or bot activity",
  },
];

/**
 * Alternate: some logs have User-Agent: header explicitly
 */
const UA_HEADER_REGEX = /User-Agent:\s*(.+?)(?:\s*$|\s*")/i;

export function checkMaliciousAgent(
  line: string,
  lineNumber: number,
  _context: RuleContext
): RawFinding[] {
  const findings: RawFinding[] = [];
  const lineContent = truncateLine(line);

  // Try to extract user agent from the log line
  let userAgent: string | null = null;

  const uaHeaderMatch = line.match(UA_HEADER_REGEX);
  if (uaHeaderMatch) {
    userAgent = uaHeaderMatch[1];
  } else {
    // In combined log format, the user agent is typically the last quoted string
    // Format: IP - - [date] "request" status size "referer" "user-agent"
    const allQuoted = line.match(/"([^"]*)"/g);
    if (allQuoted && allQuoted.length >= 3) {
      // The last quoted string is typically the user agent
      userAgent = allQuoted[allQuoted.length - 1].replace(/^"|"$/g, "");
    }
  }

  // Check for empty user agent
  if (userAgent !== null && userAgent.trim() === "") {
    findings.push({
      severity: "LOW",
      category: "MALICIOUS_USER_AGENT",
      title: "Empty User Agent Detected",
      description:
        "Request with an empty User-Agent header. Legitimate browsers always send a User-Agent; empty values typically indicate automated tools, bots, or manually crafted requests.",
      lineNumber,
      lineContent,
      matchedPattern: '""',
      source: "RULE_BASED",
      fingerprint: computeFingerprint(
        "MALICIOUS_USER_AGENT",
        lineNumber,
        "empty-ua"
      ),
      recommendation:
        "Monitor and rate-limit requests with empty or missing User-Agent headers. Consider blocking such requests at the WAF or reverse proxy level unless expected from internal services.",
      confidence: 0.7,
      mitreTactic: "Reconnaissance",
      mitreTechnique: "T1595 - Active Scanning",
    });
  }

  // Check against known malicious agent patterns.
  // We check the full line since user agent extraction may not always succeed,
  // and attack tool signatures in the line are still meaningful.
  const searchText = userAgent ?? line;

  for (const pattern of MALICIOUS_AGENT_PATTERNS) {
    const match = searchText.match(pattern.regex);
    if (match) {
      findings.push({
        severity: pattern.severity,
        category: "MALICIOUS_USER_AGENT",
        title: `Malicious User Agent: ${pattern.label}`,
        description: pattern.description,
        lineNumber,
        lineContent,
        matchedPattern: match[0],
        source: "RULE_BASED",
        fingerprint: computeFingerprint(
          "MALICIOUS_USER_AGENT",
          lineNumber,
          match[0]
        ),
        recommendation:
          "Block known attack tool User-Agent strings at the WAF or reverse proxy. Implement User-Agent allowlisting if feasible. Note that sophisticated attackers can spoof User-Agent headers, so this should be one layer of a defense-in-depth strategy.",
        confidence: pattern.confidence,
        mitreTactic: "Reconnaissance",
        mitreTechnique: "T1595 - Active Scanning",
      });
    }
  }

  return findings;
}
