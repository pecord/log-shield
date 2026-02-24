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
}

export interface RuleContext {
  ipCounters: Map<string, number>;
  ipRequestTimes: Map<string, number[]>;
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
