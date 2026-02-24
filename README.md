# LogShield - AI-Powered Log Threat Detection

A full-stack cybersecurity web application that analyzes server log files for security threats using a hybrid AI approach: fast rule-based pattern matching combined with LLM-powered contextual analysis.

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **Backend**: Next.js API Routes (RESTful)
- **Auth**: Auth.js v5 (NextAuth) with GitHub/Google OAuth + credentials
- **Database**: PostgreSQL + Prisma ORM
- **AI**: Rule-based detection engine + Anthropic Claude / OpenAI (configurable)
- **Deployment**: Docker Compose

## Quick Start (Docker)

The fastest way to get running:

```bash
# Clone the repository
git clone <repo-url>
cd take-home-test-tenex

# Copy environment file
cp .env.example .env

# Start with Docker Compose
docker compose up --build
```

The app will be available at **http://localhost:3000**

**Demo credentials**: `demo@logshield.dev` / `demo123`

## Local Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ (or use Docker for the database only)
- npm

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the database

Option A: Use Docker for PostgreSQL only:
```bash
docker run -d --name logshield-db \
  -e POSTGRES_USER=logshield \
  -e POSTGRES_PASSWORD=logshield_secret \
  -e POSTGRES_DB=logshield \
  -p 5432:5432 \
  postgres:16-alpine
```

Option B: Use an existing PostgreSQL instance and update `DATABASE_URL` in `.env`.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values:
- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SECRET` - Generate with `openssl rand -base64 32`
- OAuth credentials (optional) - For GitHub/Google sign-in
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (optional) - For LLM-enhanced analysis

### 4. Run database migrations and seed

```bash
npx prisma migrate dev
npm run db:seed
```

### 5. Start the development server

```bash
npm run dev
```

Open **http://localhost:3000**

## Features

### Authentication
- GitHub and Google OAuth sign-in
- Credentials-based login (demo account included)
- JWT-based session management
- Protected routes via middleware

### Log File Upload
- Drag-and-drop file upload (.txt, .log files up to 10MB)
- Automatic analysis trigger on upload
- Upload history with status tracking

### AI-Powered Threat Detection

The analysis pipeline uses a two-pass hybrid approach:

#### Pass 1: Rule-Based Engine (always runs, fast)

8 detection modules that scan each log line against regex patterns:

| Module | Detects | Severity |
|--------|---------|----------|
| SQL Injection | UNION SELECT, OR 1=1, time-based blind SQLi, encoded variants | HIGH-CRITICAL |
| XSS | Script tags, event handlers, javascript: URIs, encoded payloads | MEDIUM-HIGH |
| Brute Force | Failed auth attempts per IP (stateful, threshold=10) | HIGH |
| Directory Traversal | ../ paths, /etc/passwd, PHP wrappers, encoded variants | HIGH-CRITICAL |
| Command Injection | Shell metacharacters, reverse shells, command substitution | CRITICAL |
| Suspicious Status | HTTP 4xx/5xx patterns, directory enumeration (404 floods) | LOW-HIGH |
| Malicious User Agent | nikto, sqlmap, nmap, dirbuster, empty agents | LOW-MEDIUM |
| Rate Anomaly | Request frequency per IP, error rates, burst detection | MEDIUM-HIGH |

Each finding includes MITRE ATT&CK tactic/technique mapping.

#### Pass 2: LLM Analysis (optional, contextual)

When an Anthropic or OpenAI API key is configured:

1. Log file is split into ~3000-token chunks with 5-line overlap
2. Each chunk is sent to the LLM with the system prompt and rule-based context
3. LLM identifies sophisticated patterns rules might miss (coordinated attacks, privilege escalation sequences)
4. Returns structured JSON findings with descriptions, recommendations, and confidence scores
5. Final LLM call generates an executive summary

**Graceful fallback**: The app is fully functional without any LLM API key. Rule-based detection provides comprehensive coverage on its own.

#### Merge & Deduplication

Findings from both sources are merged by fingerprint (SHA-256 hash of category + line number + content). When both detect the same issue, the LLM finding is kept (richer context) with boosted confidence.

### Dashboard

- Summary stat cards (total uploads, findings, critical threats)
- Severity distribution donut chart
- Threat category bar chart
- Findings timeline area chart
- Recent uploads and top threats lists

### Analysis Detail View

- Severity count breakdown
- AI/rule-based completion indicators
- LLM-generated executive summary
- Filterable findings table (by severity, category)
- Finding detail dialog with full description, log line, recommendation, MITRE mapping

## Sample Log Files

The `sample-logs/` directory contains 4 test files:

| File | Lines | Content |
|------|-------|---------|
| `apache-access-normal.log` | ~100 | Clean traffic, no attacks (baseline) |
| `apache-access-attacks.log` | ~200 | SQL injection, XSS, traversal, scanners, enumeration |
| `auth-brute-force.log` | ~150 | SSH brute force, dictionary attacks, compromised account |
| `application-mixed.log` | ~200 | Privilege escalation, data exfiltration, rate anomalies |

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/uploads` | Upload a log file |
| `GET` | `/api/uploads` | List uploads (paginated) |
| `GET` | `/api/uploads/[id]` | Get upload details |
| `DELETE` | `/api/uploads/[id]` | Delete upload |
| `POST` | `/api/uploads/[id]/analyze` | Trigger analysis |
| `GET` | `/api/analysis/[id]` | Get analysis results with findings |
| `GET` | `/api/dashboard/stats` | Dashboard statistics |

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
│   └── llm/                # LLM client, chunker, prompts, parser
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
| `ANTHROPIC_API_KEY` | No | Enables Anthropic Claude LLM analysis |
| `OPENAI_API_KEY` | No | Enables OpenAI LLM analysis (fallback) |
