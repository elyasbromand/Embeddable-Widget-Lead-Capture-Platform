// Rate-limit burst probe (Step 6 gate, Probes 3 and 6). Attacks your OWN local API only.
//
//   node scripts/attack.js                      # 30 requests at http://localhost:3000
//   node scripts/attack.js --burst 50 --widget cqaxksTr2jOc --url http://localhost:3000
//
// 1. Fires a burst of valid submissions in parallel, from this one IP.
// 2. Counts the status codes: expect exactly 10 x 201 (the per-IP limit) and the rest 429.
// 3. Waits as long as the 429's Retry-After header says, then sends one normal request: expect 201.
// Exits with code 1 if any expectation fails, so the output can be pasted as proof.
// Each 201 stores a real row on the demo widget (dev data, like the seed).

import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    widget: { type: "string", default: "lvuvcZeFr-42" }, // tenant A's seeded widget
    burst: { type: "string", default: "30" },
  },
});
const burst = Number(args.burst);
const endpoint = new URL("/submissions", args.url).href;
const PER_IP_LIMIT = 10; // must match perIpLimiter in src/http/middleware/rateLimit.js

function submit(i) {
  return fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ widgetId: args.widget, fields: { email: `attack-${i}@example.com` } }),
  });
}

const tally = (responses) =>
  responses.reduce((counts, r) => ({ ...counts, [r.status]: (counts[r.status] ?? 0) + 1 }), {});

console.log(`Burst: ${burst} parallel POST ${endpoint} (widget ${args.widget})`);
const started = Date.now();
const responses = await Promise.all(Array.from({ length: burst }, (_, i) => submit(i)));
const counts = tally(responses);
console.log(`Done in ${Date.now() - started} ms. Status counts:`, counts);

const limited = responses.find((r) => r.status === 429);
let ok = (counts[201] ?? 0) === Math.min(burst, PER_IP_LIMIT) && (counts[429] ?? 0) === Math.max(0, burst - PER_IP_LIMIT);

if (limited) {
  console.log("Sample 429:");
  console.log("  Retry-After:", limited.headers.get("retry-after"));
  console.log("  RateLimit:  ", limited.headers.get("ratelimit"));
  console.log("  Body:       ", await limited.text());

  // Wait for the window to reset, plus one second of margin.
  const waitSeconds = Number(limited.headers.get("retry-after") ?? 60) + 1;
  console.log(`Waiting ${waitSeconds} s for the window to reset...`);
  await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));

  const after = await submit("after");
  console.log("Normal request after the window:", after.status, await after.text());
  ok &&= after.status === 201;
}

console.log(ok ? "PASS" : "FAIL: unexpected status counts, see above");
process.exitCode = ok ? 0 : 1;
