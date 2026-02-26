export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_EXTENSIONS = [".txt", ".log", ".csv", ".jsonl"];
export const ALLOWED_MIME_TYPES = ["text/plain", "text/x-log", "text/csv", "application/x-ndjson", "application/octet-stream"];

export const MAX_PAGE_SIZE = 100;

export const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

/** Numeric index for severity sorting (lower = more severe) */
export const SEVERITY_INDEX: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

export const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH: "bg-orange-500 text-white",
  MEDIUM: "bg-amber-700 text-white",
  LOW: "bg-blue-500 text-white",
  INFO: "bg-gray-600 text-white",
};

export const SEVERITY_CHART_COLORS: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#f97316",
  MEDIUM: "#b45309",
  LOW: "#3b82f6",
  INFO: "#4b5563",
};

export const CATEGORY_LABELS: Record<string, string> = {
  SQL_INJECTION: "SQL Injection",
  XSS: "Cross-Site Scripting",
  BRUTE_FORCE: "Brute Force",
  DIRECTORY_TRAVERSAL: "Directory Traversal",
  COMMAND_INJECTION: "Command Injection",
  SUSPICIOUS_STATUS_CODE: "Suspicious Status Code",
  MALICIOUS_USER_AGENT: "Malicious User Agent",
  RATE_ANOMALY: "Rate Anomaly",
  PRIVILEGE_ESCALATION: "Privilege Escalation",
  DATA_EXFILTRATION: "Data Exfiltration",
  RECONNAISSANCE: "Reconnaissance",
  OTHER: "Other",
};
