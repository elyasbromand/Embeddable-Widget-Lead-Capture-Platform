import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { config } from "../../config/index.js";
import { NotFoundError } from "../../errors.js";

// Scripts for customers' pages. No auth, no CORS: a <script src> tag is not a CORS request.
export const deliveryRouter = Router();

// Relative to this file, not to the folder the server was started from.
const distDir = fileURLToPath(new URL("../../../dist", import.meta.url));
const bundleName = /^widget\.[A-Za-z0-9]+\.js$/;

// Read once at boot. No usable manifest means `npm run build:widget` never ran: fail now, loudly,
// instead of serving a loader that points at nothing.
let manifest;
try {
  manifest = JSON.parse(readFileSync(path.join(distDir, "manifest.json"), "utf8"));
} catch {
  manifest = null;
}
if (!bundleName.test(manifest?.bundle)) {
  const file = path.join(distDir, "manifest.json");
  throw new Error(`${file} missing or invalid: run \`npm run build:widget\` first`);
}

// Same for every widget id, so built once. JSON.stringify makes the URL a safe JS string literal.
const loaderSource = `(function () {
  var s = document.currentScript;
  var id = s && new URL(s.src).searchParams.get("id");
  if (!id) { console.error("[widget] snippet is missing ?id="); return; }
  var b = document.createElement("script");
  b.src = ${JSON.stringify(`${config.PUBLIC_BASE_URL}/${manifest.bundle}`)}; // here we set the request for the bundle.
  b.async = true;
  b.dataset.widgetId = id;
  s.after(b);
})();
`;

// Fixed URL → short cache. This bounds how long a customer runs old code after a deploy.
deliveryRouter.get("/widget.js", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.type("text/javascript").send(loaderSource);
});

// Hashed URL → cached for a year, `immutable`. The regex only matches our bundle names
// (the same pattern the manifest is checked against), so nothing else in dist/ is served.
deliveryRouter.get(/^\/widget\.[A-Za-z0-9]+\.js$/, (req, res, next) => {
  res.sendFile(path.basename(req.path), { root: distDir, maxAge: "1y", immutable: true }, (err) => {
    if (err) next(err.status === 404 ? new NotFoundError("Bundle not found") : err);
  });
});
