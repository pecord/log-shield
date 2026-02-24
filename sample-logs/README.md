# Sample Log Files for Threat Detection Testing

This directory contains synthetic log files designed to test cybersecurity log analysis and threat detection capabilities. All data is fictional and generated for testing purposes only.

## Files

### apache-access-normal.log (~100 lines)
**Format:** Apache Combined Log Format
**Content:** Completely clean/benign web traffic with no attack patterns. Includes realistic browsing sessions from multiple IPs using various browsers (Chrome, Firefox, Safari, Edge) on different platforms (Windows, macOS, Linux, iOS, iPad). Pages accessed include static assets, informational pages, and API endpoints. Status codes are limited to normal responses (200, 301, 304). Useful as a baseline to verify low false-positive rates.

### apache-access-attacks.log (~200 lines)
**Format:** Apache Combined Log Format
**Content:** A mix of normal traffic interleaved with multiple categories of web attacks:
- **SQL Injection** (from `45.33.32.156` via sqlmap): `UNION SELECT`, `OR 1=1`, `DROP TABLE`, `WAITFOR DELAY`, URL-encoded variants, error-based extraction, blind injection
- **Cross-Site Scripting / XSS** (from `185.220.101.34`): `<script>alert()</script>`, `onerror` handlers, `onload` events, `javascript:` URIs, encoded XSS payloads, DOM-based vectors
- **Directory Traversal** (from `23.129.64.210` via Nessus): `../../etc/passwd`, double-encoded variants (`%2e%2e%2f`), `/proc/self/environ`, Windows path variants
- **Command Injection** (from `91.240.118.172`): semicolon injection, pipe commands, backtick execution, `$(...)` substitution, template injection (`${7*7}`, `{{7*7}}`)
- **Scanner / Enumeration** (from `198.51.100.77` via Nikto, `77.247.181.165` via DirBuster): rapid-fire 404s probing for admin panels, config files, database dumps, `.env`, `.git`, and common CMS paths

### auth-brute-force.log (~150 lines)
**Format:** Syslog / auth.log (sshd)
**Content:** SSH authentication events including:
- **Normal logins:** Legitimate publickey and password logins for users `admin`, `developer`, and `deploy` from internal IPs
- **Dictionary attack** (from `10.0.0.100`): Failed login attempts for invalid usernames (`test`, `guest`, `oracle`, `postgres`, `mysql`, `ftpuser`, `nagios`, `tomcat`, `webmaster`, `info`)
- **Brute force attack** (from `10.0.0.99`): 50+ rapid-fire `Failed password for root` attempts within seconds
- **Account compromise indicator:** After brute-forcing root fails, attacker `10.0.0.99` switches to the `admin` user, fails several times, then successfully authenticates -- suggesting a compromised password
- **Session lifecycle:** PAM session open/close messages, systemd-logind session tracking

### application-mixed.log (~200 lines)
**Format:** JSON (one object per line, structured application logs)
**Content:** API server logs with both normal operations and embedded threat indicators:
- **Normal API traffic:** Standard CRUD operations on `/api/users`, `/api/products`, `/api/orders` from authenticated users with typical response times
- **Injection error spikes** (from `45.33.32.156`): SQL injection, XSS, path traversal, and command injection attempts causing 500 errors with revealing stack traces
- **Privilege escalation** (from `10.0.0.200` as `user707`): Multiple 403s on `/api/admin/*` endpoints, then a suspicious profile update, followed by successful 200s on the same admin endpoints
- **Data exfiltration** (from `10.0.0.200` as `user707`): Bulk API calls to `/api/users/export` and `/api/data/download` with response sizes in the megabytes (5-100MB), including sensitive tables
- **Suspicious 3 AM access** (from `10.0.0.200` as `user707`): Off-hours bulk downloads, full database backup, and admin log access between 3:00-3:02 AM
- **Rate anomaly / scraping** (from `45.33.32.156`): 50+ unauthenticated requests within 20 seconds systematically enumerating products, users, and orders

## Threat Summary by IP

| IP | Log File(s) | Threat Type |
|---|---|---|
| `45.33.32.156` | apache-access-attacks, application-mixed | SQL injection (sqlmap), API scraping |
| `185.220.101.34` | apache-access-attacks | XSS attacks |
| `23.129.64.210` | apache-access-attacks | Directory traversal (Nessus) |
| `91.240.118.172` | apache-access-attacks | Command injection, template injection |
| `198.51.100.77` | apache-access-attacks | Web scanner (Nikto) |
| `77.247.181.165` | apache-access-attacks | Directory enumeration (DirBuster) |
| `10.0.0.99` | auth-brute-force | SSH brute force, account compromise |
| `10.0.0.100` | auth-brute-force | SSH dictionary attack |
| `10.0.0.200` | application-mixed | Privilege escalation, data exfiltration, off-hours access |
