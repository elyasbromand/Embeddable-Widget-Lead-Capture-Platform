# Design: Embeddable Widget & Lead-Capture Platform

Oct 22, 2026 · Elyas Bromand · Step 1 of [PLAN.md](PLAN.md)

## 1. Problem

Site owners create lead-capture form widgets and embed them on their own websites by pasting a
single `<script>` line; visitors' submissions land in the owner's private dashboard. The submission
endpoint is public and callable by anyone on the internet, not only by our widget, so every request
is treated as hostile: it is validated, rate-limited, screened for bots and made idempotent. The
system is done when a valid submission is always stored against the right tenant, even under a
request flood or with geo providers and email down, and bad input always gets a clean 4xx
instead of a 500.

## 2. Three actors, three request paths

| | Owner | Customer site | Visitor |
|---|---|---|---|
| Requests | manage widgets, read submissions and stats | loader, bundle, widget config | `POST /submissions` |
| Auth | JWT bearer token | none | none |
| CORS | closed to foreign origins | open on config (no credentials); scripts need none | open, no credentials, preflight cached |
| Cache | none | heavy (see §4) | none (it is a write) |
| Main concern | tenant isolation | caching, small payload | abuse, validation, failure tolerance |

- **Owner.** Logs in, sends `Authorization: Bearer <jwt>` on every `/api/*` call. Every query on
  this path is scoped by `owner_id`.
- **Customer site.** The pasted snippet loads a tiny loader, which loads the hashed bundle, which
  fetches the widget's config and renders the form. Read-only and identical for every visitor, so
  it is cached. The public widget id in the snippet is an identifier, not a secret.
- **Visitor.** Proves nothing about who they are. The request carries only the public widget id;
  the server looks up the widget row, and **that row** decides `widget_id` and `owner_id`. Nothing
  tenant-related is taken from the request.

**CORS is not server security.** It protects users' browsers; curl and bots ignore it. The public
routes need open CORS because any website may embed the widget. The admin API stays closed so a
foreign page cannot use a logged-in owner's browser to read their leads. The JWT is what actually
guards it. The server itself is protected by rate limiting, validation, the honeypot and idempotency.

## 3. Data model

A tenant is a user account. All ids are uuids; widgets also carry a random `public_id` (nanoid).

**`users`**: `id` uuid PK · `email` text unique (stored lowercased) · `password_hash` text (bcrypt)
· `created_at` timestamptz

**`widgets`**: `id` uuid PK (internal, never leaves the database) · `public_id` text unique (in the
snippet and in owner URLs) · `owner_id` uuid FK → users, cascade · `type` text CHECK in
(`signup`, `contact`) · `title`, `description`, `button_text` text · `fields` jsonb (field
definitions, the source of the runtime zod schema) · `display` jsonb · `created_at`, `updated_at`

**`submissions`**: `id` uuid PK · `widget_id` uuid FK → widgets, cascade · `owner_id` uuid FK →
users, cascade (copied from the widget row at insert) · `data` jsonb (visitor answers) · `ip` inet
nullable (from the connection, never the body; set to `NULL` after 90 days, see §7.2) · `geo` jsonb nullable (`null` when all providers fail) ·
`idempotency_key` text nullable · `created_at` timestamptz

**Indexes**

| Index | Serves |
|---|---|
| `widgets(owner_id)` | list my widgets |
| `widgets(public_id)` unique | config lookup, submission lookup, owner URLs |
| `submissions(widget_id, created_at)` | submissions for one widget, newest first |
| `submissions(owner_id, created_at)` | dashboard stats per owner (expected; confirmed with `EXPLAIN` in Step 10) |
| `submissions(widget_id, idempotency_key)` unique | a retried submit stores one row; NULL keys never collide |

**Why these choices**

- **Random `public_id`.** Sequential ids would leak how many widgets exist and let anyone enumerate
  every tenant's widgets. (SQL injection is a separate issue: every query is parameterized.)
- **`owner_id` copied onto submissions.** Dashboard queries become `WHERE owner_id = $1` on one
  table with no join. The cost is denormalization; it stays correct because the value always comes
  from the widget row and a widget never changes owner.
- **jsonb for `fields` and `data`.** Each widget defines different fields, so fixed columns cannot fit.
- **Cascade on delete.** Deleting a widget deletes its submissions, and the visitors' personal data
  goes with it.
- **Tenant isolation lives in the query**: `WHERE public_id = $1 AND owner_id = $2`. Another
  tenant's resource returns **404**, not 403.

## 4. API surface

**Owner** (JWT, CORS closed, no cache)

| Method & path | Purpose | Success |
|---|---|---|
| `POST /auth/register` | create account | 201 |
| `POST /auth/login` | get a JWT; one generic failure message | 200 |
| `POST /api/widgets` | create; response includes `snippet` | 201 |
| `GET /api/widgets` | list my widgets | 200 |
| `GET /api/widgets/:publicId` | one widget; another tenant's → 404 | 200 |
| `PATCH /api/widgets/:publicId` | edit | 200 |
| `DELETE /api/widgets/:publicId` | delete, cascading to submissions | 204 |
| `GET /api/submissions?widgetId=&limit=&cursor=` | my submissions, newest first; returns `geo`, never `ip` | 200 |
| `GET /api/stats/overview` | totals, per widget, per day, per country (SQL aggregation) | 200 |

**Customer site** (no auth, cached)

| Method & path | Returns | Cache |
|---|---|---|
| `GET /widget.js?id=…` | tiny loader that knows the current bundle name | `max-age=300` |
| `GET /widget.<hash>.js` | the widget code | `public, max-age=31536000, immutable` |
| `GET /widgets/:publicId/config` | minimal JSON: type, title, fields, button text, display; no `owner_id`, no internal ids. CORS open, no credentials | `public, max-age=60` + ETag → 304 |

Rule: **a fingerprinted URL gets a forever cache; a fixed URL gets a short cache.** The bundle URL
changes whenever its content does. The config URL does not, so an owner's edit reaches visitors
within 60 s, and the ETag makes the recheck a cheap 304 when nothing changed.

**Visitor** (no auth, CORS open, protected)

| Method & path | Notes |
|---|---|
| `OPTIONS /submissions` | preflight (JSON body and `Idempotency-Key` both trigger one); `maxAge` caches it |
| `POST /submissions` | 201; 400 malformed JSON, 413 too large, 415 wrong type, 422 invalid fields, 404 unknown widget, 429 + `Retry-After` |

Pipeline, cheapest check first:
**rate limit → body parse (10kb) → validate → honeypot → idempotency → geo (never throws) →
insert → enqueue email (failure logged, still 201)**. The limiter is an in-memory counter, so it
turns a flood away before any parsing or database work.

Errors use one envelope everywhere, with CORS headers on public error responses too:
`{ "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [] } }`

Plus `GET /health`.

## 5. Layers

```
HTTP ─► routes / middleware  src/http/          auth, CORS, rate limit, parse, error handler; req/res only
          │
          ▼
        services             src/services/      business logic; no SQL, no req/res; dependencies injected
          │            ╲
          ▼             ╲
        repositories    integrations            repositories: the ONLY place SQL lives
        src/repositories/  src/integrations/    integrations: geo providers, mailer
          │
          ▼
        PostgreSQL ◄──── jobs  src/jobs/        pg-boss worker, separate process
```

- **Testability.** Services receive their repositories, geo providers and mailer as arguments, so
  tests pass in fakes (e.g. "provider A down") and never touch the network.
- **Auditability.** With SQL in one folder, checking that every tenant-scoped query has
  `owner_id` in its `WHERE` means reading one folder, not the whole codebase.

## 6. Non-goal

**No teams or roles inside a tenant.** One user account is one tenant. Teams would turn every
`owner_id = $2` check into a membership join plus a permission check, multiplying the places where
isolation can go wrong, for a feature the brief does not grade. The design does not block it later:
`owner_id` could become a `tenant_id` pointing at an organization.

## 7. Decisions and trade-offs

### 7.1 Loader + hashed bundle, not a cache-bust query string

- **Chosen:** the snippet points at a fixed `/widget.js` loader (5 min cache), which loads
  `widget.<hash>.js` (cached for a year, `immutable`).
- **Rejected:** `<script src="/widget.js?v=3">`. The version lives in the customer's HTML, which we
  cannot edit, so shipping new code would need every customer to change their page, or we would
  have to give up long caching.
- **Cost we accept:** one extra round trip (loader → bundle) before the form renders. It is
  acceptable because the loader is tiny and the bundle comes from the browser cache on repeat
  visits, so the cost falls mostly on the first visit. A new deploy reaches every site within about
  5 minutes with no action from owners.

### 7.2 Store the raw IP plus geo, not geo only

- **Chosen:** keep `ip` (inet) and `geo` (jsonb) on each submission.
- **Gains:** rows stored with `null` geo can be re-enriched later from the stored IP; abuse that
  gets past the honeypot (many junk rows from one address) can be investigated internally.
  (The rate limiter does not need it: it reads the live connection IP in memory.)
- **Cost:** an IP is personal data. We hold the visitor's data, so we limit how far it spreads:
  - **Never logged.** pino output never contains raw IPs.
  - **Never shown to owners.** The dashboard API returns `geo` only; `ip` stays internal.
  - **Kept 90 days.** A scheduled pg-boss job sets `ip = NULL` on submissions older than 90 days;
    the submission and its geo remain.
  - **No deletion endpoint** for individual visitors; listed as a limitation in the README.
