// Bundles widget/src into dist/widget.<hash>.js and writes dist/manifest.json, which tells the
// server (and so the loader) which file is current. The hash comes from the content: same code,
// same name; any change, new name. That is what makes the year-long `immutable` cache safe.
//
// Old bundles are NOT deleted: a visitor holding a cached loader (up to 5 min) still asks for
// the previous hash, and must get it.
import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Paths relative to the repo root, wherever the script is started from.
const root = fileURLToPath(new URL("..", import.meta.url));
const outdir = path.join(root, "dist");

const result = await build({
  entryPoints: [path.join(root, "widget/src/index.js")],
  absWorkingDir: root, // metafile paths stay relative to the repo root
  bundle: true,
  minify: true,
  format: "iife", // runs in the customer's page: wrap everything so no globals leak into it
  target: "es2019",
  outdir,
  entryNames: "widget.[hash]",
  metafile: true, // lets us read back the hashed file name esbuild chose
});

const [outputPath] = Object.keys(result.metafile.outputs);
const bundle = path.basename(outputPath);

await writeFile(path.join(outdir, "manifest.json"), JSON.stringify({ bundle }, null, 2) + "\n");
console.log(`built ${outputPath} (${result.metafile.outputs[outputPath].bytes} bytes)`);
