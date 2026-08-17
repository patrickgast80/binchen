/**
 * Loads `ImageResponse` in a way that also works on Windows.
 *
 * `@vercel/og`'s node entry resolves its bundled font and wasm with
 * `fileURLToPath(join(import.meta.url, "../file"))`. `path.join` mangles a
 * `file://` URL on win32 into `.\file:\C:\…`, so the module throws
 * `ERR_INVALID_URL` at *import* time — passing explicit `fonts` does not help,
 * the failure is in module init. Linux is unaffected, which is why production
 * is fine and only local harnesses need this.
 *
 * Fix: emit a patched copy of the entry file *in its own directory* (so its
 * relative imports still resolve) with those three lookups replaced by plain
 * absolute paths. Only touched on win32; elsewhere the module is imported
 * as-is.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

export async function loadImageResponse() {
  const entry = require.resolve("next/dist/compiled/@vercel/og/index.node.js");
  if (process.platform !== "win32") {
    return (await import(pathToFileURL(entry).href)).ImageResponse;
  }

  const dir = path.dirname(entry);
  const src = await readFile(entry, "utf8");
  const patched = src.replace(
    /fileURLToPath\(join\(import\.meta\.url, "\.\.\/([^"]+)"\)\)/g,
    (_m, file) => JSON.stringify(path.join(dir, file)),
  );
  if (patched === src) {
    throw new Error("og entry no longer matches the win32 font-path patch — re-check it");
  }
  const out = path.join(dir, "index.node.win-harness.mjs");
  await writeFile(out, patched);
  return (await import(pathToFileURL(out).href)).ImageResponse;
}
