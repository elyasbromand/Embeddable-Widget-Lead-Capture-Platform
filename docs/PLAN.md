# Widget & Lead-Capture Platform — Implementation Plan

Oct 20, 2026 · @Elyas Bromand

We build this in 13 small steps (0 to 12), in the order the brief teaches them, and every step ends in a gate you prove with a pasted command. Budget is 38 to 52 focused hours, matching the brief's 35 to 50.

## How we'll work

**The loop for every step**

1. You read the listed resources, time-boxed. Items marked _(brief)_ are the ones the capstone PDF names.
2. I ask two check questions; you answer in your own words before we write code.
3. You write the first version of the parts that teach (validation, tenant queries, CORS, fallback logic). I review and explain what I would change and why. I write boilerplate while you watch.
4. We run the gate. You paste the proof into EVIDENCE.md and one honest line into BUILDLOG.md right then.
5. You commit with a message that says what changed. Keep main runnable and commit at least once per working session, so every brief phase is visible in the history.

**Stack (my recommendation, confirm at the end)**

| Concern          | Choice                         | Why                                                                        |
| ---------------- | ------------------------------ | -------------------------------------------------------------------------- |
| Runtime and HTTP | Node 22+ LTS, ESM, Express 5   | Express 5 forwards async errors to the error handler, so fewer silent 500s |
| Database access  | `pg` with raw SQL              | You see every tenant-scoped query; no ORM hiding it                        |
| Migrations       | `node-pg-migrate`              | Brief requires schema as migrations                                        |
| Validation       | `zod`                          | Named in the brief; builds schemas at runtime from widget fields           |
| Auth             | `bcrypt` plus JWT bearer token | Easy to test with curl; passwords never stored in clear                    |
| Rate limiting    | `express-rate-limit`           | Named in the brief; per-IP and per-widget keys                             |
| Background jobs  | `pg-boss`                      | Queue on the Postgres we already run; retries and dead-letter built in     |
| Email            | `nodemailer` into Mailpit      | Free local catcher; failure tolerance is what is graded                    |
| Logging          | `pino` with redaction          | Keeps tokens and passwords out of logs                                     |
| Tests            | `vitest` and `supertest`       | Fast, deterministic probes                                                 |
| Widget bundle    | `esbuild`                      | One command to a hashed, minified file                                     |
| Geo providers    | ip-api.com, then ipapi.co      | The brief's free pair                                                      |

**Time per step**

| Brief phase                  | Steps            | Hours                                                                    |
| ---------------------------- | ---------------- | ------------------------------------------------------------------------ |
| 1 Design                     | 0, 1             | 4 to 6                                                                   |
| 2 Hardened submission path   | 2, 3, 5, 6, 7, 8 | 19 to 26 (the brief says 14 to 20; we add the foundation and auth steps) |
| 3 Delivery, dashboard, proof | 4, 9, 10, 11, 12 | 15 to 20                                                                 |

**Architecture we are building**

&#91;embedded content: architecture · 3 request paths, 1 guarded pipeline\]

Three actors, three request paths: the owner manages widgets behind auth, the customer's page loads cached public assets, and visitors reach the guarded submission pipeline.

## Coverage map

Every box in the brief's Section 6, every shared requirement and all six probes land in a named step. If a row has no proof in EVIDENCE.md, it counts as not done.

**Section 6 requirements**

| Requirement                                                                  | Step  | Proof to paste in EVIDENCE.md                                         |
| ---------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| Authenticated widget CRUD; no valid auth is rejected                         | 3     | curl without a token returns 401                                      |
| Tenant A cannot read or change tenant B's widgets or submissions             | 3, 11 | curl as A on B's widget returns 404; the test name and output         |
| Embed snippet generated per widget                                           | 4     | Create-widget response containing the `<script>` line                 |
| Public config endpoint: small payload, correct cache headers                 | 4     | `curl -I` showing Cache-Control and ETag                              |
| Widget JS served as a versioned bundle                                       | 4     | Hashed bundle URL with `immutable`; loader with short cache           |
| Widget renders on a different origin                                         | 9     | Browser console and page on :5500 calling the API on :3000            |
| Cross-origin submit works; preflight handled                                 | 5     | `OPTIONS` transcript with Access-Control headers, then a browser POST |
| Malformed and oversized payloads rejected with 4xx JSON (Probe 2)            | 5     | Transcript showing 400, 413, 415, 422, never 500                      |
| Valid submissions stored and linked to the right widget and tenant (Probe 1) | 5, 10 | SQL row, then the same row through the dashboard API                  |
| Burst gets 429 and normal traffic still works (Probe 3)                      | 6     | Attack script output: N times 201, then 429s, then one 201            |
| One spam control blocks a spammer (Probe 6)                                  | 6     | Honeypot-filled POST is dropped; row count unchanged                  |
| Provider A down, provider B enriches (Probe 4)                               | 7     | Test name and output; stored row has geo from B                       |
| All providers down, submission still stored without geo (Probe 4)            | 7     | Test output; stored row with null geo                                 |
| Failing email or webhook does not block the submission (Probe 5)             | 8     | Forced-failure run: 201, stored row, retry log lines                  |
| Owner dashboard: submissions and basic analytics                             | 10    | Responses for list, per-widget counts, counts per day, geo breakdown  |
| README with diagram, setup, API docs; required files present                 | 12    | Fresh-clone run from the README alone                                 |

**Shared requirements (every capstone)**

| #   | Requirement                                                   | Step     | How we meet it                                                                                                                                                                  |
| --- | ------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Layered architecture                                          | 2, 3     | Routes, then services, then repositories; SQL lives only in repositories                                                                                                        |
| 2   | Validation at the boundary, never a 500 for bad input         | 2, 5     | One zod schema per input and one central error handler; body-parser errors mapped to 400 and 413                                                                                |
| 3   | At least one background job, with retries and a failure alert | 8        | pg-boss queue for confirmation email; retries with backoff; final failure goes to a dead-letter queue and an ALERT log line                                                     |
| 4   | Real persistence: migrations, right indexes, isolated tenants | 2, 3, 10 | node-pg-migrate files; indexes chosen from the queries we write; every query scoped by owner                                                                                    |
| 5   | Idempotency where it matters                                  | 6, 8     | `Idempotency-Key` on submissions with a unique index; job `singletonKey` so one email per submission                                                                            |
| 6   | Secrets clean                                                 | 0, 2, 12 | Env only, validated at boot, `.env` ignored, pino redaction, bcrypt hashes; no third-party secrets are stored, so nothing needs encrypting at rest; gitleaks scan before submit |
| 7   | Cost tracking, if AI is used                                  | 12       | The product uses no AI, so we state that in the README; our own AI use goes in BUILDLOG.md                                                                                      |

## Steps 0 to 3: setup, design, foundation, tenants

### Step 0 · Repo and tooling (about 1 h)

A public repository exists before any code does, and a leaked secret is impossible by construction.

**Read first**

- [The Twelve-Factor App: Config](https://12factor.net/config) (10 min): why secrets live in env vars.

**Build**

- [ ] Create the public repo `Embeddable-Widget-Lead-Capture-Platform` with an MIT license
- [ ] First commit: README skeleton and `.gitignore` (`node_modules`, `.env`, `dist`)
- [ ] `npm init`, set `"type": "module"`, add `.nvmrc` for Node 22
- [ ] Create empty `BUILDLOG.md`, `EVIDENCE.md` (one heading per row of the coverage map), `.env.example` and a `capstone.yaml` stub

**Gate:** the repo is public and `git log` shows a first commit with no code in it.

**Mentor note:** `.gitignore` goes in before the first commit. A key that reaches history means rotating it and rewriting history.

### Step 1 · Design document (about 3 to 5 h)

One page, committed, that you can defend. This is the brief's Phase 1 gate.

**Read first**

- [MDN: Cross-Origin Resource Sharing](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) _(brief)_, 30 min. Origins, preflight, headers.
- [MDN: HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching) _(brief)_, 25 min.
- [Cloudflare: What is rate limiting?](https://www.cloudflare.com/learning/bots/what-is-rate-limiting/) _(brief)_, 10 min.
- [How to stop bots with honeypots (WorkOS)](https://workos.com/blog/stop-bots-with-honeypots), 10 min. The brief names a honeypot article by title; this one covers the same ground.

**Build** `docs/DESIGN.md`

- [ ] Problem statement in three sentences
- [ ] Data model: `users`, `widgets`, `submissions` with columns, tenancy and indexes. Draft: a tenant is a user account; widgets carry a random public id (nanoid) separate from the internal key; submissions also store the visitor ip and the geo result, and carry `widget_id` and a copy of `owner_id`
- [ ] API surface for the three paths: owner (authenticated), customer site (public, cached), visitor (public, CORS, protected)
- [ ] Layer sketch: routes, services, repositories, integrations, jobs
- [ ] One explicit non-goal. Suggestion: no teams or roles inside a tenant
- [ ] Two decisions with a trade-off written down: (1) `widget.js` as a short-lived loader that pulls an immutable hashed bundle, versus a cache-bust query string; (2) storing the raw IP plus the geo result (our choice) versus the geo result only; the trade-off is that an IP is personal data, so we write down how long we keep it and keep it out of the logs

**Gate:** `docs/DESIGN.md` is committed.

**Check yourself**

1. Which requests trigger a preflight, and what does the browser do if the answer is wrong?
2. Which of the three paths needs permissive CORS, and why must the admin API not allow every origin?

### Step 2 · Foundation (about 3 to 4 h)

A running skeleton with layers, a database, migrations, validated config and one error format, so every later step plugs into it.

**Read first**

- [node-postgres: pooling](https://node-postgres.com/features/pooling), 15 min.
- [node-pg-migrate docs](https://salsita.github.io/node-pg-migrate), 20 min. Migrations are plain files with `up` and `down`, run in a transaction.
- [Express: error handling](https://expressjs.com/en/guide/error-handling.html), 15 min.
- [PostgreSQL: indexes](https://www.postgresql.org/docs/current/indexes.html), skim the intro, 15 min.
- [pino: redaction](https://getpino.io/#/docs/redaction), 5 min.

**Build**

- [ ] `docker-compose.yml` with Postgres and Mailpit; `docker compose up` works
- [ ] Folders: `src/http` (routes, middleware), `src/services`, `src/repositories`, `src/integrations`, `src/jobs`, `src/config`. Rule: SQL only inside repositories
- [ ] Config module that parses `process.env` with zod and fails fast at boot
- [ ] Migrations for `users`, `widgets`, `submissions`, with ip (inet) and geo (jsonb) columns on submissions, and indexes on `widgets(owner_id)`, `submissions(widget_id, created_at)` and a unique index on `submissions(widget_id, idempotency_key)`
- [ ] Central error handler: an `AppError` family becomes `{ "error": { "code", "message" } }`; anything unknown becomes a generic 500 and the detail goes to the log
- [ ] `GET /health`; pino logger redacting `authorization` and `password`

**Gate:** `docker compose up`, `npm run migrate up`, then `GET /health` returns 200; `migrate down` also works.

**Check yourself**

1. Why a connection pool instead of one client per request?
2. Why do indexes belong in migrations rather than being added by hand?

**Mentor note:** pick the error envelope now. Steps 3, 5, 6 and 10 all reuse it, and changing it later touches everything.

### Step 3 · Auth, widget CRUD and tenant isolation (about 4 to 5 h)

The owner side of the product, with isolation enforced in every query rather than in the UI.

**Read first**

- [OWASP: Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), 15 min.
- [jwt.io: Introduction](https://jwt.io/introduction), 10 min.
- [OWASP: IDOR Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html), 10 min. This is the bug class tenant isolation prevents.
- [Zod: basic usage](https://zod.dev) _(brief)_, 15 min.
- [MDN: HTTP status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status) _(brief)_. Keep it open from here on.

**Build**

- [ ] `POST /auth/register` and `POST /auth/login` with bcrypt and a JWT; login failures use one generic message
- [ ] `requireAuth` middleware that puts `req.user.id` on the request
- [ ] Widget CRUD under `/api/widgets`: create, list, get, patch, delete. A zod schema checks type (signup form, contact form or CTA popover; one or two types are enough), title and description length, field list size, button text and display options
- [ ] Every repository function takes `ownerId`: `WHERE id = $1 AND owner_id = $2`. Another tenant's widget returns 404
- [ ] Seed script with two demo tenants and a widget each

**Gate:** a curl without a token returns 401; tenant A asking for tenant B's widget returns 404. Paste both.

**Check yourself**

1. Why 404 and not 403 for another tenant's widget?
2. Where is tenant isolation enforced, in a middleware or in the query? What breaks if you fetch by id first and compare the owner afterwards?

**Mentor note:** you write the owner-scoped repository functions. The dashboard in Step 10 repeats the same pattern, so get it right once.

## Steps 4 to 6: delivery, submissions, protection

### Step 4 · Embed snippet and cached delivery (about 4 to 5 h)

One pasted line must load everything. Delivery is public, small and cacheable like a CDN would serve it.

**Read first**

- [MDN: Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control) _(brief)_, 15 min. Focus on `max-age`, `immutable` and `public`.
- [Building an Embeddable JavaScript Widget](https://www.gorillasun.de/blog/building-an-embeddable-javascript-widget/) _(brief, matched by title)_, 20 min.
- [How to build a lightweight embeddable widget in vanilla JS](https://dev.to/alex_boykov/how-to-build-a-lightweight-embeddable-widget-in-vanilla-js-under-30kb-5f4b), 15 min. Closer to our case: a script tag, a widget id, a config fetch, a render.
- [esbuild: getting started](https://esbuild.github.io), 10 min.

**Build**

- [ ] Widget responses include `snippet`: `<script src="{PUBLIC_BASE_URL}/widget.js?id=abc123"></script>`, with the base URL from env
- [ ] `GET /widget.js`: a tiny loader that reads the id from its own script tag, fetches the config and loads the bundle. Short cache, for example `max-age=300`
- [ ] esbuild step that writes `dist/widget.<content-hash>.js`, served with `Cache-Control: public, max-age=31536000, immutable`; the loader learns the current hash from a manifest
- [ ] `GET /widgets/:id/config`: public, minimal payload (no owner id, no internal keys), `Cache-Control: public, max-age=60`, an ETag, and `304` on a matching `If-None-Match`
- [ ] Unknown id returns a JSON 404 with a short cache time. The config response also carries CORS headers (no credentials), because the widget fetches it from another origin

**Gate:** `curl -I` shows the headers on loader, bundle and config; a repeat request with the ETag returns 304.

**Check yourself**

1. Why can the hashed bundle be cached for a year while the loader cannot?
2. A customer pasted the snippet last month. What happens to them when you ship a new bundle?

**Mentor note:** every byte of the config is paid by every visitor of every customer site. Keep it small, and never leak `owner_id`.

### Step 5 · Public submission endpoint (about 4 to 5 h)

The heart of the capstone and the CORS afternoon the brief warns about. The client is the entire internet, so nothing it sends is trusted.

**Read first**

- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) again, this time the preflight and `Access-Control-Allow-*` sections.
- [Express cors middleware](https://expressjs.com/en/resources/middleware/cors.html) _(brief)_, 15 min.
- [Zod: basic usage](https://zod.dev) _(brief)_, for building schemas at runtime.
- [Express: `express.json` options](https://expressjs.com/en/api.html#express.json), for the size `limit`.

**Build**

- [ ] `POST /submissions` with a body like `{ widgetId, fields, idempotencyKey?, <honeypot> }`
- [ ] CORS on the public routes only: no credentials, allow `Content-Type` and `Idempotency-Key`, answer `OPTIONS`, set `maxAge` for preflight caching. The admin API stays closed to foreign origins
- [ ] `express.json({ limit: '10kb' })`: oversized returns 413, malformed JSON 400, wrong content type 415
- [ ] Build a zod schema from the widget's own field definitions: reject unknown fields, check types, lengths and email format. Unknown widget returns 404, invalid fields return 422 with `{ error: { code, message, details } }`
- [ ] Insert the row. `widget_id` and `owner_id` come from the widget row in the database, never from the request. Store the visitor IP from the server's own view of the connection, never from a client-supplied field
- [ ] Test with curl and `-H "Origin: http://localhost:5500"` before any browser is involved

**Gate (Probes 1 and 2):** the preflight shows the Access-Control headers; a valid POST returns 201; malformed and oversized payloads return clean 4xx JSON, never 500.

**Check yourself**

1. Does CORS protect your server from curl or a script? If not, what does?
2. Why is `Access-Control-Allow-Origin: *` fine here but unsafe on an endpoint that uses cookies?
3. Why does the server choose `owner_id` and not the client?

**Mentor note:** open DevTools, Network tab, and find the preflight as its own `OPTIONS` row. Seeing it once removes most of the mystery.

### Step 6 · Abuse protection and idempotency (about 3 to 4 h)

A flood must not take you down, and a retried submit must happen once. You will attack your own API to prove it.

**Read first**

- [Cloudflare: What is rate limiting?](https://www.cloudflare.com/learning/bots/what-is-rate-limiting/) _(brief)_, if you skipped it in Step 1.
- [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) _(brief)_, 15 min.
- [Express: behind proxies](https://expressjs.com/en/guide/behind-proxies.html), 10 min. `trust proxy` decides which client IP you see, and a wrong setting lets attackers spoof it.
- [How to stop form bots with honeypot fields](https://dev.to/jeffbuildstech/how-to-stop-form-bots-with-honeypot-fields-8od), 10 min. Covers field naming and hiding.
- [Stripe: Designing robust and predictable APIs with idempotency](https://stripe.com/blog/idempotency), 15 min.

**Build**

- [ ] Per-IP limit (for example 10 per minute) and per-widget limit (for example 100 per minute). Over the limit returns 429 with `Retry-After` and the same JSON error shape
- [ ] Run the limiter before body parsing and before any database work
- [ ] Honeypot: a field with an ordinary-looking name such as `website`, positioned off-screen by the widget. If filled, return the same success response and store nothing. Log a counter
- [ ] `Idempotency-Key`: the widget makes a UUID per form render; `INSERT ... ON CONFLICT DO NOTHING` on the unique index; a retry returns the original result
- [ ] `scripts/attack.js` fires a burst, counts 201s and 429s, waits for the window, then sends one normal request

**Gate (Probes 3 and 6):** the burst shows 429s, a normal request afterwards returns 201, and the honeypot POST adds no row.

**Check yourself**

1. Why answer a bot that hit the honeypot with a success response?
2. When does a per-IP limit fail on its own (shared office network, many attacking IPs), and what does the per-widget limit add?

**Mentor note:** an in-memory limiter resets on restart and is not shared between processes. That is acceptable here; say so under "limitations" in the README and name Postgres or Redis as the real fix.

## Steps 7 to 9: enrichment, side effects, the real widget

These three steps share one discipline: a broken dependency degrades the response and never destroys it.

### Step 7 · Geo enrichment with a fallback chain (about 2 to 4 h)

**Read first**

- [ip-api.com: JSON API](https://ip-api.com/docs/api:json) _(brief)_, 10 min. No key, 45 requests per minute, and the free endpoint is HTTP only.
- [ipapi.co: API](https://ipapi.co/api/) _(brief)_, 10 min. About 1,000 lookups a day on the free tier.
- [MDN: `AbortSignal.timeout()`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static), 5 min. How you stop waiting on a slow provider.

**Build**

- [ ] Provider interface: `lookup(ip)` returns `{ country, region, city }` or throws. Implement `ipApiProvider` and `ipapiCoProvider`, plus a `mockProvider` you can switch to "up" or "down"
- [ ] `geoService.lookup(ip)` tries providers in order, each with its own timeout (start at 1.5 s). It catches every failure and returns `null` when all fail. It never throws
- [ ] Providers are passed into the service (dependency injection), so tests never touch the network
- [ ] Skip private and loopback addresses; for local development add an env override that supplies a public test IP
- [ ] Call the service after validation and rate limiting, before the insert. Store `geo` as JSON, `null` when missing
- [ ] Optional: small in-memory cache per IP so you stay under 45 requests a minute, and a pg-boss job that backfills geo for rows stored with null geo, using the stored IP

**Gate (Probe 4):** with A down, the row is enriched by B; with both down, the row is stored without geo and the response is still 201.

**Check yourself**

1. Why does a slow provider hurt more than a dead one?
2. Where does the fallback logic belong: route, service or provider? What does that choice do to testing?

**Mentor note:** write the test for "both down" first. It forces you to decide that `lookup` returns `null` instead of throwing.

### Step 8 · Background job and safe side effects (about 3 to 4 h)

The email must be sent without ever being able to fail the submission. This also satisfies the shared requirement for a background job with retries and an alert.

**Read first**

- [pg-boss on GitHub](https://github.com/timgit/pg-boss), 20 min. Covers `send`, `work`, retries with backoff and dead-letter queues. It needs Node 22 or newer.
- [Nodemailer](https://nodemailer.com), 10 min.
- [Mailpit](https://mailpit.axllent.org), 5 min. The local inbox your emails land in.

**Build**

- [ ] Start pg-boss in a separate worker entry (`npm run worker`) and create the `confirmation-email` queue
- [ ] After the insert commits, enqueue with `retryLimit`, `retryBackoff` and `singletonKey: submissionId`. Wrap the enqueue in try and catch; a failure is logged and the response is still 201
- [ ] Worker loads the submission and sends through Nodemailer to Mailpit. On a throw the job retries
- [ ] When retries run out, the job lands in a dead-letter queue and the worker logs an `ALERT` line with the submission id
- [ ] Fault injection: `FORCE_EMAIL_FAILURE=true`, off by default and documented in `.env.example`

**Gate (Probe 5):** with the failure forced, the POST returns 201, the row exists, the log shows retries, and the job ends in the dead-letter queue.

**Check yourself**

1. Why a queue instead of `await sendMail()` in the handler inside a try and catch?
2. What goes wrong if you enqueue before the insert commits?

**Mentor note:** draw the boundary on paper: which errors propagate to the visitor (validation, rate limit) and which are swallowed and logged (geo, email). That sketch goes in the README.

**Phase 2 gate (brief):** a cross-origin curl stores an enriched row. Send a valid POST with `-H "Origin: http://localhost:5500"` and the public test IP override; the row has geo, the email shows in Mailpit, and Probes 2 to 6 pass.

### Step 9 · Second-origin test page and the real widget (about 3 to 4 h)

The moment the widget appears on a page you did not build.

**Read first**

- Re-read the two embeddable-widget articles from Step 4, now with the loader code in front of you.
- [MDN: Using the Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch), 15 min.
- Optional: [MDN: Using shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM), so the host page's CSS cannot break the form.

**Build**

- [ ] `widget/src`: find the script tag, fetch the config, render the form from the config fields, add the off-screen honeypot input, generate the idempotency key, submit with `fetch`, show success, validation and rate-limit messages
- [ ] Render customer-written text with `textContent`, never `innerHTML`
- [ ] `test-site/index.html` containing only the one-line snippet, served on port 5500 with `npx serve`, while the API runs on 3000
- [ ] Rebuild the bundle with esbuild and confirm the loader picks up the new hash

**Gate:** the widget renders on :5500, a submission shows up in the database, and DevTools shows the preflight and the POST.

**Check yourself**

1. The tenant writes the widget title; a visitor on someone else's site sees it. What attack does `innerHTML` open, and who is the victim?
2. If the API sends CORS headers on success but forgets them on error responses, what does the widget see?

**Mentor note:** test the error paths in the browser as well (429 and 422). A CORS header missing from an error response makes the widget see a network error instead of your clean JSON.

## Steps 10 to 12: dashboard, proof, submission

### Step 10 · Owner dashboard API (about 3 to 4 h)

The owner sees submissions and simple analytics. Endpoints plus a plain table are enough; this is a backend capstone.

**Read first**

- [PostgreSQL: `date_trunc` and date functions](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-TRUNC), 10 min. Counts over time are a `GROUP BY date_trunc('day', created_at)`.
- [PostgreSQL: `EXPLAIN`](https://www.postgresql.org/docs/current/using-explain.html), 15 min. You will check that your queries use the indexes from Step 2.
- Re-read the OWASP IDOR sheet from Step 3. Every query here is owner-scoped too.

**Build**

- [ ] `GET /api/submissions?widgetId=&limit=&cursor=`: owner-scoped, newest first, paginated
- [ ] `GET /api/stats/overview`: totals, count per widget, count per day for the last N days, breakdown by country
- [ ] All aggregation in SQL, not in JavaScript
- [ ] Run `EXPLAIN` on each query; add an index only where a query needs one, and note it in EVIDENCE.md
- [ ] Optional: a one-page HTML table that calls these endpoints

**Gate (Probe 1):** the submission made from the :5500 page appears in the API, the stats numbers match a hand-written SQL count, and a second tenant's token sees none of these submissions.

**Check yourself**

1. Why aggregate in SQL instead of loading rows and counting in JavaScript?
2. Which index serves "submissions per day for this owner", and how would `EXPLAIN` show it is used?

### Step 11 · Tests and attack scripts (about 3 to 4 h)

The brief lists a test suite as optional, but EVIDENCE.md asks for a test name and output per box, so we write one. Deterministic is the point.

**Read first**

- [Vitest: getting started](https://vitest.dev), 15 min.
- [supertest](https://github.com/ladjs/supertest), 10 min.

**Build**

- [ ] Test database in Docker, reset between files; migrations run before the suite
- [ ] One test per probe: CORS preflight, malformed and oversized payload, rate-limit burst and recovery, honeypot, geo A to B to none, forced email failure, tenant isolation for widgets and for submissions
- [ ] Mock geo providers injected into the service; limiter state reset between tests
- [ ] `npm test` is the single command; its output goes into EVIDENCE.md

**Gate:** all tests green from a clean database.

**Check yourself**

1. How do you prove the fallback without touching the network?
2. What makes a rate-limit test flaky, and how do you remove it?

### Step 12 · Submission pack (about 2 to 3 h)

The brief checks the repo structure before any human looks, then runs the probes against your live system.

**Read first**

- Brief Sections 11 to 13 again: required files, how to submit, how it is evaluated.
- [gitleaks](https://github.com/gitleaks/gitleaks), 5 min. A scanner that finds committed secrets.

**Build**

- [ ] `README.md`: what it does, architecture diagram, exact run and seed commands, API table, an honest limitations note (in-memory limiter, HTTP-only free geo tier, raw IPs stored as personal data, with a retention note and no deletion endpoint)
- [ ] `capstone.yaml`: `run`, `seed`, `test`, `base_url` and the endpoints to probe
- [ ] `EVIDENCE.md`: one pasted proof for every row of the coverage map
- [ ] `BUILDLOG.md`: where AI helped, where it was wrong, what you changed. Be able to explain any 2 or 3 lines the evaluator picks
- [ ] `.env.example` has every variable with a placeholder; run gitleaks on the full history
- [ ] Fresh clone in a temp folder: one run command, one seed command, all six probes work
- [ ] Submit the repo link through the portal. No ZIP files

**Gate:** someone else, or you in a clean folder, runs the project from the README alone.

**Mentor note:** an honest half-built history beats one big final push. Do not force-push over your commits before submitting.

## Working with Claude Code

You implement with Claude Code and use this chat as the mentor. They share no memory, so the repo carries the context.

- [ ] In Step 0, commit this plan as `docs/PLAN.md` and a short `CLAUDE.md` at the repo root. Claude Code loads `CLAUDE.md` every session; keep it under about 200 lines
- [ ] `CLAUDE.md` holds the stack, the layer rule (SQL only in repositories), the error envelope, the run and test commands, a pointer to `docs/PLAN.md`, and a mentor rule: for validation, tenant queries, CORS and fallback logic, ask you to write the first version, then explain and review
- [ ] Start each Claude Code session with: "We are on Step N of docs/PLAN.md"
- [ ] At each gate, have Claude Code append to `BUILDLOG.md` and paste the proof into `EVIDENCE.md`, then bring the diff and test output to this chat for review
- [ ] You must be able to explain any 2 or 3 lines the evaluator picks, so you write the teaching parts yourself

## Final self-check and stretch

When Step 12 is done, we walk the coverage map row by row, run all six probes in order against a fresh clone, and only then submit. If you are short on time, shrink scope (one widget type, fake email) and skip nothing: the brief says a shipped core is a passing capstone.

After the core ships, pick **one** stretch goal and finish it. Cheap and relevant: minify the bundle (esbuild already does it), then either a live dashboard with Server-Sent Events or proof-of-work bot defense with a measured spam reduction.

## Decisions to confirm before Step 0

1. Is the stack table acceptable (Express 5, `pg` with raw SQL, zod, pg-boss, vitest)?
2. Do we use the loader plus hashed bundle design for `widget.js`, instead of a cache-bust query string?
3. Tenant equals user account, with teams as the written non-goal?
4. Email through Mailpit as the side effect, with webhooks left as a stretch?
5. Do you want to set up the repo and the first commit together as Step 0?

Unless you say otherwise, we proceed with the defaults above. Background jobs stay on pg-boss.

## Sources

Found through web search while building this plan (search snippets only, pages not fully read): [WorkOS on honeypots](https://workos.com/blog/stop-bots-with-honeypots), [honeypot fields on DEV](https://dev.to/jeffbuildstech/how-to-stop-form-bots-with-honeypot-fields-8od), [Building an Embeddable JavaScript Widget](https://www.gorillasun.de/blog/building-an-embeddable-javascript-widget/), [lightweight widget on DEV](https://dev.to/alex_boykov/how-to-build-a-lightweight-embeddable-widget-in-vanilla-js-under-30kb-5f4b), [node-pg-migrate](https://salsita.github.io/node-pg-migrate) and [pg-boss](https://github.com/timgit/pg-boss).

Linked from memory and not opened this session: the MDN, Express, PostgreSQL, OWASP, Zod, Cloudflare, Stripe, ip-api, ipapi.co, Nodemailer, Mailpit, Vitest, esbuild, pino and gitleaks pages. If one has moved, search its title. The brief's own honeypot and widget articles are named by title only, so I matched them to the closest articles I could find.
