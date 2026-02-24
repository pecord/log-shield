export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_EXTENSIONS = [".txt", ".log", ".csv", ".jsonl"];
export const ALLOWED_MIME_TYPES = ["text/plain", "text/x-log", "text/csv", "application/x-ndjson", "application/octet-stream"];

export const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

export const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH: "bg-orange-500 text-white",
  MEDIUM: "bg-yellow-500 text-black",
  LOW: "bg-blue-500 text-white",
  INFO: "bg-gray-400 text-white",
};

export const SEVERITY_CHART_COLORS: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#3b82f6",
  INFO: "#9ca3af",
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
