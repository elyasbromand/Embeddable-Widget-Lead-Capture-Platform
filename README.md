# Embeddable Widget & Lead-Capture Platform

Owners create form widgets (signup, contact, CTA), paste one `<script>` line on their site, and
visitor submissions land in a hardened, tenant-isolated backend with geo enrichment, abuse
protection and background email confirmation.

> Work in progress. Built step by step following [docs/PLAN.md](docs/PLAN.md).

## Architecture

_TODO (Step 12): diagram of the three request paths._

### Which failures reach the visitor (`POST /submissions`)

```
  propagate to the visitor (4xx, request stops)      swallowed and logged (visitor still gets 201)
  ─────────────────────────────────────────────      ─────────────────────────────────────────────
  429  per-IP / per-widget rate limit                 geo: both providers down or slow → geo = NULL
  415  not JSON                                       enqueue: pg-boss unavailable → error log line
  400  malformed JSON      413  body over 10 kB       email: SMTP down → worker retries 3x with
  422  invalid fields or Idempotency-Key                     backoff, then dead-letter queue + ALERT
  404  unknown widget                                 honeypot hit → fake 201, nothing stored
  500  only for our own bugs / DB down (no internals)
```

The rule: a failure the visitor can fix, or that protects us, is returned. A failure in an optional
side effect (geo, email) is never allowed to lose or reject a lead that was otherwise valid.

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
  per-IP cache and no backfill job yet (both optional in the plan). This happened during testing:
  with ip-api.com forced down, ipapi.co timed out and then answered 429, so a row was stored without geo.
- **Geo adds latency to the submission.** The lookup runs before the insert: about 0.3–1 s normally,
  up to 1.5 s per provider when one hangs (3 s worst case with both).
- **A lost enqueue is only logged.** The insert and the job are two separate writes. If pg-boss is
  unavailable at that moment, the lead is stored but no email is queued, and only an error log line
  records it. Sending the job in the same transaction as the insert (or a backfill for submissions
  without a job) would close that gap.
- **The alert is a log line.** `ALERT` is written to the worker log; nothing pages a person. A real
  deployment would ship that line to an alerting tool.
- **Made-up widget ids.** A random id in the correct format gets its own per-widget key and reaches a
  database lookup (then 404). Only the per-IP limit caps this.
- **Idempotency keeps the first version.** A retry with the same key returns the original submission,
  even if the data changed, so the widget makes a new key when the form changes.

## AI use

The product itself uses no AI. AI assistance during development is logged in [BUILDLOG.md](BUILDLOG.md).

## License

[MIT](LICENSE)
