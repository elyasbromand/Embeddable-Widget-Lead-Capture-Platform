# Build Log

One honest line per gate: what was built, where AI helped, where it was wrong, what I changed.

| Date | Step | Entry |
| ---- | ---- | ----- |
| 2026-10-22 | 0 | Repo scaffolding (README, .gitignore, package.json as ESM, .nvmrc, .env.example, capstone.yaml, CLAUDE.md). Claude wrote the boilerplate; `npm init` defaulted to ISC + CommonJS and was corrected to MIT + `"type": "module"`. |
| 2026-10-22 | 1 | `docs/DESIGN.md` written section by section in discussion; Claude drafted the text from the agreed answers. My decisions: cascade on widget delete, `public_id` in owner URLs too, 90-day IP retention enforced by a pg-boss job, owners see geo but never IP. Corrected along the way: I had listed CORS as server protection (it protects browsers), linked sequential ids to SQL injection (that is parameterization), and said the limiter needs the stored IP (it uses the live one). |
| 2026-10-28 | 2 | Foundation. I wrote docker-compose, the zod config, the pg pool and the three migrations (added an extra `(owner_id, created_at)` index for dashboard stats). Claude wrote the boilerplate: pino logger, `AppError` family, central error handler with JSON 404, `app.js`/`server.js`, `GET /health` through route → service → repository. Gate: compose up, migrate down 3 / up, `/health` 200, and 503 in the same envelope with Postgres stopped. Claude's first redaction list was incomplete: a dropped connection logged the whole pg client object incl. its cancel `secretKey`; fixed by redacting `err.client` and re-checked the log. Check-yourself: pool answer missed the `max_connections` limit and queueing under load. |
