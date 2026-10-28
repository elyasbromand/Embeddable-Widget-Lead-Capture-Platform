# CLAUDE.md

Embeddable Widget & Lead-Capture Platform. Owners create form widgets, paste one `<script>` line
on their site, and visitors' submissions land in a hardened, tenant-isolated backend.
This is a **learning capstone**: the human is learning by building. Teaching beats speed.

The full plan, step by step, is in **`docs/PLAN.md`**. It is the source of truth for scope,
order and gates. If this file and the plan disagree, the plan wins; point out the conflict.

## Session protocol

Every session starts with: _"We are on Step N of docs/PLAN.md"_. Then:

1. Re-read Step N in `docs/PLAN.md` (Read first, Build, Gate, Check yourself, Mentor note).
2. **Ask the two "Check yourself" questions** and wait for answers in the learner's own words
   before writing code. Correct misunderstandings gently and briefly.
3. Build the step, following the mentor rules below.
4. Run the gate. Paste the proof into `EVIDENCE.md` and append one honest line to `BUILDLOG.md`.
5. Suggest a commit message that says what changed. Commit only when asked.

Do not jump ahead to later steps. If something from a later step is needed, say so and stop.

## Mentor rules (most important)

The learner must be able to explain any 2 or 3 lines an evaluator picks.

- **Learner writes the first version** of the teaching parts:
  - validation (zod schemas, incl. the runtime schema built from widget fields)
  - tenant-scoped queries (every repository function that takes `ownerId`)
  - CORS configuration
  - fallback / failure-tolerance logic (geo chain, email enqueue boundary)
  - For these: describe what is needed and give hints, do **not** write the code. Then review
    their version: what you would change and **why**. Let them make the fix.
- **Claude may write boilerplate** (folder setup, docker-compose, config wiring, logger,
  scripts, test scaffolding) while explaining it briefly as it goes.
- Explain the "why" in short, plain sentences. Link to the step's reading when relevant.
- Never silently fix the learner's code; show the diff and the reason.
- Prefer small steps that run. Keep `main` runnable.

## Stack

| Concern         | Choice                                         |
| --------------- | ---------------------------------------------- |
| Runtime / HTTP  | Node 22+ LTS, ESM (`"type": "module"`), Express 5 |
| Database        | PostgreSQL via `pg`, **raw SQL**, no ORM       |
| Migrations      | `node-pg-migrate`                              |
| Validation      | `zod`                                          |
| Auth            | `bcrypt` + JWT bearer token                    |
| Rate limiting   | `express-rate-limit` (in-memory; documented limitation) |
| Background jobs | `pg-boss` (separate worker process)            |
| Email           | `nodemailer` → Mailpit (local)                 |
| Logging         | `pino` with redaction                          |
| Tests           | `vitest` + `supertest`                         |
| Widget bundle   | `esbuild` → `dist/widget.<hash>.js`            |
| Geo providers   | ip-api.com, then ipapi.co (fallback chain)     |

Do not add dependencies outside this table without asking first and saying why.

## Architecture rules

```
src/
  config/        env parsed with zod, fail fast at boot
  http/          routes + middleware (auth, cors, rate limit, error handler)
  services/      business logic, no SQL, no req/res
  repositories/  the ONLY place SQL lives
  integrations/  geo providers, mailer
  jobs/          pg-boss queues and worker
widget/src/      embeddable widget source (vanilla JS)
test-site/       second-origin page (port 5500) with only the snippet
migrations/      node-pg-migrate files
scripts/         seed, attack.js
```

- Layers: **routes → services → repositories**. Routes never touch SQL; services never touch `req`/`res`.
- **Tenant isolation lives in the query**, not in middleware or the UI:
  `WHERE id = $1 AND owner_id = $2`. Another tenant's resource returns **404**, not 403.
- `widget_id` and `owner_id` on submissions come from the DB widget row, **never** from the request.
- Visitor IP comes from the server's view of the connection (`trust proxy` set deliberately), never from the body.
- Dependencies (geo providers, mailer) are injected into services so tests never hit the network.
- Schema changes only through migrations, each with `up` and `down`. Indexes go in migrations.
- Aggregations (dashboard stats) are done in SQL, not JavaScript.

## Error envelope (fixed, reused everywhere)

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Human readable", "details": [] } }
```

- `details` is optional (validation errors).
- An `AppError` family maps to status codes; one central Express error handler renders it.
- Unknown errors → generic 500 with no internals; the detail goes to the log only.
- Bad input must **never** produce a 500: malformed JSON → 400, too large → 413,
  wrong content type → 415, invalid fields → 422, unknown widget → 404, rate limit → 429 + `Retry-After`.
- CORS headers must be present on **error** responses of public routes too.

## Public vs. owner surfaces

| Path                     | Auth | CORS                          | Cache                                  |
| ------------------------ | ---- | ----------------------------- | -------------------------------------- |
| `/auth/*`, `/api/*`      | JWT  | closed to foreign origins     | none                                   |
| `GET /widget.js` loader  | none | n/a (script tag)              | short, e.g. `max-age=300`              |
| `GET /widget.<hash>.js`  | none | n/a                           | `public, max-age=31536000, immutable`  |
| `GET /widgets/:id/config`| none | open, **no credentials**      | `public, max-age=60` + ETag / 304      |
| `POST /submissions`      | none | open, no credentials, preflight `maxAge` | none                        |

Submission pipeline order: rate limit → body parse (10kb) → validate → honeypot → idempotency →
geo (never throws, `null` on failure) → insert → enqueue email (failure logged, still 201).

## Security & secrets

- Secrets only in env vars. `.env` is git-ignored; `.env.example` lists every variable with placeholders.
- Never print, log or commit real secrets. pino redacts `authorization`, `password`, tokens.
- Passwords hashed with bcrypt. Login failures use one generic message.
- Widget text written by tenants is rendered with `textContent`, **never** `innerHTML`.
- Public widget config never includes `owner_id` or internal keys.
- Raw IPs are personal data: keep them out of logs.

## Commands

Planned; update this section as each one actually exists.

```bash
docker compose up -d        # Postgres + Mailpit (Mailpit UI: http://localhost:8025)
npm run migrate up          # apply migrations   (npm run migrate down to roll back)
npm run seed                # two demo tenants with a widget each
npm run dev                 # API on http://localhost:3000 (auto-restart on change; `npm start` without)
npm run worker              # pg-boss worker (email jobs)
npm run build:widget        # esbuild → dist/widget.<hash>.js + manifest
npx serve test-site -l 5500 # second-origin test page
npm test                    # vitest, single command for the whole suite
node scripts/attack.js      # rate-limit burst probe
```

Environment: Windows 11, Git Bash and PowerShell both available. Prefer cross-platform npm scripts.

## Evidence & logs

- `EVIDENCE.md`: one heading per coverage-map row in `docs/PLAN.md`. Every gate pastes real
  command output (curl transcripts, test output, SQL rows). **No proof = not done.** Never invent output.
- `BUILDLOG.md`: one honest line per gate: what was built, where AI helped, where it was wrong,
  what the learner changed. Date each entry.
- Fault injection flags (e.g. `FORCE_EMAIL_FAILURE=true`) are off by default and documented in `.env.example`.

## Git

- Commit at least once per working session; messages describe what changed.
- Never force-push, never rewrite history. An honest, incremental history is part of the grade.
- Don't commit unless the learner asks.

## Progress

Update this line at each gate.

- Step 0 done (2026-10-22): repo public, scaffolding in place, gate proof in EVIDENCE.md.
- Step 1 done (2026-10-22): `docs/DESIGN.md` committed (19e2cf0).
- Step 2 done (2026-10-28): foundation running; compose, migrations up/down, `/health`, error envelope, pino redaction. Proof in EVIDENCE.md.
- Current step: **Step 3, auth, widget CRUD and tenant isolation**
