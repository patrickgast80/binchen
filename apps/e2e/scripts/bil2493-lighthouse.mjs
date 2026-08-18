/**
 * BIL-2493 — Lighthouse mobile on the exact URLs from the ticket's table, so
 * the before/after numbers are comparable line for line.
 *
 *   LIGHTHOUSE_CLI=<path to lighthouse/cli/index.js> \
 *   CHROME_PATH=<path to chrome.exe> \
 *   node scripts/bil2493-lighthouse.mjs [baseUrl] [outDir] [label]
 *
 * Each URL runs twice and both scores are reported — a single mobile run on a
 * laptop carries several points of noise, and the ticket's own "82 / 80 =
 * Messrauschen" note is exactly why we don't hang a >= 90 verdict on one
 * sample.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const BASE = process.argv[2] ?? "http://127.0.0.1:3311";
const OUT = process.argv[3] ?? path.join(process.cwd(), "reports", "bil2493");
const LABEL = process.argv[4] ?? "after";
const RUNS = Number(process.env.LH_RUNS ?? 2);
const CLI = process.env.LIGHTHOUSE_CLI;
if (!CLI) throw new Error("set LIGHTHOUSE_CLI to lighthouse/cli/index.js");

const CASES = [
  { id: "uni-default", url: "/konfigurator/hose" },
  { id: "fabric", url: "/konfigurator/hose?hose=stoff-14" },
  { id: "fabric-rot90", url: "/konfigurator/hose?hose=stoff-14&rot=90" },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const rows = [];

  for (const c of CASES) {
    for (let i = 1; i <= RUNS; i++) {
      const jsonPath = path.join(OUT, `lh-${LABEL}-${c.id}-run${i}.json`);
      // A leftover report from an earlier sweep would silently satisfy the
      // retry loop below and get reported as this run's result.
      await rm(jsonPath, { force: true });
      // Headless Chrome teardown on Windows is flaky in two ways: an EPERM
      // while deleting the temp profile (report already written — harmless)
      // and an outright 0xC0000409 crash (no report — retry). Retry until a
      // readable report exists rather than losing the whole sweep to either.
      let lhr = null;
      for (let attempt = 1; attempt <= 3 && !lhr; attempt++) {
        try {
          await run(
            process.execPath,
            [
              CLI,
              `${BASE}${c.url}`,
              // Default preset is already mobile emulation + slow-4G + 4x CPU.
              "--output=json",
              `--output-path=${jsonPath}`,
              "--only-categories=performance",
              "--quiet",
              "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
            ],
            { maxBuffer: 1024 * 1024 * 64 },
          );
        } catch (err) {
          console.warn(`  (${c.id} run${i} attempt ${attempt}: ${err.code ?? "failed"})`);
        }
        try {
          lhr = JSON.parse(await readFile(jsonPath, "utf8"));
        } catch {
          lhr = null;
        }
      }
      if (!lhr) throw new Error(`no lighthouse report for ${c.id} run${i}`);
      const num = (id) => lhr.audits[id]?.numericValue ?? NaN;
      const row = {
        case: c.id,
        url: c.url,
        run: i,
        performance: Math.round(lhr.categories.performance.score * 100),
        lcpMs: num("largest-contentful-paint"),
        fcpMs: num("first-contentful-paint"),
        tbtMs: num("total-blocking-time"),
        cls: num("cumulative-layout-shift"),
        totalKb: Math.round(num("total-byte-weight") / 1024),
        lcpElement:
          lhr.audits["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node
            ?.snippet ?? null,
      };
      rows.push(row);
      console.log(
        `${c.id.padEnd(12)} run${i}  perf ${String(row.performance).padStart(3)}  ` +
          `LCP ${(row.lcpMs / 1000).toFixed(1)}s  FCP ${(row.fcpMs / 1000).toFixed(1)}s  ` +
          `TBT ${Math.round(row.tbtMs)}ms  CLS ${row.cls.toFixed(3)}  ${row.totalKb} kB`,
      );
    }
  }

  await writeFile(path.join(OUT, `summary-${LABEL}.json`), JSON.stringify(rows, null, 2), "utf8");
  console.log(`\nWrote ${rows.length} runs → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
