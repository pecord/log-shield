# LogShield - AI-Powered Log Threat Detection

A full-stack cybersecurity web application that analyzes server log files for security threats using a hybrid AI approach: fast rule-based pattern matching combined with LLM-powered contextual analysis.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **Backend**: Next.js API Routes (RESTful)
- **Auth**: Auth.js v5 (NextAuth) with GitHub/Google OAuth + credentials
- **Database**: PostgreSQL + Prisma ORM
- **AI**: Rule-based detection engine + GitHub Copilot SDK agentic analysis (Anthropic / OpenAI via BYOK)
- **Deployment**: Docker, Railway

## Live Demo

**https://logshield-app-production.up.railway.app**

Demo credentials: `demo@logshield.dev` / `demo123`

## Quick Start (Docker)

The fastest way to get running:

```bash
# Clone the repository
git clone https://github.com/pecord/log-shield.git
cd log-shield

# Copy environment file
cp .env.example .env

# Start with Docker Compose
docker compose up --build
```

The app will be available at **http://localhost:3000**

**Demo credentials**: `demo@logshield.dev` / `demo123`

## Local Development Setup

### One-Command Setup

The `dev-setup.sh` script handles everything — starts PostgreSQL in Docker, installs dependencies, runs migrations, seeds the demo user, and launches the dev server:

```bash
./dev-setup.sh        # or: npm run dev:setup
```

**Prerequisites**: Docker, Node.js 22+, npm

### Manual Setup

If you prefer to run each step individually:

#### 1. Start PostgreSQL

```bash
docker run -d --name logshield-db \
  -e POSTGRES_USER=logshield \
  -e POSTGRES_PASSWORD=logshield_secret \
  -e POSTGRES_DB=logshield \
  -p 5432:5432 \
  postgres:16-alpine
```

Or use an existing PostgreSQL instance and update `DATABASE_URL` in `.env`.

#### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values:
- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SECRET` - Generate with `openssl rand -base64 32`
- OAuth credentials (optional) - For GitHub/Google sign-in
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (optional) - For LLM-enhanced analysis

#### 3. Install, migrate, seed, and run

```bash
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

Open **http://localhost:3000** — Demo login: `demo@logshield.dev` / `demo123`

## Deploying to Railway

1. Link the project: `railway link`
2. Set required environment variables:
   ```bash
   railway variables set DATABASE_URL="..." AUTH_SECRET="..."
   ```
3. Optionally set S3 and LLM API keys:
   ```bash
   railway variables set ANTHROPIC_API_KEY="..." S3_ENDPOINT="..." S3_BUCKET="..." S3_ACCESS_KEY="..." S3_SECRET_KEY="..." S3_REGION="..."
   ```
4. Deploy:
   ```bash
   railway up
   ```

The Dockerfile builds a production image with Node 22 (required for the Copilot SDK's `node:sqlite` dependency). Railway auto-detects the Dockerfile and runs Prisma migrations on startup.

## Features

### Authentication
- GitHub and Google OAuth sign-in
- Credentials-based login (demo account included)
- JWT-based session management
- Protected routes via middleware

### Log File Upload
- Drag-and-drop file upload (.txt, .log, .csv, .jsonl files up to 10MB)
- Multi-file upload with per-file status tracking
- Automatic analysis trigger on upload
- Upload history with status tracking

### AI-Powered Threat Detection

The analysis pipeline uses a two-pass hybrid approach:

#### Pass 1: Rule-Based Engine (always runs, fast)

10 detection modules that scan each log line against regex patterns:

| Module | Detects | Severity |
|--------|---------|----------|
| SQL Injection | UNION SELECT, OR 1=1, time-based blind SQLi, encoded variants | HIGH-CRITICAL |
| XSS | Script tags, event handlers, javascript: URIs, encoded payloads | MEDIUM-HIGH |
| Brute Force | Failed auth attempts per IP (stateful, threshold=10) | HIGH |
| Directory Traversal | ../ paths, /etc/passwd, PHP wrappers, encoded variants | HIGH-CRITICAL |
| Command Injection | Shell metacharacters, reverse shells, command substitution | CRITICAL |
| Privilege Escalation | sudo abuse, /etc/shadow access, uid/gid changes, su attempts | HIGH-CRITICAL |
| Data Exfiltration | Large outbound transfers, base64-encoded payloads, sensitive file access | MEDIUM-HIGH |
| Suspicious Status | HTTP 4xx/5xx patterns, directory enumeration (404 floods) | LOW-HIGH |
| Malicious User Agent | nikto, sqlmap, nmap, dirbuster, empty agents | LOW-MEDIUM |
| Rate Anomaly | Request frequency per IP, error rates, burst detection | MEDIUM-HIGH |

Each finding includes MITRE ATT&CK tactic/technique mapping.

#### Pass 2: Agentic LLM Analysis (optional, contextual)

When an Anthropic or OpenAI API key is configured (via environment variable or the in-app Settings page), an intelligent agent powered by the **GitHub Copilot SDK** explores the log file:

1. The agent receives the full log file as an attachment along with rule-based findings as context
2. Using built-in tools (file reading, grep, view), the agent **autonomously decides** what to investigate
3. It validates rule-based findings by reading surrounding context, identifies false positives, and searches for attack patterns the rules missed
4. The agent calls a `submit_analysis` tool to return structured findings, an executive summary, and false positive line numbers
5. A domain-specific skill (`skills/security-analysis/SKILL.md`) provides the agent with analysis methodology, threat categories, and adversarial content guards

**Agent concurrency**: Only one agent runs at a time (serialized via semaphore) to prevent OOM — each Copilot CLI subprocess uses significant memory. Rule-based analysis runs in parallel; only the agent step is queued.

**Progressive results**: Rule-based findings appear in the UI immediately while LLM analysis continues in the background. Progress is streamed via Server-Sent Events (SSE). When the agent completes, findings are merged and severity counts update in place.

**Graceful fallback**: The app is fully functional without any LLM API key. Rule-based detection provides comprehensive coverage on its own.

#### Merge & Deduplication

Findings from both sources are merged using a two-phase progressive strategy:

1. Rule findings are persisted to the database immediately after the rule engine completes
2. When LLM finishes, a progressive merge determines which rule findings are superseded (same category + line number)
3. Superseded rule findings are removed and replaced with enriched LLM findings (richer descriptions, inherited line content and matched patterns, boosted confidence)
4. Final severity counts are recalculated from the database for accuracy

Fingerprints use SHA-256 hashes of `(category + lineNumber + matchedContent)`, truncated to 16 hex characters.

### Dashboard

- Summary stat cards (total uploads, findings, critical threats)
- Severity distribution donut chart
- Threat category bar chart
- Findings timeline area chart
- Recent uploads and top threats lists

### Analysis Detail View

- Severity count breakdown (updates live via SSE as analysis progresses)
- Real-time progress bar (Server-Sent Events, no polling)
- Rule findings displayed immediately while agent analyzes in the background
- AI/rule-based completion indicators
- Agent-generated executive summary (appears when LLM completes)
- Filterable, sortable findings table (by severity, category)
- Finding detail dialog with full description, log line, recommendation, MITRE mapping

### BYO Settings (Bring Your Own)

- **LLM API Key**: Configure Anthropic or OpenAI keys via the Settings page — keys are encrypted at rest
- **S3 Storage**: Configure S3-compatible object storage (AWS S3, MinIO, Cloudflare R2) for file uploads
- Connection testing with status indicators before saving
- Encrypted credential storage with masked hints in the UI

## Sample Log Files

The `sample-logs/` directory contains 4 handcrafted test logs and 9 real-world CICIDS2017 network flow datasets (via Kaggle).

### Handcrafted Logs

| File | Lines | Content |
|------|-------|---------|
| `apache-access-normal.log` | ~100 | Clean traffic, no attacks (baseline) |
| `apache-access-attacks.log` | ~200 | SQL injection, XSS, traversal, scanners, enumeration |
| `auth-brute-force.log` | ~150 | SSH brute force, dictionary attacks, compromised account |
| `application-mixed.log` | ~200 | Privilege escalation, data exfiltration, rate anomalies |

### CICIDS2017 Network Flow Datasets

Real-world labeled network flows from the [Canadian Institute for Cybersecurity IDS 2017 dataset](https://www.unb.ca/cic/datasets/ids-2017.html). Each CSV contains 80+ flow features (packet counts, byte stats, flags, IAT) with attack/benign labels.

| File | Rows | Attack Type |
|------|------|-------------|
| `cicids-sql-injection.csv` | 25 | SQL Injection |
| `cicids-xss.csv` | 1,359 | Cross-Site Scripting |
| `cicids-web-bruteforce.csv` | 2,735 | Web Brute Force |
| `cicids-ftp-bruteforce.csv` | 1,501 | FTP Brute Force (Patator) |
| `cicids-ssh-bruteforce.csv` | 1,501 | SSH Brute Force (Patator) |
| `cicids-botnet-ares.csv` | 2,001 | Botnet C2 (ARES) |
| `cicids-heartbleed.csv` | 13 | Heartbleed |
| `cicids-ddos.csv` | 1,301 | DDoS (sampled) |
| `cicids-portscan.csv` | 1,301 | Port Scan (sampled) |

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/uploads` | Upload a log file |
| `GET` | `/api/uploads` | List uploads (paginated) |
| `GET` | `/api/uploads/[id]` | Get upload details |
| `DELETE` | `/api/uploads/[id]` | Delete upload |
| `POST` | `/api/uploads/[id]/analyze` | Trigger analysis |
| `GET` | `/api/uploads/[id]/stream` | SSE stream of analysis progress |
| `GET` | `/api/analysis/[id]` | Get analysis results with findings |
| `GET` | `/api/dashboard/stats` | Dashboard statistics |
| `POST` | `/api/uploads/reanalyze-all` | Re-analyze all completed uploads |
| `GET` | `/api/findings` | List findings (paginated, filterable) |
| `GET` | `/api/settings` | Get user settings (LLM + S3 config) |
| `PUT` | `/api/settings` | Update user settings |
| `POST` | `/api/settings/test-connection` | Test LLM or S3 connection |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── (auth)/             # Sign-in and auth error pages
│   ├── (dashboard)/        # Dashboard, uploads, analysis views
│   └── api/                # RESTful API endpoints
├── analysis/               # Core threat detection logic
│   ├── pipeline.ts         # Analysis orchestrator
│   ├── merger.ts           # Finding deduplication
│   ├── rule-engine/        # 8 rule-based detection modules
│   └── llm/                # Copilot SDK agent, prompts, structured output
├── components/             # React components
│   ├── ui/                 # shadcn/ui primitives
│   ├── layout/             # Sidebar, header
│   ├── dashboard/          # Charts, stat cards
│   ├── uploads/            # Upload form, list
│   └── analysis/           # Findings table, detail dialog
└── lib/                    # Utilities, auth config, Prisma client
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Auth.js secret key |
| `AUTH_GITHUB_ID` | No | GitHub OAuth app ID |
| `AUTH_GITHUB_SECRET` | No | GitHub OAuth app secret |
| `AUTH_GOOGLE_ID` | No | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | No | Google OAuth client secret |
| `ANTHROPIC_API_KEY` | No | Enables Anthropic Claude LLM analysis (or configure per-user in Settings) |
| `OPENAI_API_KEY` | No | Enables OpenAI LLM analysis (or configure per-user in Settings) |
| `S3_ENDPOINT` | No | S3-compatible endpoint URL (e.g., `https://s3.amazonaws.com`) |
| `S3_REGION` | No | S3 region (e.g., `us-east-1`) |
| `S3_BUCKET` | No | S3 bucket name |
| `S3_ACCESS_KEY` | No | S3 access key ID |
| `S3_SECRET_KEY` | No | S3 secret access key |
| `S3_PATH_PREFIX` | No | Optional key prefix for uploaded files |
| `S3_FORCE_PATH_STYLE` | No | Set `true` for MinIO/path-style endpoints |

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

The test suite covers:
- **Utility functions**: IP extraction, timestamp parsing, fingerprint hashing, line truncation
- **Log parser**: Format detection (JSONL/CSV/plain), normalization, malformed line handling, edge cases
- **Detection rules**: SQL injection, XSS, brute force thresholds, command injection, privilege escalation, data exfiltration, directory traversal — including false-positive checks on benign lines
- **Finding merger**: Deduplication by fingerprint, LLM override behavior, confidence boosting, severity sorting, progressive merge with superseded rule detection
- **Analysis pipeline**: Two-phase persistence, status transitions, severity recounting
- **LLM agent**: Agentic analysis, structured output via submit_analysis tool, agent response parsing fallback
- **Upload validation**: File extension allowlist, filename sanitization, size limits

## Design Decisions & Tradeoffs

### Hybrid Rule-Based + LLM Architecture
The analysis pipeline uses a deliberate two-pass design. Pass 1 (rule engine) provides **speed, determinism, and zero cost** — it runs in milliseconds with no external dependencies. Pass 2 (LLM) adds **contextual analysis** — detecting coordinated attacks, unusual patterns, and providing executive summaries. The LLM pass is completely optional; the app is fully functional without an API key. This design choice prioritizes operational reliability over maximum detection coverage.

### Fire-and-Forget Analysis Pipeline
The `/api/uploads/[id]/analyze` endpoint returns HTTP 202 and runs the analysis pipeline asynchronously without `await`. This prevents blocking the HTTP response for potentially multi-minute analyses. Progress is streamed to the client via Server-Sent Events (SSE) — an in-process `EventEmitter` bridges the pipeline to the `/api/uploads/[id]/stream` endpoint. Agent concurrency is limited to 1 at a time via an in-process semaphore to prevent OOM kills from concurrent CLI subprocesses.

**Durability**: Two recovery mechanisms in `instrumentation.ts` handle failures without an external job queue:
1. **Startup recovery**: On server boot, uploads stuck in `ANALYZING` status are detected and resumed via `resumeAnalysisPipeline()`, which picks up from the last completed phase (skips rule engine if already done, re-runs the LLM agent).
2. **Stall detector**: A `setInterval` (every 5 minutes) catches analyses that silently hang during normal operation. Uploads in `ANALYZING` for longer than 15 minutes are automatically resumed.

**Tradeoff**: This is process-local — there is no distributed job queue, no exponential backoff, and no horizontal scaling. A production system would use BullMQ or Inngest for durable job execution with retry policies.

### Hybrid File Storage (Local + S3)
By default, uploaded files are stored on the local filesystem under `uploads/{userId}/{uuid}_{filename}`. Users can optionally configure S3-compatible object storage (AWS S3, MinIO, Cloudflare R2) via the Settings page. When S3 is configured, files are uploaded directly to the bucket. During analysis, S3 files are downloaded to a temp directory for processing, then cleaned up. API keys and S3 credentials are encrypted at rest using AES-256-GCM.

### Prisma ORM
Chosen for TypeScript type safety, auto-generated migrations, and rapid development. The generated client provides compile-time type checking for all database queries. **Tradeoff**: slight performance overhead vs. raw SQL, but appropriate for this application's scale and development velocity.

### Fingerprint-Based Deduplication
Findings are deduplicated using a SHA-256 hash of `(category + lineNumber + matchedContent)`, truncated to 16 hex characters. When both the rule engine and LLM detect the same issue, the LLM finding is kept (richer descriptions and recommendations) with confidence boosted to the maximum of both scores. This prevents duplicate noise while preserving the highest-quality analysis.

### 10MB File Size Limit
The entire pipeline is streaming end-to-end. Uploads flow through a `Transform` that counts newlines as chunks pass through, then pipe directly to storage (local disk or S3) — no full-file buffer in memory. The rule engine uses `createReadStream` + `readline` to process each line individually without loading the whole file into memory. The 10MB limit is a policy choice for demo scale, not a technical constraint.

### Explainable Heuristics Over ML
Detection rules use well-documented regex patterns with explicit confidence scores and MITRE ATT&CK mappings rather than opaque ML models. SOC environments require analyst trust — every finding can be traced back to a specific pattern match, line content, and recommendation. Confidence scores are calibrated per-pattern (0.45-0.98) based on false-positive likelihood.

## Known Limitations

- **No distributed job queue**: Analysis runs as a fire-and-forget async function with process-local recovery (startup resume + stall detector). There is no distributed coordination, no exponential backoff, and no horizontal scaling.
- **No response caching**: Dashboard and findings queries hit the database on every request. Next.js has built-in `fetch` caching and `unstable_cache`, but our API routes serve user-scoped authenticated data (`force-dynamic`), so framework-level caching doesn't apply without per-user cache keys. A production deployment would add Redis with short per-user TTLs.
- **In-process rate limiting**: API endpoints have per-user rate limiting via an in-memory sliding-window limiter. This is process-local — a multi-instance deployment would need a shared store (Redis, Upstash) or an edge rate-limit service.
- **Single-process analysis**: Multiple concurrent analyses compete for the same Node.js event loop. A production system would use a separate worker process.
- **Static detection thresholds**: Brute force threshold (10 attempts), rate anomaly threshold (100 requests), and burst window (5 seconds) are hardcoded. These could be made configurable per-user or per-analysis.
- **No baseline/behavioral analysis**: Detection is pattern-based, not baseline-based. There is no concept of "normal" traffic for a given user or IP that would enable anomaly detection against a learned baseline.

## Security Considerations

- **Authentication**: Server-side middleware redirects unauthenticated users to sign-in. All API routes verify `auth()` session and check `session.user.id` before data access. Resource endpoints (uploads, analysis) verify ownership: `upload.userId !== session.user.id` returns 403.
- **XSS Prevention**: React's default text rendering is used throughout — no `dangerouslySetInnerHTML` anywhere in the codebase. Log content, finding descriptions, and matched patterns are all rendered as text, preventing XSS via uploaded logs.
- **File Upload Validation**: Extension allowlist (`.txt`, `.log`, `.csv`, `.jsonl`), MIME type check, 10MB size limit, filename sanitization (alphanumeric + dots + hyphens only, 200 char max), and UUID prefix to prevent path guessing.
- **Password Hashing**: Credentials auth uses bcryptjs with default salt rounds. OAuth providers (GitHub, Google) use Auth.js v5 with JWT sessions.
- **User Isolation**: Every Prisma query is scoped by `userId`. Users cannot access other users' uploads, analyses, or findings.
- **No Secrets in Code**: All credentials, API keys, and connection strings are loaded from environment variables. The `.env` file is gitignored.

## Future Improvements

- **Job queue** (BullMQ/Inngest) for durable analysis execution with retry policies and horizontal scaling
- **Distributed rate limiting** with Redis or Upstash to replace the current in-process limiter
- **Beaconing/C2 detection** — analyzing inter-request timing intervals for periodic callback patterns
- **Formal Detector interface** for pluggable rule modules: `interface Detector { category; analyze(line, ctx): Finding[] }`
- **Top Attacking IPs** dashboard widget with finding count and category breakdown
- **Response caching** with Redis or SWR for dashboard statistics
- **RBAC** (admin, analyst, viewer roles) for team environments
- **Threat intelligence feeds** integration (AbuseIPDB, VirusTotal) for IP reputation scoring
