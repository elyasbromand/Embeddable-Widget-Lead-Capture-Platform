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

_Pending._

### S2. Validation at the boundary, never a 500 for bad input (Steps 2, 5)

_Pending._

### S3. Background job with retries and a failure alert (Step 8)

_Pending._

### S4. Real persistence: migrations, right indexes, isolated tenants (Steps 2, 3, 10)

_Pending._

### S5. Idempotency where it matters (Steps 6, 8)

_Pending._

### S6. Secrets clean (Steps 0, 2, 12)

_Pending: gitleaks scan output._

### S7. Cost tracking, if AI is used (Step 12)

_Pending: README statement that the product uses no AI._
