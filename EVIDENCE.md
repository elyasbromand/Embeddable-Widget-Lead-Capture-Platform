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

Step 3 (2026-10-31). Every `/api/widgets` route sits behind `requireAuth`, which runs before body
parsing. Demo tenants from `npm run seed` (password `demo-password-123`); tokens shortened.

```
$ curl localhost:3000/api/widgets
{"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}
-> HTTP 401

$ curl localhost:3000/api/widgets -H "Authorization: Bearer abc.def.ghi"
{"error":{"code":"UNAUTHORIZED","message":"Invalid or expired token"}}
-> HTTP 401
```

Auth itself (`/auth/register`, `/auth/login`):

```
$ register alice                          -> HTTP 201  {"user":{"id":"bcf25b3f-…","email":"alice@example.com"},"token":"eyJ…"}
$ register ' ALICE@Example.com ' again    -> HTTP 409  {"error":{"code":"CONFLICT","message":"Email is already registered"}}
$ login correct password (Alice@…)        -> HTTP 200  {"user":{…},"token":"eyJ…"}
$ login wrong password                    -> HTTP 401  {"error":{"code":"UNAUTHORIZED","message":"Invalid email or password"}}
$ login unknown email                     -> HTTP 401  {"error":{"code":"UNAUTHORIZED","message":"Invalid email or password"}}
$ malformed JSON                          -> HTTP 400  {"error":{"code":"BAD_REQUEST","message":"Malformed JSON body"}}
$ extra key role                          -> HTTP 422  {"error":{"code":"VALIDATION_FAILED",…,"details":[{"path":"","message":"Unrecognized key: \"role\""}]}}
$ oversized body (11kb)                   -> HTTP 413  {"error":{"code":"PAYLOAD_TOO_LARGE","message":"Request body is too large"}}

$ timing: 5x wrong password vs 5x unknown email (seconds)   # DUMMY_HASH: no account-existence leak
wrong-pw 0.040862   unknown-email 0.040859
wrong-pw 0.043862   unknown-email 0.040942
wrong-pw 0.041625   unknown-email 0.048720
wrong-pw 0.043709   unknown-email 0.050217
wrong-pw 0.056211   unknown-email 0.042682
```

Widget CRUD as the owner (tenant A):

```
$ A: POST new widget (no display)
{"id":"PJRbypyn6oN6","type":"contact","title":"Temp","description":null,"buttonText":"Go","fields":[{"name":"email","type":"email","label":"Email","required":false}],"display":{},…}
-> DELETE own: HTTP 204
-> DELETE again: HTTP 404

$ A: PATCH title only            -> HTTP 200  "title":"Monthly newsletter","description":"One email a month, no spam."   # description kept
$ A: PATCH {"description":null}  -> HTTP 200  "description":null                                                       # cleared
$ A: PATCH {} (schema test)      -> [": Provide at least one field to update"]
```

Known gap: `Content-Type: text/plain` currently gives 422, not 415. Planned for Step 5.

### 2. Tenant A cannot read or change tenant B's widgets or submissions (Steps 3, 11)

Step 3 (2026-10-31): curl proof. Tenant A owns `lvuvcZeFr-42`, tenant B owns `cqaxksTr2jOc`.
Every query in `src/repositories/widgetsRepository.js` filters `WHERE owner_id = $n AND public_id = $m`.

```
$ A: GET B's widget cqaxksTr2jOc
{"error":{"code":"NOT_FOUND","message":"Widget not found"}}
-> HTTP 404

$ A: GET a widget id that does not exist
{"error":{"code":"NOT_FOUND","message":"Widget not found"}}
-> HTTP 404

$ A: PATCH B's widget  {"title":"pwned"}
{"error":{"code":"NOT_FOUND","message":"Widget not found"}}
-> HTTP 404

$ A: DELETE B's widget
{"error":{"code":"NOT_FOUND","message":"Widget not found"}}
-> HTTP 404

$ A: list (only A's widgets)
[{"id":"lvuvcZeFr-42","type":"signup","title":"Monthly newsletter",…}]
-> HTTP 200

$ B: GET own widget afterwards (unchanged)
{"id":"cqaxksTr2jOc","type":"contact","title":"Contact us","description":null,"buttonText":"Send",…}
-> HTTP 200

$ psql: widgets by owner
        email         |  public_id   |       title
----------------------+--------------+--------------------
 tenant-a@example.com | lvuvcZeFr-42 | Monthly newsletter
 tenant-b@example.com | cqaxksTr2jOc | Contact us
(2 rows)
```

B's widget and a non-existent id give the same 404 body. _Pending (Step 11): automated test name and output; submissions isolation (Step 10)._

### 3. Embed snippet generated per widget (Step 4)

Step 4 (2026-11-04): the snippet is derived in `widgetsService.addSnippet` from `PUBLIC_BASE_URL`
and the public id (not stored). Also returned by list, get and update.

```
$ curl -s -X POST http://localhost:3000/api/widgets -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"type":"contact","title":"Gate 4 widget","buttonText":"Send","fields":[{"name":"email","type":"email","label":"Email","required":true}]}'
{"id":"yzDrs08dptWD","type":"contact","title":"Gate 4 widget","description":null,"buttonText":"Send","fields":[{"name":"email","type":"email","label":"Email","required":true}],"display":{},"createdAt":"2026-11-03T23:21:17.207Z","updatedAt":"2026-11-03T23:21:17.207Z","snippet":"<script src=\"http://localhost:3000/widget.js?id=yzDrs08dptWD\"></script>"}
HTTP 201
```

### 4. Public config endpoint: small payload, correct cache headers (Step 4)

Step 4 (2026-11-04): `GET /widgets/:id/config`. 336 bytes, only the fields the form needs (no
`owner_id`, no internal uuid, no timestamps). CORS `*` without credentials, also on 304 and 404.

```
$ curl -s http://localhost:3000/widgets/lvuvcZeFr-42/config
{"id":"lvuvcZeFr-42","type":"signup","title":"Monthly newsletter","description":"One email a month, no spam.","buttonText":"Subscribe","fields":[{"name":"email","type":"email","label":"Email","required":true},{"name":"first_name","type":"text","label":"First name","required":false}],"display":{"theme":"light","accentColor":"#2563eb"}}

$ curl -I -H "Origin: http://localhost:5500" http://localhost:3000/widgets/lvuvcZeFr-42/config
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=60
Content-Type: application/json; charset=utf-8
Content-Length: 336
ETag: W/"150-nRsB6Bp169R+uLL2PjGolYXc74U"

$ curl -I -H 'If-None-Match: W/"150-nRsB6Bp169R+uLL2PjGolYXc74U"' http://localhost:3000/widgets/lvuvcZeFr-42/config
HTTP/1.1 304 Not Modified
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=60
ETag: W/"150-nRsB6Bp169R+uLL2PjGolYXc74U"

$ curl -i -H "Origin: http://localhost:5500" http://localhost:3000/widgets/does-not-exist/config
HTTP/1.1 404 Not Found
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=10
Content-Type: application/json; charset=utf-8
Content-Length: 59
{"error":{"code":"NOT_FOUND","message":"Widget not found"}}
```

The owner API gets no CORS header (`curl -i -H "Origin: http://localhost:5500" /api/widgets` →
`401`, no `Access-Control-*` line), because the public router is mounted at `/widgets` only.

The ETag follows the content, so an owner's edit is not hidden behind a stale 304:

```
ETag before edit: W/"150-nRsB6Bp169R+uLL2PjGolYXc74U"
PATCH /api/widgets/lvuvcZeFr-42 {"title":"Monthly newsletter (edited)"}
ETag after edit:  W/"159-+cVHkX6acS2zta/DUHKaacEfnRU"
old ETag after edit → 200 (full body, not 304)
title restored → ETag back to W/"150-nRsB6Bp169R+uLL2PjGolYXc74U"
```

### 5. Widget JS served as a versioned bundle (Step 4)

Step 4 (2026-11-04): `npm run build:widget` (esbuild) writes `dist/widget.<content-hash>.js` and
`dist/manifest.json`; the loader reads the manifest at boot.

```
$ npm run build:widget
built dist/widget.6SJVSAE7.js (270 bytes)

$ curl -I "http://localhost:3000/widget.js?id=lvuvcZeFr-42"
HTTP/1.1 200 OK
Cache-Control: public, max-age=300
Content-Type: text/javascript; charset=utf-8
Content-Length: 341

$ curl -s "http://localhost:3000/widget.js?id=lvuvcZeFr-42" | grep b.src
  b.src = "http://localhost:3000/widget.6SJVSAE7.js";

$ curl -I http://localhost:3000/widget.6SJVSAE7.js
HTTP/1.1 200 OK
Cache-Control: public, max-age=31536000, immutable
Content-Type: text/javascript; charset=utf-8
Content-Length: 270
```

An unknown hash (`/widget.NOPE1234.js`) returns a JSON 404, and `/manifest.json` is not served (404).

The chain runs in a real browser: headless Chrome on a `file://` page holding only the snippet
(`chrome --headless=new --virtual-time-budget=5000 --dump-dom embed-test.html`). The loader added
the bundle tag, and the stub bundle rendered (the real form is Step 9):

```
<script src="http://localhost:3000/widget.js?id=lvuvcZeFr-42"></script><script
src="http://localhost:3000/widget.6SJVSAE7.js" async="" data-widget-id="lvuvcZeFr-42"></script><div>Widget
lvuvcZeFr-42 loaded (bundle stub; the form arrives in Step 9).</div>
```

### 6. Widget renders on a different origin (Step 9)

_Pending: browser console and page on :5500 calling the API on :3000._

### 7. Cross-origin submit works; preflight handled (Step 5)

Step 5 (2026-11-05): preflight by curl. A 204 with no body; the middleware ends the request before the JSON parser.

```
$ curl -i -X OPTIONS localhost:3000/submissions -H "Origin: http://localhost:5500" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,idempotency-key"
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Idempotency-Key
Access-Control-Max-Age: 7200
```

_Pending (Step 9): a real browser POST from the second origin, with the `OPTIONS` row visible in DevTools._

### 8. Malformed and oversized payloads rejected with 4xx JSON — Probe 2 (Step 5)

Step 5 (2026-11-05). Each error keeps the envelope and the CORS headers, and no bad request added a row. A malformed `widgetId` gets the same 404 as an unknown one.

```
$ curl -i -X POST localhost:3000/submissions -H "Origin: http://localhost:5500" ...   # malformed JSON: {bad
HTTP/1.1 400 Bad Request
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Idempotency-Key
Access-Control-Max-Age: 7200
{"error":{"code":"BAD_REQUEST","message":"Malformed JSON body"}}
$ curl -i -X POST localhost:3000/submissions -H "Origin: http://localhost:5500" ...   # 11 kB body
HTTP/1.1 413 Payload Too Large
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Idempotency-Key
Access-Control-Max-Age: 7200
{"error":{"code":"PAYLOAD_TOO_LARGE","message":"Request body is too large"}}
$ curl -i -X POST localhost:3000/submissions -H "Origin: http://localhost:5500" ...   # Content-Type: text/plain
HTTP/1.1 415 Unsupported Media Type
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Idempotency-Key
Access-Control-Max-Age: 7200
{"error":{"code":"UNSUPPORTED_MEDIA_TYPE","message":"Content-Type must be application/json"}}
$ curl -i -X POST localhost:3000/submissions -H "Origin: http://localhost:5500" ...   # bad email + unknown field
HTTP/1.1 422 Unprocessable Entity
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Idempotency-Key
Access-Control-Max-Age: 7200
{"error":{"code":"VALIDATION_FAILED","message":"Request validation failed","details":[{"path":"email","message":"Invalid email address"},{"path":"","message":"Unrecognized key: \"hack\""}]}}
$ curl -i -X POST localhost:3000/submissions -H "Origin: http://localhost:5500" ...   # unknown widget
HTTP/1.1 404 Not Found
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Idempotency-Key
Access-Control-Max-Age: 7200
{"error":{"code":"NOT_FOUND","message":"Widget not found"}}
$ curl -i -X POST localhost:3000/submissions -H "Origin: http://localhost:5500" ...   # malformed widgetId
HTTP/1.1 404 Not Found
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Idempotency-Key
Access-Control-Max-Age: 7200
{"error":{"code":"NOT_FOUND","message":"Widget not found"}}
rows before bad requests: 20, after: 20
```

### 9. Valid submissions stored and linked to the right widget and tenant — Probe 1 (Steps 5, 10)

Step 5 (2026-11-05): valid POSTs for both tenants, then the stored rows. `owner_id` comes from the widget row. `geo` is empty until Step 7.

```
$ curl -i -X POST localhost:3000/submissions -H "Origin: http://localhost:5500" -H "Content-Type: application/json" --data-binary @valid-a.json   # {"widgetId":"lvuvcZeFr-42","fields":{"email":"gate5@example.com","first_name":"Gate Five"}}
HTTP/1.1 201 Created
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Idempotency-Key
Access-Control-Max-Age: 7200
{"id":"b8d8ebc2-d05f-4cae-95b8-87027d427be6","createdAt":"2026-11-05T11:40:08.725Z"}
$ curl -i -X POST ... --data-binary @valid-b.json   # tenant B widget cqaxksTr2jOc
HTTP/1.1 201 Created
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Idempotency-Key
Access-Control-Max-Age: 7200
{"id":"22e3df60-6c14-4e8a-b639-bd449c4a7115","createdAt":"2026-11-05T11:40:08.819Z"}
```

```
widgets=# select w.public_id as widget, u.email as owner, s.owner_id = w.owner_id as owner_matches, s.ip, s.data ...
widget    |        owner         | owner_matches | ip  |                                    data                                    
--------------+----------------------+---------------+-----+----------------------------------------------------------------------------
 lvuvcZeFr-42 | tenant-a@example.com | t             | ::1 | {"email": "gate5@example.com", "first_name": "Gate Five"}
 cqaxksTr2jOc | tenant-b@example.com | t             | ::1 | {"name": "Gate Five B", "email": "gate5b@example.com", "message": "hello"}
(2 rows)
```

_Pending (Step 10): the same row through the dashboard API._

### 10. Burst gets 429 and normal traffic still works — Probe 3 (Step 6)

Step 6 (2026-11-14): `node scripts/attack.js` against `node --env-file=.env src/server.js`. 30 parallel
valid POSTs from one IP; the per-IP limit is 10/min. The script waits for `Retry-After`, then sends one
normal request.

```
$ node scripts/attack.js
Burst: 30 parallel POST http://localhost:3000/submissions (widget lvuvcZeFr-42)
Done in 358 ms. Status counts: { '201': 10, '429': 20 }
Sample 429:
  Retry-After: 60
  RateLimit:   "10-in-1min"; r=0; t=60
  Body:        {"error":{"code":"RATE_LIMITED","message":"Too many requests, try again later"}}
Waiting 61 s for the window to reset...
Normal request after the window: 201 {"id":"b913cd09-b137-4469-8ffe-e0ec8b0597f1","createdAt":"2026-11-13T23:41:04.860Z"}
PASS
exit code: 0
```

The limiter runs before body parsing and before the database. Order in `src/http/routes/submissions.js`:
CORS/preflight → per-IP (10/min) → 415 → `express.json` (10kb) → per-widget (100/min) → validate → DB.
Also checked (2026-11-14, in-process probe): after the per-IP limit, a `text/plain` POST also gets 429,
a preflight still gets 204, and the 429 carries `Access-Control-Allow-Origin: *`. The per-widget limiter
alone: 105 × one real id → 100 × 201, 5 × 429; 300 × made-up 9kb ids share one bucket → 100 × 201, 200 × 429.

### 11. One spam control blocks a spammer — Probe 6 (Step 6)

Step 6 (2026-11-14): a POST with the hidden `website` field filled. The bot gets the same 201 shape as
a real submission; no row is stored; one log line counts the hit (no IP, no field value).

```
$ psql: rows before
 rows
------
   39
(1 row)

$ curl -i -X POST http://localhost:3000/submissions --data-binary @honeypot.json
  body: {"widgetId":"lvuvcZeFr-42","fields":{"email":"bot@example.com"},"website":"http://spam.example"}
HTTP/1.1 201 Created
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Idempotency-Key
Access-Control-Max-Age: 7200
RateLimit: "10-in-1min"; r=9; t=60
RateLimit: "100-in-1min"; r=99; t=60
Content-Type: application/json; charset=utf-8

{"id":"d26981d8-69f4-495a-90aa-bdf1cc8cec6b","createdAt":"2026-11-13T23:41:33.867Z"}
$ psql: rows after
 rows
------
   39
(1 row)

$ server log (honeypot line)
{"level":30,"time":1794613293866,"pid":31456,"hostname":"DESKTOP-742LDT7","event":"honeypot_hit","widgetId":"lvuvcZeFr-42","msg":"Honeypot filled; submission dropped"}
```

The query was `SELECT count(*) AS rows FROM submissions s JOIN widgets w ON w.id = s.widget_id WHERE w.public_id = 'lvuvcZeFr-42';`.
The check runs after validation, so a bot gets the same 404/422 as anyone else. Every filled value is
caught, never a 422 (probe against the DB, rows added per request):

```
1. real visitor, website ""              201 rows +1
2. real visitor, no website key          201 rows +1
3. bot: website "http://spam"            201 rows +0
4. bot: website 300 chars                201 rows +0
5. bot: website 123                      201 rows +0
6. bot: website "   "                    201 rows +0
7. bot: website null                     201 rows +0
8. bot + invalid email (expect 422)      422 rows +0
9. bot + unknown widget (expect 404)     404 rows +0
```

### 12. Provider A down, provider B enriches — Probe 4 (Step 7)

Unit tests: providers are injected mocks (`src/integrations/geo/mockProvider.js`), no network.
`npm test` (verbose reporter), 2026-11-18:

```
 ✓ test/geoService.test.js > geoService.lookup > falls back to B when A is down
 ✓ test/geoService.test.js > geoService.lookup > uses A when A is up and never calls B
 ✓ test/geoService.test.js > geoService.lookup > times out a slow A and falls back to B
 ✓ test/geoService.test.js > geoService.lookup > gives each provider its own timeout budget (one shared signal would fail B too)
 ✓ test/geoService.test.js > geoService.lookup > logs each failure as a warning with the provider name and reason, never the IP
 Test Files  4 passed (4)
      Tests  43 passed (43)
```

Live server, real providers. `GEO_TEST_IP=8.8.8.8` (dev override: locally the visitor is `::1`),
`GEO_FORCE_DOWN` makes the named provider throw without calling the network. Fresh server per run.

```
=== Baseline: both providers up  (GEO_FORCE_DOWN='')
$ curl -i -X POST localhost:3000/submissions -H 'Origin: http://localhost:5500' -H 'Content-Type: application/json' \
    --data-binary '{"widgetId":"lvuvcZeFr-42","fields":{"email":"probe4-up@example.com","first_name":"Probe4"}}'
HTTP/1.1 201 Created
Access-Control-Allow-Origin: *
{"id":"115cea3a-dca0-4134-aaed-80cadae09d05","createdAt":"2026-11-18T11:48:06.965Z"}
[HTTP 201 in 0.651892s]
server log (geo lines): none

=== Probe 4a: provider A down  (GEO_FORCE_DOWN='ip-api.com')
$ curl -i -X POST ... '{"widgetId":"lvuvcZeFr-42","fields":{"email":"probe4-a-down@example.com",...}}'
HTTP/1.1 201 Created
Access-Control-Allow-Origin: *
{"id":"a588f1b8-51ad-4c28-8941-7ec966cf526c","createdAt":"2026-11-18T11:48:10.709Z"}
[HTTP 201 in 1.105510s]
server log (geo lines):
  {"level":40,...,"provider":"ip-api.com","error":"ip-api.com forced down (GEO_FORCE_DOWN)","msg":"Geo provider failed"}
  lines in log containing an IP: 0
```

Stored rows (A's answer is Ashburn, B's is Mountain View, so 4a was enriched by B):

```
            email             |    widget    |                                geo                                 | geo_is_sql_null
------------------------------+--------------+--------------------------------------------------------------------+-----------------
 probe4-up@example.com        | lvuvcZeFr-42 | {"city": "Ashburn", "region": "Virginia", "country": "US"}         | f
 probe4-a-down@example.com    | lvuvcZeFr-42 | {"city": "Mountain View", "region": "California", "country": "US"} | f
```

### 13. All providers down, submission still stored without geo — Probe 4 (Step 7)

Unit test (written first, before `geoService` existed):

```
 ✓ test/geoService.test.js > geoService.lookup > returns null (and does not throw) when every provider is down
```

Live server, both forced down:

```
=== Probe 4b: both providers down  (GEO_FORCE_DOWN='ip-api.com,ipapi.co')
$ curl -i -X POST ... '{"widgetId":"lvuvcZeFr-42","fields":{"email":"probe4-both-down@example.com",...}}'
HTTP/1.1 201 Created
Access-Control-Allow-Origin: *
{"id":"95e1f0a7-dc89-4c5f-8034-af73f1e5b69c","createdAt":"2026-11-18T11:48:13.404Z"}
[HTTP 201 in 0.055043s]
server log (geo lines):
  {"level":40,...,"provider":"ip-api.com","error":"ip-api.com forced down (GEO_FORCE_DOWN)","msg":"Geo provider failed"}
  {"level":40,...,"provider":"ipapi.co","error":"ipapi.co forced down (GEO_FORCE_DOWN)","msg":"Geo provider failed"}
  lines in log containing an IP: 0
```

Stored row: `geo` is SQL `NULL` (not the JSON value `null`), so `WHERE geo IS NULL` finds it:

```
            email             |    widget    | geo | geo_is_sql_null
------------------------------+--------------+-----+-----------------
 probe4-both-down@example.com | lvuvcZeFr-42 |     | t
```

Private visitor IP without the override (`GEO_TEST_IP` empty, visitor `::1`): `201 in 0.045717s`, no provider
called, row `b0ef9116-…` stored with `ip = ::1`, `geo IS NULL = t`.

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

Step 3: auth and widgets follow the same pattern.

```
src/http/routes/auth.js     -> zod parse -> authService.register/login  -> usersRepository (SQL)
src/http/routes/widgets.js  -> requireAuth -> zod parse -> widgetsService -> widgetsRepository (SQL)
```

Services throw `AppError`s (`ConflictError`, `UnauthorizedError`, `NotFoundError`) and never touch
`req`/`res`; repositories return rows or `null` and never decide HTTP status.

### S2. Validation at the boundary, never a 500 for bad input (Steps 2, 5)

Step 2: one error envelope from the central handler (`src/http/middleware/errorHandler.js`).
Body-parser errors (400/413/415) are mapped there and exercised in Step 5 (see row 8).

Step 5 (2026-11-05): 32 POSTs of valid and hostile input against a fresh server gave 0 failures and 0 logged 500s. Besides row 8 they covered: `null` and `[]` bodies, no body, `fields` as array or null, an extra `owner_id` key, `__proto__`, NUL and a lone surrogate in a value (422), NUL and SQL-ish ids (404), a gzip bomb (413), corrupt gzip (400), `charset=latin1` and an unknown encoding (415). An `X-Forwarded-For: 1.2.3.4` request was stored as `::1`.

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

Step 3: owner-scoped widget queries; the cross-tenant proof is under row 2 above. The seed is safe to rerun:

```
$ npm run seed   (run 1)
"email":"tenant-a@example.com","widgetId":"lvuvcZeFr-42","created":true
"email":"tenant-b@example.com","widgetId":"cqaxksTr2jOc","created":true

$ npm run seed   (run 2)
"email":"tenant-a@example.com","widgetId":"lvuvcZeFr-42","created":false
"email":"tenant-b@example.com","widgetId":"cqaxksTr2jOc","created":false
```

_Pending (Step 10): EXPLAIN on dashboard queries._

### S5. Idempotency where it matters (Steps 6, 8)

Step 6 (2026-11-14): `Idempotency-Key` request header (a UUID, optional). The insert uses
`ON CONFLICT (widget_id, idempotency_key) DO NOTHING` on the unique index from the submissions
migration; a retry gets the original row back. Probe against the DB (`rows` = rows with that key):

```
1. same key twice        201 201 same id: true same createdAt: true rows: 1
2. different key         201 new id: true rows: 1
3. no key twice          201 201 different ids: true rows added: 2
4. 5 parallel same key   201,201,201,201,201 distinct ids: 1 rows: 1
   stored email for k1: visitor@example.com
```

Case 1's retry sent a different email; the original row is kept and returned. The header is validated
before the body (zod `z.uuid()`), so a bad key can never reach the `text` column:

```
4. not a uuid              422 {"error":{"code":"VALIDATION_FAILED","message":"Request validation failed","details":[{"path":"Idempotency-Key","message":"Invalid UUID"}]}}
5. empty header            422 (same)
6. 2000-char header        422 (same)
7. key in body instead     422 ... "Unrecognized key: \"idempotencyKey\""
```

_Pending (Step 8): job `singletonKey`, one email per submission._

### S6. Secrets clean (Steps 0, 2, 12)

Step 2: config validated at boot (`src/config/index.js`); pino redacts `authorization`, `cookie`,
`password`, `token` and `err.client`. The last path was added after a real log line from a dropped
Postgres connection contained the pg client object (connection params and its cancel `secretKey`).
After the fix, with Postgres stopped and restarted:

```
$ grep -c -E "secretKey|connectionParameters" server.log
0
```

Step 3: passwords stored as Argon2id (OWASP parameters inside the PHC string); `JWT_SECRET` must be
at least 32 characters or the app refuses to boot; no password or hash in the server log.

```
$ psql -c "SELECT email, left(password_hash, 30) || '...' FROM users;"
 alice@example.com | $argon2id$v=19$m=19456,p=1,t=2...

$ grep -ciE 'correct-horse|argon2id|password_hash' server.log
0
```

_Pending (Step 12): gitleaks scan output._

### S7. Cost tracking, if AI is used (Step 12)

_Pending: README statement that the product uses no AI._
