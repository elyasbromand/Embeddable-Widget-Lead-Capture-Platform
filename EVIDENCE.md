# Evidence

One pasted proof per row of the coverage map in [docs/PLAN.md](docs/PLAN.md).
Real command output only. **A row with no proof counts as not done.**

## Step 0 · Repo is public, first commit has no code

Unauthenticated request to the repo page returns 200, so the repo is public:

```
$ curl -s -o /dev/null -w "%{http_code}\n" https://github.com/elyasbromand/Embeddable-Widget-Lead-Capture-Platform
200
```

First commit contains only the MIT license, no code:

```
$ git log --stat --oneline
7c76ba6 Initial commit
 LICENSE | 21 +++++++++++++++++++++
 1 file changed, 21 insertions(+)
```

Secrets are ignored by construction; `.env.example` is matched by the `!` negation rule and stays tracked:

```
$ git check-ignore -v .env .env.local .env.example
.gitignore:5:.env	.env
.gitignore:6:.env.*	.env.local
.gitignore:7:!.env.example	.env.example
```

## Step 1 · Design document committed

```
$ git log --stat --oneline -1
19e2cf0 Step 1: design document (data model, API surface, layers, trade-offs)
 BUILDLOG.md    |   1 +
 docs/DESIGN.md | 177 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 178 insertions(+)
```

## Step 2 · Foundation: compose up, migrate up, `/health` 200, migrate down

```
$ docker compose up -d --wait && docker compose ps
NAME                                                 IMAGE                    STATUS                   PORTS
embeddable-widget-lead-capture-platform-mailpit-1    axllent/mailpit:latest   Up 6 seconds (healthy)   0.0.0.0:1025->1025/tcp, 0.0.0.0:8025->8025/tcp
embeddable-widget-lead-capture-platform-postgres-1   postgres:17-alpine       Up 6 seconds (healthy)   0.0.0.0:5432->5432/tcp

$ npm run migrate down 3
### MIGRATION 1792792481862_create-submissions (DOWN) ###
DROP TABLE submissions;
### MIGRATION 1792792478063_create-widgets (DOWN) ###
DROP TABLE widgets;
### MIGRATION 1792792474378_create-users (DOWN) ###
DROP TABLE users;
Migrations complete!

$ psql -c "\dt"
 public | pgmigrations | table | app
(1 row)

$ npm run migrate up
### MIGRATION 1792792474378_create-users (UP) ###
### MIGRATION 1792792478063_create-widgets (UP) ###
### MIGRATION 1792792481862_create-submissions (UP) ###
Migrations complete!

$ psql -c "\dt"
 public | pgmigrations | table | app
 public | submissions  | table | app
 public | users        | table | app
 public | widgets      | table | app
(4 rows)

$ curl -i localhost:3000/health
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"status":"ok","db":"ok"}
```

## Section 6 requirements

### 1. Authenticated widget CRUD; no valid auth is rejected (Step 3)

_Pending: curl without a token returns 401._

### 2. Tenant A cannot read or change tenant B's widgets or submissions (Steps 3, 11)

_Pending: curl as A on B's widget returns 404; test name and output._

### 3. Embed snippet generated per widget (Step 4)

_Pending: create-widget response containing the `<script>` line._

### 4. Public config endpoint: small payload, correct cache headers (Step 4)

_Pending: `curl -I` showing Cache-Control and ETag; 304 on repeat._

### 5. Widget JS served as a versioned bundle (Step 4)

_Pending: hashed bundle URL with `immutable`; loader with short cache._

### 6. Widget renders on a different origin (Step 9)

_Pending: browser console and page on :5500 calling the API on :3000._

### 7. Cross-origin submit works; preflight handled (Step 5)

_Pending: `OPTIONS` transcript with Access-Control headers, then a browser POST._

### 8. Malformed and oversized payloads rejected with 4xx JSON — Probe 2 (Step 5)

_Pending: transcript showing 400, 413, 415, 422, never 500._

### 9. Valid submissions stored and linked to the right widget and tenant — Probe 1 (Steps 5, 10)

_Pending: SQL row, then the same row through the dashboard API._

### 10. Burst gets 429 and normal traffic still works — Probe 3 (Step 6)

_Pending: attack script output: N × 201, then 429s, then one 201._

### 11. One spam control blocks a spammer — Probe 6 (Step 6)

_Pending: honeypot-filled POST is dropped; row count unchanged._

### 12. Provider A down, provider B enriches — Probe 4 (Step 7)

_Pending: test name and output; stored row has geo from B._

### 13. All providers down, submission still stored without geo — Probe 4 (Step 7)

_Pending: test output; stored row with null geo._

### 14. Failing email or webhook does not block the submission — Probe 5 (Step 8)

_Pending: forced-failure run: 201, stored row, retry log lines._

### 15. Owner dashboard: submissions and basic analytics (Step 10)

_Pending: responses for list, per-widget counts, counts per day, geo breakdown._

### 16. README with diagram, setup, API docs; required files present (Step 12)

_Pending: fresh-clone run from the README alone._

## Shared requirements

### S1. Layered architecture (Steps 2, 3)

Step 2: `/health` goes route → service → repository; SQL only in `src/repositories/`.

```
src/http/routes/health.js            -> healthService.check()
src/services/healthService.js        -> healthRepository.ping(), maps failure to ServiceUnavailableError
src/repositories/healthRepository.js -> pool.query("SELECT 1")
```

_Pending (Step 3): owner routes following the same pattern._

### S2. Validation at the boundary, never a 500 for bad input (Steps 2, 5)

Step 2: one error envelope from the central handler (`src/http/middleware/errorHandler.js`).
Body-parser errors (400/413/415) are mapped there but not exercised until Step 5.

```
$ curl -i localhost:3000/nope
HTTP/1.1 404 Not Found
{"error":{"code":"NOT_FOUND","message":"No route for GET /nope"}}

$ docker compose stop postgres && curl -i localhost:3000/health
HTTP/1.1 503 Service Unavailable
{"error":{"code":"SERVICE_UNAVAILABLE","message":"Database unavailable"}}

$ docker compose up -d --wait postgres && curl localhost:3000/health
{"status":"ok","db":"ok"} [200]
```

_Pending (Step 5): malformed, oversized, wrong content type, invalid fields._

### S3. Background job with retries and a failure alert (Step 8)

_Pending._

### S4. Real persistence: migrations, right indexes, isolated tenants (Steps 2, 3, 10)

Step 2: schema and indexes come only from `migrations/` (see the Step 2 up/down transcript above).

```
$ psql -c "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('users','widgets','submissions') ORDER BY tablename, indexname;"
 submissions_owner_id_created_at_idx       | CREATE INDEX ... ON public.submissions USING btree (owner_id, created_at)
 submissions_pkey                          | CREATE UNIQUE INDEX ... ON public.submissions USING btree (id)
 submissions_widget_id_created_at_idx      | CREATE INDEX ... ON public.submissions USING btree (widget_id, created_at)
 submissions_widget_id_idempotency_key_idx | CREATE UNIQUE INDEX ... ON public.submissions USING btree (widget_id, idempotency_key)
 users_email_key                           | CREATE UNIQUE INDEX ... ON public.users USING btree (email)
 users_pkey                                | CREATE UNIQUE INDEX ... ON public.users USING btree (id)
 widgets_owner_id_idx                      | CREATE INDEX ... ON public.widgets USING btree (owner_id)
 widgets_pkey                              | CREATE UNIQUE INDEX ... ON public.widgets USING btree (id)
 widgets_public_id_key                     | CREATE UNIQUE INDEX ... ON public.widgets USING btree (public_id)
(9 rows)
```

_Pending (Steps 3, 10): owner-scoped queries, EXPLAIN on dashboard queries._

### S5. Idempotency where it matters (Steps 6, 8)

_Pending._

### S6. Secrets clean (Steps 0, 2, 12)

Step 2: config validated at boot (`src/config/index.js`); pino redacts `authorization`, `cookie`,
`password`, `token` and `err.client`. The last path was added after a real log line from a dropped
Postgres connection contained the pg client object (connection params and its cancel `secretKey`).
After the fix, with Postgres stopped and restarted:

```
$ grep -c -E "secretKey|connectionParameters" server.log
0
```

_Pending (Step 12): gitleaks scan output._

### S7. Cost tracking, if AI is used (Step 12)

_Pending: README statement that the product uses no AI._
