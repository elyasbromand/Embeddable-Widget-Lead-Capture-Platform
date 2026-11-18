# Embeddable Widget & Lead-Capture Platform

Owners create form widgets (signup, contact, CTA), paste one `<script>` line on their site, and
visitor submissions land in a hardened, tenant-isolated backend with geo enrichment, abuse
protection and background email confirmation.

> Work in progress. Built step by step following [docs/PLAN.md](docs/PLAN.md).

## Architecture

_TODO (Step 12): diagram of the three request paths._

## Setup

_TODO (Step 12): exact run and seed commands._

Requires Node 22+ (see `.nvmrc`) and Docker.

## API

_TODO (Step 12): endpoint table._

## Limitations

_Collected as they come up; finished in Step 12._

- **Rate limits are in memory.** Counts reset when the server restarts and are not shared between
  processes, so two instances would each allow the full limit. The real fix is a shared store
  (Postgres or Redis).
- **Per-IP limit and shared networks.** Visitors behind one IP (an office, a mobile carrier) share
  the 10/min limit.
- **Per-widget limit can be used against a tenant.** An attacker with many IPs can use up a widget's
  100/min and block real visitors to that widget for the rest of the minute.
- **Geo is an estimate, and the free tiers are small.** The two providers disagree for the same IP
  (8.8.8.8: Ashburn vs Mountain View). ip-api.com's free tier is HTTP only (the visitor IP crosses the
  network unencrypted) and allows 45 lookups a minute; ipapi.co allows about 1,000 a day. Above that
  they answer 429, the chain falls through, and rows are stored with `geo = NULL`. There is no
  per-IP cache and no backfill job yet (both optional in the plan).
- **Geo adds latency to the submission.** The lookup runs before the insert: about 0.3–1 s normally,
  up to 1.5 s per provider when one hangs (3 s worst case with both).
- **Made-up widget ids.** A random id in the correct format gets its own per-widget key and reaches a
  database lookup (then 404). Only the per-IP limit caps this.
- **Idempotency keeps the first version.** A retry with the same key returns the original submission,
  even if the data changed, so the widget makes a new key when the form changes.

## AI use

The product itself uses no AI. AI assistance during development is logged in [BUILDLOG.md](BUILDLOG.md).

## License

[MIT](LICENSE)
