# Build Log

One honest line per gate: what was built, where AI helped, where it was wrong, what I changed.

| Date | Step | Entry |
| ---- | ---- | ----- |
| 2026-10-22 | 0 | Repo scaffolding (README, .gitignore, package.json as ESM, .nvmrc, .env.example, capstone.yaml, CLAUDE.md). Claude wrote the boilerplate; `npm init` defaulted to ISC + CommonJS and was corrected to MIT + `"type": "module"`. |
| 2026-10-22 | 1 | `docs/DESIGN.md` written section by section in discussion; Claude drafted the text from the agreed answers. My decisions: cascade on widget delete, `public_id` in owner URLs too, 90-day IP retention enforced by a pg-boss job, owners see geo but never IP. Corrected along the way: I had listed CORS as server protection (it protects browsers), linked sequential ids to SQL injection (that is parameterization), and said the limiter needs the stored IP (it uses the live one). |
