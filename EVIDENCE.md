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

B's widget and a non-existent id give the same 404 body.

Automated (Step 11): `test/api/tenantIsolation.test.js` has 14 tests: 401 without or with a forged token; for widgets, B's list, read, PATCH and DELETE of A's widget (404, same body as a missing id, A's widget unchanged); for submissions, B's list, filter, stats and no IP returned. See "Automated suite (Step 11)" below for the full output.

Step 10 (2026-11-20): submissions are isolated too. Every query in `src/repositories/dashboardRepository.js`
is scoped by `owner_id = $1`. Tenant B sees only its own 4 rows. Filtering by A's widget gives the same
404 as an unknown widget:

```
B list: 200 4 rows; contains browser row: false ; widgets: cqaxksTr2jOc
B filters by A's widget: 404 {"error":{"code":"NOT_FOUND","message":"Widget not found"}}
B stats: 200 {"totals":{"total":4,"last24h":0},"perWidget":[{"widgetId":"cqaxksTr2jOc","title":"Contact us","count":4}], ...}
```

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

Step 9 (2026-11-18/19). `npm run test-site` serves `test-site/index.html` on `http://localhost:5500`.
That page has only the one-line snippet, plus deliberately hostile CSS: crimson `!important` text and
Comic Sans 40px on every element. The API runs on `http://localhost:3000`.

Seen in the browser (Chrome DevTools, Network tab). The screenshots were checked during the session
and not kept; this is a transcription:

- `widget.js?id=lvuvcZeFr-42` → the loader, then `widget.TIEQGPRQ.js` (the current hashed bundle).
- `GET /widgets/lvuvcZeFr-42/config` → **200** with `Access-Control-Allow-Origin: *` and
  `Cache-Control: public, max-age=60`.
- The form ("Monthly newsletter", Email *, First name, Subscribe) renders in the widget's own fonts and
  colours, while the page text around it is crimson serif. The host page's CSS does not reach inside
  the shadow root.

No HTML sinks in the widget source. The only matches are the two comments that forbid `innerHTML`:

```
$ grep -nE "innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function" widget/src/index.js
2://  - never put tenant- or visitor-written text into HTML (textContent only, no innerHTML)
42:  if (text != null) node.textContent = text; // never innerHTML: "<img onerror=...>" stays text
$ grep -c textContent widget/src/index.js
6
```

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

Step 9 (2026-11-18/19): a real browser on `http://localhost:5500` submitting through the widget.
DevTools Network tab, transcribed from screenshots checked during the session (not kept):

| Action in the widget | Request | Status | What the widget showed |
| --- | --- | --- | --- |
| Submit a valid form | `OPTIONS /submissions` (preflight) | **204**, all four `Access-Control-*` headers | |
| | `POST /submissions` | **201**, `Access-Control-Allow-Origin: *` | "Thanks! Your message was sent." |
| Submit `Email` as not-an-email | `POST /submissions` | **422** | "Invalid email address" under the Email field |
| Keep submitting past 10/min | `POST /submissions` | **429**, `Retry-After` | "Too many attempts. Please try again in 60 seconds." |

**Bug found by the 429 test.** `Retry-After` is not a CORS-safelisted response header, so the widget's
`response.headers.get("Retry-After")` returned `null`, and the message always fell back to 60.
DevTools showed the header because DevTools is not bound by CORS. The fix is
`Access-Control-Expose-Headers: Retry-After` in the submissions CORS middleware. After the fix, the same
test on 2026-11-19 showed **"Please try again in 32 seconds."**, with DevTools showing
`429 Too Many Requests` and `Access-Control-Expose-Headers: Retry-After`. The 32 is the time left
in the fixed 60 s window.

Preflight after the fix:

```
$ curl -s -i -X OPTIONS localhost:3000/submissions -H "Origin: http://localhost:5500" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,idempotency-key" | grep -E "^HTTP|^Access"
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Idempotency-Key
Access-Control-Expose-Headers: Retry-After
Access-Control-Max-Age: 7200
```

The first browser row in the database. The visitor's email is redacted here because it is a real
address. `has_key = t` means the widget sent its `Idempotency-Key`:

```
$ docker compose exec -T postgres psql -U app -d widgets -c "SELECT id, widget_id, regexp_replace(data->>'email','^(.).*@.*$','\1…@…') AS email, idempotency_key IS NOT NULL AS has_key, geo IS NULL AS geo_null, created_at FROM submissions WHERE created_at >= '2026-11-18 20:00+00' ORDER BY created_at"
                  id                  |              widget_id               | email | has_key | geo_null |          created_at
--------------------------------------+--------------------------------------+-------+---------+----------+-------------------------------
 ef3b8fec-55ad-4bfa-a73f-2fc462fd4cef | 55adb0cb-efd9-4bf4-9028-ba7626dd9b95 | e…@…  | t       | t        | 2026-11-18 20:33:27.233852+00
 ...
(28 rows)
```

18 of those 28 rows have a key, so they came from the widget. The 10 rows without a key came from
scripted requests. The first row's `geo` is NULL, which is the designed degradation. The later widget
rows have geo, through `GEO_TEST_IP`.

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

Automated (Step 11): `test/api/badPayloads.test.js`. 9 cases (400, 413, 415, 422 ×4, 404 ×2), each checking the envelope, CORS and an unchanged row count. Plus "never echoes the rejected value back in a 422". See "Automated suite (Step 11)" below for the full output.

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

Step 10 (2026-11-20): the Step 9 browser row (`ef3b8fec-…`, sent from :5500) through the owner API.
A script logged in as each demo tenant and called the endpoints:

```
A walk (GET /api/submissions?limit=7, following nextCursor): 91 rows over 13 pages, duplicates 0, newest-first true
browser row (Step 9) in A's list: true
B list: 200 4 rows; contains browser row: false ; widgets: cqaxksTr2jOc
A page 1 item keys: id,widgetId,data,geo,createdAt      (no ip, no owner_id, no internal widget uuid)
```

Automated (Step 11): `test/api/tenantIsolation.test.js` > "Probe 1: A's submission appears in A's list, linked to A's widget", and `test/api/dashboard.test.js`. See "Automated suite (Step 11)" below for the full output.

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

Automated (Step 11): `test/api/rateLimit.test.js`. 3 per 1.5 s in tests (same mechanism as 10/min), a fresh app per test, recovery after 1.6 s. Also covered: per widget, junk requests counted, preflights not counted. See "Automated suite (Step 11)" below for the full output.

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

Automated (Step 11): `test/api/honeypot.test.js` > "Probe 6: honeypot" (3 tests: same 201 shape, no row, no email, no geo call, logged without the value). See "Automated suite (Step 11)" below for the full output.

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

Automated (Step 11): `test/api/geoFallback.test.js`, end to end with mock providers injected: A up, A down → B, A hangs → timeout → B, and the stored row checked in the database. No network. See "Automated suite (Step 11)" below for the full output.

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

Automated (Step 11): `test/api/geoFallback.test.js` > "both down: still 201, the row is stored with geo NULL, and the failures are logged without the IP". See "Automated suite (Step 11)" below for the full output.

### 14. Failing email or webhook does not block the submission — Probe 5 (Step 8)

API started normally; worker started with `FORCE_EMAIL_FAILURE=true` (the mailer throws on every send).
Mailpit inbox emptied first. 2026-11-18:

```
=== Probe 5: worker started with FORCE_EMAIL_FAILURE=true (API unchanged)
$ curl -i -X POST localhost:3000/submissions -H 'Origin: http://localhost:5500' -H 'Content-Type: application/json' \
    --data-binary '{"widgetId":"lvuvcZeFr-42","fields":{"email":"probe5@example.com","first_name":"Probe5"}}'
HTTP/1.1 201 Created
Access-Control-Allow-Origin: *
{"id":"4780cbe7-aa8a-44e3-8592-359221ffcf1a","createdAt":"2026-11-18T14:25:00.125Z"}
[HTTP 201 in 0.683323s]
```

The row is stored:

```
                  id                  |       email        |          created_at
--------------------------------------+--------------------+-------------------------------
 4780cbe7-aa8a-44e3-8592-359221ffcf1a | probe5@example.com | 2026-11-18 14:25:00.125404+00
```

API error lines during the run: `0`. Mailpit total: `0` (nothing was sent).
Retries, dead letter and alert: see S3.

Automated (Step 11): `test/api/emailFailure.test.js`. Queue down → 201 and row stored; real pg-boss with a failing email service → 4 attempts, job `failed`, ALERT. See "Automated suite (Step 11)" below for the full output.

### Phase 2 gate (brief): Steps 5–8 together

One sweep on 2026-11-18 19:08 (run tag `190820`), real providers, Mailpit emptied first. The API is restarted
between groups because the per-IP limit (10/min) is per process. `.env` has `GEO_TEST_IP=8.8.8.8`.

```
=== Part 1. Cross-origin POST with the test IP override (GEO_TEST_IP=8.8.8.8)
--- preflight
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Idempotency-Key
Access-Control-Max-Age: 7200
--- valid submission
valid, cross-origin                201  CORS ok  {"id":"9b88da36-7921-4fd6-9b13-65a8166c4088","createdAt":"2026-11-18T14:38:27.339Z"}

=== Probe 2. Bad input gets 4xx JSON with CORS, never 500
malformed JSON                     400  CORS ok  {"error":{"code":"BAD_REQUEST","message":"Malformed JSON body"}}
11 kB body                         413  CORS ok  {"error":{"code":"PAYLOAD_TOO_LARGE","message":"Request body is too large"}}
text/plain content type            415  CORS ok  {"error":{"code":"UNSUPPORTED_MEDIA_TYPE","message":"Content-Type must be application/json"}}
invalid email field                422  CORS ok  {"error":{"code":"VALIDATION_FAILED","message":"Request validation failed","details":[{"path":"email","message":"Invalid email address"}]}}
unknown widget                     404  CORS ok  {"error":{"code":"NOT_FOUND","message":"Widget not found"}}

=== Probe 6. Honeypot filled: fake 201, no row
honeypot website="http://spam"     201  CORS ok  {"id":"f219b1ae-a102-4832-b811-ae7154f27889","createdAt":"2026-11-18T14:38:28.531Z"}
rows before 52, after 52

=== Probe 3. Burst from one IP (scripts/attack.js, fresh API)
Burst: 30 parallel POST http://localhost:3000/submissions (widget lvuvcZeFr-42)
Done in 1773 ms. Status counts: { '201': 10, '429': 20 }
Sample 429:
  Retry-After: 60
  RateLimit:   "10-in-1min"; r=0; t=60
  Body:        {"error":{"code":"RATE_LIMITED","message":"Too many requests, try again later"}}
Waiting 61 s for the window to reset...
Normal request after the window: 201 {"id":"920f9a3b-0fa1-4445-9c92-620190b2a733","createdAt":"2026-11-18T14:39:35.603Z"}
PASS

=== Probe 4. Geo fallback (fresh API per run, GEO_TEST_IP=8.8.8.8)
A down (ip-api.com)                201  CORS ok  {"id":"c9c8b56b-91bd-4b28-b4cb-115397471802","createdAt":"2026-11-18T14:39:39.480Z"}
both down                          201  CORS ok  {"id":"720afe12-49cc-47f7-a068-e395ab2c4229","createdAt":"2026-11-18T14:39:41.879Z"}

=== Probe 5. Worker with FORCE_EMAIL_FAILURE=true
email forced to fail               201  CORS ok  {"id":"d610fced-e026-483a-bccb-bfc560e975a3","createdAt":"2026-11-18T14:39:54.567Z"}
  19:09:55  attempt 1  Confirmation email failed; will retry
  19:09:59  attempt 2  Confirmation email failed; will retry
  19:10:05  attempt 3  Confirmation email failed; will retry
  19:10:15  attempt 4  Confirmation email failed; will retry
  19:10:17             ALERT confirmation email gave up after all retries (submission d610fced-e026-483a-bccb-bfc560e975a3)

=== Stored rows for this run
              email               |                            geo                             | geo_null
----------------------------------+------------------------------------------------------------+----------
 gate-190820@example.com          | {"city": "Ashburn", "region": "Virginia", "country": "US"} | f
 gate-adown-190820@example.com    |                                                            | t
 gate-bothdown-190820@example.com |                                                            | t
 gate-mailfail-190820@example.com | {"city": "Ashburn", "region": "Virginia", "country": "US"} | f

=== Jobs for this run
              email               |         queue          |   state   | retry_count
----------------------------------+------------------------+-----------+-------------
 gate-190820@example.com          | confirmation-email     | completed |           0
 gate-adown-190820@example.com    | confirmation-email     | completed |           0
 gate-bothdown-190820@example.com | confirmation-email     | completed |           0
 gate-mailfail-190820@example.com | confirmation-email     | failed    |           3
 gate-mailfail-190820@example.com | confirmation-email-dlq | completed |           0

=== Mailpit
total: 14
  to gate-bothdown-190820@example.com
  to gate-adown-190820@example.com
  to gate-190820@example.com
  attack-*: 11   bot-*: 0   mailfail: 0
=== API logs: error-level lines (level 50) across all runs
count: 0
=== Raw IPs in any API or worker log line
0
```

**Probe 4a failed in this sweep, then passed on a rerun.** The "A down" row has `geo = NULL` because the
backup provider failed too. API log of that run:

```
{"level":40,"provider":"ip-api.com","error":"ip-api.com forced down (GEO_FORCE_DOWN)","msg":"Geo provider failed"}
{"level":40,"provider":"ipapi.co","error":"The operation was aborted due to timeout","msg":"Geo provider failed"}
```

ipapi.co took longer than the 1.5 s timeout, and a direct call right after returned `HTTP 429` (its free
tier throttles; it had been called many times that day). The pipeline behaved as designed (both failed →
`NULL`, still 201), but this run does not show B enriching. Rerun of 4a alone, fresh API, 19:10:57:

```
=== Probe 4a rerun 1 (GEO_FORCE_DOWN=ip-api.com) 19:10:57
{"id":"04d3278f-d2ac-4e0a-b550-b8b15f5e6cd6","createdAt":"2026-11-18T14:40:58.113Z"}  -> HTTP 201 in 0.978079s
  {"level":40,"provider":"ip-api.com","error":"ip-api.com forced down (GEO_FORCE_DOWN)","msg":"Geo provider failed"}
  stored geo: {"city": "Mountain View", "region": "California", "country": "US"}
```

Not in this gate: the browser POST from the :5500 page (Step 9, row 7) and the dashboard read (Step 10).

### 15. Owner dashboard: submissions and basic analytics (Step 10)

Step 10 (2026-11-20). Two endpoints:

- `GET /api/submissions?widgetId=&limit=&cursor=`: owner-scoped, newest first, with a keyset cursor.
- `GET /api/stats/overview?days=`: totals, per widget, per day and per country.

All counting is done in SQL (`src/repositories/dashboardRepository.js`).

Responses for tenant A (`days=7`) and the edge cases:

```
A stats: 200 {"totals":{"total":91,"last24h":0},
  "perWidget":[{"widgetId":"lvuvcZeFr-42","title":"Monthly newsletter","count":91},{"widgetId":"hDEem5q4z9Ea","title":"Snippet test","count":0},{"widgetId":"t9s7w0C136WC","title":"Snippet test","count":0},{"widgetId":"yzDrs08dptWD","title":"Gate 4 widget","count":0}],
  "perDay":{"days":7,"counts":[{"day":"2026-11-14","count":0},{"day":"2026-11-15","count":0},{"day":"2026-11-16","count":0},{"day":"2026-11-17","count":0},{"day":"2026-11-18","count":25},{"day":"2026-11-19","count":27},{"day":"2026-11-20","count":0}]},
  "byCountry":[{"country":"US","count":46},{"country":null,"count":45}]}
A page 1 (limit=2): 200, 2 items, nextCursor present
tampered cursor:  422 {"error":{"code":"VALIDATION_FAILED","message":"Request validation failed","details":[{"path":"cursor","message":"Invalid cursor"}]}}
no token:         401
days=0:           422
```

How to read these numbers:

- Widgets with no submissions are listed with 0, and so are days with none.
- Rows without geo are counted under `country: null`, so 46 + 45 = 91.
- `last24h` is 0 because the newest row is from 2026-11-19 12:27 UTC, more than 24 h before the run.

The stats match a hand-written SQL count:

```
$ psql -c "SELECT u.email AS owner, count(s.id) AS total, count(*) FILTER (WHERE s.created_at::date = '2026-11-18') AS nov18, count(*) FILTER (WHERE s.created_at::date = '2026-11-19') AS nov19, count(*) FILTER (WHERE s.geo->>'country' = 'US') AS us, count(*) FILTER (WHERE s.geo IS NULL) AS no_geo FROM users u LEFT JOIN submissions s ON s.owner_id = u.id WHERE u.email IN ('tenant-a@example.com','tenant-b@example.com') GROUP BY u.email ORDER BY 1"
        owner         | total | nov18 | nov19 | us | no_geo
----------------------+-------+-------+-------+----+--------
 tenant-a@example.com |    91 |    25 |    27 | 46 |     45
 tenant-b@example.com |     4 |     0 |     0 |  0 |      4
```

| | API A | SQL A | API B | SQL B |
| --- | --- | --- | --- | --- |
| total | 91 | 91 | 4 | 4 |
| 2026-11-18 / 2026-11-19 | 25 / 27 | 25 / 27 | 0 / 0 | 0 / 0 |
| US / no geo | 46 / 45 | 46 / 45 | 0 / 4 | 0 / 4 |

The `EXPLAIN` results and the one query fix are under S4.

Automated (Step 11): `test/api/dashboard.test.js`. The cursor walks 7 rows over 3 pages in exactly the SQL order; bad query values give 422; stats match a hand-written SQL count. See "Automated suite (Step 11)" below for the full output.

### 16. README with diagram, setup, API docs; required files present (Step 12)

_Pending: fresh-clone run from the README alone._

### Automated suite (Step 11)

Step 11 (2026-11-20). `npm test` is the single command.

- **Before the run:** `pretest` builds the widget. Vitest's `globalSetup` then **drops and recreates
  `widgets_test`** and runs every migration, so each run starts from a clean database. The dev
  database is never touched: `submissions` had 95 rows before the run and 95 after.
- **No network:** geo providers are mocks injected through `createApp({ submissionsService })`,
  and the email queue is a fake. The one exception is the retry test, which uses real pg-boss on
  the test database.
- **Not flaky:** each rate-limit test builds its own app, with fresh counters and small limits.

```
$ npm test
> pretest: npm run build:widget
built dist/widget.TIEQGPRQ.js (4595 bytes)
> node --env-file=.env node_modules/vitest/vitest.mjs run
 Test Files  12 passed (12)
      Tests  96 passed (96)
   Duration  29.65s
```

The same suite run twice more, back to back: `Tests  96 passed (96)` both times.

Per test (`vitest run --reporter=verbose`):

```
✓ test/api/emailFailure.test.js > Probe 5: email failure never reaches the visitor > when the queue itself is down, the visitor still gets 201, the row is stored, and the error is logged 248ms
✓ test/api/emailFailure.test.js > Probe 5: email failure never reaches the visitor > on success the job carries only the submission id (no personal data) 84ms
✓ test/api/emailFailure.test.js > emailService > sends a plain-text email to the widget's email field 1ms
✓ test/api/emailFailure.test.js > emailService > throws when the mailer fails, which is what makes pg-boss retry 1ms
✓ test/api/emailFailure.test.js > emailService > skips (no retry) when the submission is gone 1ms
✓ test/api/emailFailure.test.js > Probe 5: retries, then dead letter and ALERT (real pg-boss) > tries 4 times, marks the job failed, and raises one ALERT 4163ms
✓ test/api/rateLimit.test.js > Probe 3: rate limits > per IP: the 4th request in the window gets 429 with Retry-After and CORS, then it recovers 1694ms
✓ test/api/rateLimit.test.js > Probe 3: rate limits > per IP: the limit runs before the body is read, so even junk requests count 18ms
✓ test/api/rateLimit.test.js > Probe 3: rate limits > per widget: one widget's cap does not block another widget 63ms
✓ test/api/rateLimit.test.js > Probe 3: rate limits > preflights are never counted 45ms
✓ test/api/geoFallback.test.js > Probe 4: geo fallback, end to end > A up: the row has A's geo and B is never called 41ms
✓ test/api/geoFallback.test.js > Probe 4: geo fallback, end to end > A down: the row has B's geo 27ms
✓ test/api/geoFallback.test.js > Probe 4: geo fallback, end to end > A hangs: it is cut off by the timeout and B answers 149ms
✓ test/api/geoFallback.test.js > Probe 4: geo fallback, end to end > both down: still 201, the row is stored with geo NULL, and the failures are logged without the IP 26ms
✓ test/api/geoFallback.test.js > Probe 4: geo fallback, end to end > stores the real connection IP, not the geo test IP 24ms
✓ test/api/honeypot.test.js > Probe 6: honeypot > a filled honeypot gets the same 201 shape as a real submission, but nothing is stored or emailed 29ms
✓ test/api/honeypot.test.js > Probe 6: honeypot > an empty honeypot (what the real widget sends) is stored normally 20ms
✓ test/api/honeypot.test.js > Probe 6: honeypot > a bot still gets 422 for invalid fields, so the trap is not revealed by a different answer 11ms
✓ test/api/honeypot.test.js > Idempotency-Key (S5) > a retry with the same key returns the original row: one row, one email 30ms
✓ test/api/honeypot.test.js > Idempotency-Key (S5) > parallel requests with the same key (a double click) still store one row 67ms
✓ test/api/honeypot.test.js > Idempotency-Key (S5) > a key that is not a UUID is a 422 8ms
✓ test/api/dashboard.test.js > Probe 1: owner dashboard > pages through every submission newest first, with no repeats and no gaps 27ms
✓ test/api/dashboard.test.js > Probe 1: owner dashboard > rejects a tampered cursor and bad query values with 422, never 500 20ms
✓ test/api/dashboard.test.js > Probe 1: owner dashboard > stats match a hand-written SQL count 30ms
✓ test/api/tenantIsolation.test.js > tenant isolation > authentication > GET /api/widgets without a token → 401 11ms
✓ test/api/tenantIsolation.test.js > tenant isolation > authentication > POST /api/widgets without a token → 401 5ms
✓ test/api/tenantIsolation.test.js > tenant isolation > authentication > GET /api/submissions without a token → 401 8ms
✓ test/api/tenantIsolation.test.js > tenant isolation > authentication > GET /api/stats/overview without a token → 401 5ms
✓ test/api/tenantIsolation.test.js > tenant isolation > authentication > a forged token → 401 5ms
✓ test/api/tenantIsolation.test.js > tenant isolation > widgets > B's list does not contain A's widget 11ms
✓ test/api/tenantIsolation.test.js > tenant isolation > widgets > B reading A's widget gets the same 404 as a widget that does not exist 14ms
✓ test/api/tenantIsolation.test.js > tenant isolation > widgets > B cannot change or delete A's widget, and A's widget is unchanged afterwards 22ms
✓ test/api/tenantIsolation.test.js > tenant isolation > widgets > owner_id cannot be smuggled in the body 13ms
✓ test/api/tenantIsolation.test.js > tenant isolation > submissions > Probe 1: A's submission appears in A's list, linked to A's widget 11ms
✓ test/api/tenantIsolation.test.js > tenant isolation > submissions > B's list contains only B's submissions 10ms
✓ test/api/tenantIsolation.test.js > tenant isolation > submissions > B filtering by A's widget gets 404, not an empty list 7ms
✓ test/api/tenantIsolation.test.js > tenant isolation > submissions > B's stats count none of A's submissions 54ms
✓ test/api/tenantIsolation.test.js > tenant isolation > submissions > the owner API never returns the visitor IP or internal ids 10ms
✓ test/api/badPayloads.test.js > Probe 2: bad payloads on POST /submissions > malformed JSON → 400 BAD_REQUEST, with CORS, no row stored 16ms
✓ test/api/badPayloads.test.js > Probe 2: bad payloads on POST /submissions > body over 10 kB → 413 PAYLOAD_TOO_LARGE, with CORS, no row stored 8ms
✓ test/api/badPayloads.test.js > Probe 2: bad payloads on POST /submissions > text/plain content type → 415 UNSUPPORTED_MEDIA_TYPE, with CORS, no row stored 7ms
✓ test/api/badPayloads.test.js > Probe 2: bad payloads on POST /submissions > invalid email field → 422 VALIDATION_FAILED, with CORS, no row stored 12ms
✓ test/api/badPayloads.test.js > Probe 2: bad payloads on POST /submissions > missing required field → 422 VALIDATION_FAILED, with CORS, no row stored 9ms
✓ test/api/badPayloads.test.js > Probe 2: bad payloads on POST /submissions > unknown field → 422 VALIDATION_FAILED, with CORS, no row stored 8ms
✓ test/api/badPayloads.test.js > Probe 2: bad payloads on POST /submissions > body is a JSON array → 422 VALIDATION_FAILED, with CORS, no row stored 10ms
✓ test/api/badPayloads.test.js > Probe 2: bad payloads on POST /submissions > unknown widget → 404 NOT_FOUND, with CORS, no row stored 10ms
✓ test/api/badPayloads.test.js > Probe 2: bad payloads on POST /submissions > malformed widget id → 404 NOT_FOUND, with CORS, no row stored 7ms
✓ test/api/badPayloads.test.js > Probe 2: bad payloads on POST /submissions > never echoes the rejected value back in a 422 7ms
✓ test/api/cors.test.js > CORS > answers the preflight for POST /submissions with 204 and the allowed method and headers 6ms
✓ test/api/cors.test.js > CORS > puts CORS headers on a successful cross-origin POST, and exposes Retry-After 16ms
✓ test/api/cors.test.js > CORS > puts CORS headers on error responses too, so the widget can read them 14ms
✓ test/api/cors.test.js > CORS > serves the public widget config to any origin, with a short cache 7ms
✓ test/api/cors.test.js > CORS > does not open the owner API to other origins 4ms
✓ test/geoService.test.js > geoService.lookup > returns null (and does not throw) when every provider is down 4ms
✓ test/geoService.test.js > geoService.lookup > falls back to B when A is down 6ms
✓ test/geoService.test.js > geoService.lookup > uses A when A is up and never calls B 1ms
✓ test/geoService.test.js > geoService.lookup > times out a slow A and falls back to B 59ms
✓ test/geoService.test.js > geoService.lookup > gives each provider its own timeout budget (one shared signal would fail B too) 91ms
✓ test/geoService.test.js > geoService.lookup > returns null for "127.0.0.1" without calling any provider 0ms
✓ test/geoService.test.js > geoService.lookup > returns null for "::ffff:127.0.0.1" without calling any provider 5ms
✓ test/geoService.test.js > geoService.lookup > returns null for "10.0.0.5" without calling any provider 0ms
✓ test/geoService.test.js > geoService.lookup > returns null for "not-an-ip" without calling any provider 2ms
✓ test/geoService.test.js > geoService.lookup > returns null for undefined without calling any provider 0ms
✓ test/geoService.test.js > geoService.lookup > logs each failure as a warning with the provider name and reason, never the IP 1ms
✓ test/geoProviders.test.js > ipApiProvider > maps a success body to { country, region, city } 30ms
✓ test/geoProviders.test.js > ipApiProvider > throws on a 200 with status 'fail' 2ms
✓ test/geoProviders.test.js > ipApiProvider > throws on 429 (rate limited) 1ms
✓ test/geoProviders.test.js > ipApiProvider > stores empty region/city as null 1ms
✓ test/geoProviders.test.js > ipapiCoProvider > maps a success body to { country, region, city } 1ms
✓ test/geoProviders.test.js > ipapiCoProvider > throws on { error: true } 1ms
✓ test/geoProviders.test.js > ipapiCoProvider > throws when the body is not JSON 1ms
✓ test/isPublicIp.test.js > isPublicIp > 8.8.8.8 is public 5ms
✓ test/isPublicIp.test.js > isPublicIp > 2001:4860:4860::8888 is public 6ms
✓ test/isPublicIp.test.js > isPublicIp > 172.32.0.1 is public 0ms
✓ test/isPublicIp.test.js > isPublicIp > 172.15.255.255 is public 0ms
✓ test/isPublicIp.test.js > isPublicIp > 127.0.0.1 is not public 0ms
✓ test/isPublicIp.test.js > isPublicIp > ::1 is not public 2ms
✓ test/isPublicIp.test.js > isPublicIp > ::ffff:127.0.0.1 is not public 0ms
✓ test/isPublicIp.test.js > isPublicIp > ::ffff:192.168.1.5 is not public 0ms
✓ test/isPublicIp.test.js > isPublicIp > 10.1.2.3 is not public 0ms
✓ test/isPublicIp.test.js > isPublicIp > 192.168.0.10 is not public 0ms
✓ test/isPublicIp.test.js > isPublicIp > 172.16.0.1 is not public 0ms
✓ test/isPublicIp.test.js > isPublicIp > 172.31.255.255 is not public 1ms
✓ test/isPublicIp.test.js > isPublicIp > 169.254.1.1 is not public 0ms
✓ test/isPublicIp.test.js > isPublicIp > 0.0.0.0 is not public 0ms
✓ test/isPublicIp.test.js > isPublicIp > :: is not public 5ms
✓ test/isPublicIp.test.js > isPublicIp > fd12:3456::1 is not public 1ms
✓ test/isPublicIp.test.js > isPublicIp > fe80::1 is not public 0ms
✓ test/isPublicIp.test.js > isPublicIp > "not-an-ip" is rejected without throwing 1ms
✓ test/isPublicIp.test.js > isPublicIp > "" is rejected without throwing 0ms
✓ test/isPublicIp.test.js > isPublicIp > undefined is rejected without throwing 0ms
✓ test/isPublicIp.test.js > isPublicIp > null is rejected without throwing 0ms
✓ test/isPublicIp.test.js > isPublicIp > "8.8.8.8 " is rejected without throwing 0ms
✓ test/isPublicIp.test.js > isPublicIp > "999.1.1.1" is rejected without throwing 0ms
✓ test/forceDown.test.js > applyForcedDown > leaves providers alone when the list is empty 3ms
✓ test/forceDown.test.js > applyForcedDown > makes a named provider throw without calling the real one 2ms
Test Files  12 passed (12)
Tests  96 passed (96)
```

**The tests can fail.** Three bugs were put in on purpose and removed afterwards; each one turned
the suite red:

```
MUTANT 1: dashboard list query loses its owner filter (WHERE (s.owner_id = $1 OR true))
 FAIL  tenantIsolation.test.js > ... > Probe 1: A's submission appears in A's list, linked to A's widget
 FAIL  tenantIsolation.test.js > ... > B's list contains only B's submissions
      Tests  2 failed | 51 passed (53)
MUTANT 2: geo chain returns null after the first failure (no fallback)
 FAIL  geoService.test.js > ... > falls back to B when A is down
 FAIL  geoFallback.test.js > Probe 4 ... > A down: the row has B's geo
 FAIL  geoFallback.test.js > Probe 4 ... > A hangs: it is cut off by the timeout and B answers
   (8 failed in total)
MUTANT 3: a failed enqueue is rethrown instead of logged
 FAIL  emailFailure.test.js > Probe 5 ... > when the queue itself is down, the visitor still gets 201, the row is stored, and the error is logged
      Tests  1 failed | 52 passed (53)
```

(Mutants 1 and 3 ran only `test/api`, so 53 tests; mutant 2 ran the whole suite.)

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

Step 5: malformed, oversized, wrong content type and invalid fields are under row 8. Step 11: automated in `test/api/badPayloads.test.js` (see "Automated suite (Step 11)").

### S3. Background job with retries and a failure alert (Step 8)

Worker log for the Probe 5 job (pino JSON, shown as local time · level · attempt · message):

```
18:54:56.460  level 30              Worker started
18:55:00.515  level 40  attempt 1  Confirmation email failed; will retry | Email sending forced to fail (FORCE_EMAIL_FAILURE)
18:55:04.511  level 40  attempt 2  Confirmation email failed; will retry | Email sending forced to fail (FORCE_EMAIL_FAILURE)
18:55:12.546  level 40  attempt 3  Confirmation email failed; will retry | Email sending forced to fail (FORCE_EMAIL_FAILURE)
18:55:28.606  level 40  attempt 4  Confirmation email failed; will retry | Email sending forced to fail (FORCE_EMAIL_FAILURE)
18:55:30.611  level 50  alert=true  ALERT confirmation email gave up after all retries (submission 4780cbe7-aa8a-44e3-8592-359221ffcf1a)
```

The job ended in the dead-letter queue (`pgboss.job`):

```
         queue          |   state   | retry_count | retry_limit |            submission_id
------------------------+-----------+-------------+-------------+--------------------------------------
 confirmation-email     | failed    |           3 |           3 | 4780cbe7-aa8a-44e3-8592-359221ffcf1a
 confirmation-email-dlq | completed |           0 |           2 | 4780cbe7-aa8a-44e3-8592-359221ffcf1a
```

Queue policy (`src/jobs/queues.js`): `retryLimit: 3, retryDelay: 2, retryBackoff: true, retryDelayMax: 60,
deadLetter: "confirmation-email-dlq"`, stored on the job as `retry_delay 2 | retry_backoff t | retry_delay_max 60`.

Gaps between attempts were 4 s, 8 s, 16 s. pg-boss schedules each retry at
`retryDelay * (2^n/2 + 2^n/2 * random())`, and the worker polls every 2 s (pg-boss default), so a due time is
rounded up to the next poll. Jitter checked separately: 5 jobs failed together were scheduled
`3.87 s`, `5.65 s` and `6.38 s` out (the remaining two had not been fetched yet); test jobs deleted afterwards.

Happy path, worker without the flag (Mailpit inbox emptied first):

```
--- 1. one submission
{"id":"125c85f5-f25f-4865-871c-2647677f7949","createdAt":"2026-11-18T14:15:14.208Z"}  -> HTTP 201 in 0.851581s
worker: {"jobId":"125c85f5-…","submissionId":"125c85f5-…","attempt":1,"status":"sent","messageId":"<65ad2bb1-…@example.test>","msg":"Confirmation email job done"}
mailpit: to step8-visitor@example.com | We received your message: Monthly newsletter
```

Automated (Step 11): `test/api/emailFailure.test.js` > "Probe 5: retries, then dead letter and ALERT (real pg-boss)". See "Automated suite (Step 11)" below for the full output.

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

Step 10 (2026-11-20): `EXPLAIN ANALYZE` on every dashboard query.

With only 95 real rows, Postgres would rightly choose a sequential scan, so the test used a throwaway
transaction:

1. Insert 100,000 rows: 5,000 for tenant A and 95,000 for tenant B, spread over 90 days. That makes A
   one tenant among many.
2. Run `ANALYZE`.
3. Run each query with A's owner id.
4. `ROLLBACK`. Rows before: 95. Rows after the rollback: 95.

Lines from the plans, run with `EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON)`:

```
rows_now 100095 | tenant_a 5091

=== 1. listSubmissions, first page                                       Execution Time: 0.219 ms
 Limit (actual rows=21 loops=1)
   ->  Incremental Sort ... Presorted Key: s.created_at
         ->  Nested Loop (actual rows=22 loops=1)
               ->  Index Scan Backward using submissions_owner_id_created_at_idx on submissions s (actual rows=22 loops=1)
                     Index Cond: (owner_id = '8adcef6a-...'::uuid)
=== 1b. listSubmissions, a later page (cursor 30 days back)             Execution Time: 0.269 ms
               ->  Index Scan Backward using submissions_owner_id_created_at_idx on submissions s (actual rows=22 loops=1)
                     Index Cond: ((owner_id = '8adcef6a-...'::uuid) AND (created_at <= (now() - '30 days'::interval)))
                     Filter: (ROW(created_at, id) < ROW((now() - '30 days'::interval), 'ffffffff-...'::uuid))
=== 2. countTotals                                                       Execution Time: 3.072 ms
   ->  Bitmap Heap Scan on submissions (actual rows=5091 loops=1)
         ->  Bitmap Index Scan on submissions_owner_id_created_at_idx (actual rows=5091 loops=1)
=== 3. countPerWidget (as first written)                                 Execution Time: 11.619 ms
         ->  Hash Right Join (actual rows=5094 loops=1)
               ->  Seq Scan on submissions s (actual rows=100095 loops=1)
=== 4. countPerDay (30 days)                                             Execution Time: 1.776 ms
         ->  Nested Loop Left Join (actual rows=2227 loops=1)
               ->  Function Scan on generate_series d (actual rows=30 loops=1)
               ->  Index Scan using submissions_owner_id_created_at_idx on submissions s (actual rows=74 loops=30)
                     Index Cond: ((owner_id = '8adcef6a-...'::uuid) AND (created_at >= d.day) AND (created_at < (d.day + '1 day'::interval)))
=== 5. countByCountry                                                    Execution Time: 4.102 ms
         ->  Bitmap Heap Scan on submissions (actual rows=5091 loops=1)
               ->  Bitmap Index Scan on submissions_owner_id_created_at_idx (actual rows=5091 loops=1)
ROLLBACK
 rows_after_rollback 95
```

Four of the five queries use `(owner_id, created_at)`. The list query reads that index backward and
stops after 22 rows. The cursor's time is in `Index Cond`; the `id` tie-break is a cheap `Filter`.

**Query 3 read every tenant's rows.** The owner condition was only on `widgets`, so Postgres had no
owner filter on `submissions` and scanned all 100,095 rows. The result was correct, but the query
would slow down for every tenant as the whole platform grows.

**The fix needed no new index:** add `AND s.owner_id = w.owner_id` to the join. That condition is
always true for a matching row, and it lets Postgres use the index.

Both versions were compared in the same transaction, after `VACUUM`. Dead index entries from an
earlier rolled-back run had inflated the first retry, so a fair comparison needed the cleanup:

```
=== 3 as written
               ->  Seq Scan on submissions s (actual rows=100095 loops=1)
 Execution Time: 13.634 ms
=== 3 fixed
               ->  Bitmap Heap Scan on submissions s (actual rows=5091 loops=1)
                     ->  Bitmap Index Scan on submissions_owner_id_created_at_idx (actual rows=5091 loops=1)
 Execution Time: 4.683 ms
--- same result as before?   same = t
```

No index was added in Step 10. The Step 2 index serves every dashboard query.

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

One email per submission (Step 8). The job id is the submission id (`boss.send(..., { id: submission.id })`).
The plan said `singletonKey`, but on pg-boss 12's default `standard` queue it does not deduplicate. Checked:

```
singletonKey, 1st: 1190346f-a59e-4674-8706-b49f3816bdd6
singletonKey, 2nd: 4dbd4ab1-281c-48a6-bb85-08d7c9d89f28     <- second job created
id,           1st: 72c60112-ab11-4ba6-a89e-8a8f1f843178
id,           2nd: null                                     <- refused
```

Same `Idempotency-Key` sent twice through the API, with the worker running:

```
--- 2. same Idempotency-Key sent twice (46e638a4-a3f1-4c6d-a1ad-5eb0eaf3299a)
{"id":"c25e30a5-afe2-4a73-80bd-275111590daf","createdAt":"2026-11-18T14:15:14.620Z"}  -> HTTP 201
{"id":"c25e30a5-afe2-4a73-80bd-275111590daf","createdAt":"2026-11-18T14:15:14.620Z"}  -> HTTP 201

mailpit total: 2   (one per submission; the retry added none)
  to step8-retry@example.com   | We received your message: Monthly newsletter
  to step8-visitor@example.com | We received your message: Monthly newsletter

           email           | jobs |   state
---------------------------+------+-----------
 step8-retry@example.com   |    1 | completed
 step8-visitor@example.com |    1 | completed
```

Automated (Step 11): `test/api/honeypot.test.js` > "Idempotency-Key (S5)": a retry returns the same id with 1 row; 5 parallel requests with one key → 1 row; a non-UUID key → 422; a second `send` for the same submission → `null` (in emailFailure.test.js). See "Automated suite (Step 11)" below for the full output.

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

Step 12 (2026-11-21): gitleaks v8.28.0 (Docker image `zricethezav/gitleaks:v8.28.0`) over the full
git history.

The first run had one finding:

```
$ docker run --rm -v "<repo>:/repo" zricethezav/gitleaks:v8.28.0 git /repo --redact -v
RuleID:      curl-auth-header
File:        EVIDENCE.md
Line:        92
Commit:      f32272837a32fc06c4d4f11ad5804034ef688cb9
17 commits scanned.  leaks found: 1
```

The flagged value is `abc.def.ghi`, the deliberately fake token that row 1 sends to prove a bad
token gets 401. It is a false positive, so its fingerprint was recorded with that reason in
`.gitleaksignore`. Results after that:

```
$ docker run ... gitleaks:v8.28.0 git /repo --redact --gitleaks-ignore-path /repo/.gitleaksignore
17 commits scanned.
scanned ~441895 bytes (441.89 KB) in 4.98s
no leaks found
```

The files about to be committed (`git ls-files -co --exclude-standard`, so `.env` is excluded)
were also scanned with `gitleaks dir`. The only finding was the same `abc.def.ghi` line in
EVIDENCE.md.

Every variable the code reads is in `.env.example` with a placeholder:

```
DATABASE_URL ok · FORCE_EMAIL_FAILURE ok · GEO_FORCE_DOWN ok · GEO_TEST_IP ok · JWT_SECRET ok · LOG_LEVEL ok
MAIL_FROM ok · NODE_ENV ok · PORT ok · PUBLIC_BASE_URL ok · SMTP_HOST ok · SMTP_PORT ok · TEST_DATABASE_URL ok
```

### S7. Cost tracking, if AI is used (Step 12)

Step 12 (2026-11-21): the README's "AI use" section says the product calls no model at runtime,
so there is no AI cost to track. AI help during development is logged step by step in BUILDLOG.md.
