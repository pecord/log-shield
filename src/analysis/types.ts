export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type ThreatCategory =
  | "SQL_INJECTION"
  | "XSS"
  | "BRUTE_FORCE"
  | "DIRECTORY_TRAVERSAL"
  | "COMMAND_INJECTION"
  | "SUSPICIOUS_STATUS_CODE"
  | "MALICIOUS_USER_AGENT"
  | "RATE_ANOMALY"
  | "PRIVILEGE_ESCALATION"
  | "DATA_EXFILTRATION"
  | "RECONNAISSANCE"
  | "OTHER";

export type FindingSource = "RULE_BASED" | "LLM";

export interface RawFinding {
  severity: Severity;
  category: ThreatCategory;
  title: string;
  description: string;
  lineNumber: number | null;
  lineContent: string | null;
  matchedPattern: string | null;
  source: FindingSource;
  fingerprint: string;
  recommendation: string | null;
  confidence: number | null;
  mitreTactic: string | null;
  mitreTechnique: string | null;
  /** Timestamp extracted from the log line (epoch ms), null if not parseable */
  eventTimestamp?: number | null;
}

export interface RuleContext {
  ipCounters: Map<string, number>;
  ipRequestTimes: Map<string, number[]>;
  /** Track distinct usernames per IP for password spray detection */
  ipDistinctUsers: Map<string, Set<string>>;
  /** Track per-IP request counts and error counts for rate-anomaly streaming */
  ipRequestStats: Map<string, { total: number; errors: number; timestamps: number[]; sampleLines: string[] }>;
  totalLines: number;
  lineIndex: number;
}

export interface AnalysisPipelineResult {
  findings: RawFinding[];
  totalLinesAnalyzed: number;
  ruleBasedCompleted: boolean;
  llmCompleted: boolean;
  llmAvailable: boolean;
  overallSummary: string | null;
}
