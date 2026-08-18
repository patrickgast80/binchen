/**
 * BIL-2493 — put the *old* fabric assets back on disk so the before/after
 * Lighthouse numbers come from one machine, one build and one session instead
 * of being compared against numbers measured on someone else's laptop.
 *
 *   node scripts/bil2493-swap-assets.mjs before   # HEAD~ masters restored
 *   node scripts/bil2493-swap-assets.mjs after    # working-tree assets back
 *
 * `next start` reads public/ from disk per request, so swapping the bytes
 * needs no rebuild. Only the *tile* filename gets the old master back: in the
 * old build `swatchChipStyle` pointed at `textureSrc`, i.e. the chip and the
 * preview were the same URL and therefore a single fetch. Writing the master
 * over the -128 chip as well would invent a second 434 kB request the old
 * build never made and overstate the baseline by ~50 %. The 7 kB chip that
 * stays behind is the only deviation from the real old page weight.
 */
import { execFile } from "node:child_process";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const MODE = process.argv[2];
if (!["before", "after"].includes(MODE)) throw new Error("usage: … before|after");

const REPO = path.resolve(process.cwd(), "..", "..");
const PUBLIC_REL = "apps/storefront/public/stoffe";
const PUBLIC = path.join(REPO, PUBLIC_REL);
const BACKUP = path.join(REPO, "apps/storefront/.tmp/bil2493/after-assets");
const REF = process.env.BASELINE_REF ?? "HEAD";

async function main() {
  if (MODE === "after") {
    const files = await readdir(BACKUP);
    for (const f of files) await cp(path.join(BACKUP, f), path.join(PUBLIC, f));
    // Chips only exist in the "after" set; the baseline overwrote them with
    // the old master, so a plain copy-back is enough.
    console.log(`restored ${files.length} working-tree assets → ${PUBLIC_REL}`);
    return;
  }

  await mkdir(BACKUP, { recursive: true });
  const current = (await readdir(PUBLIC)).filter((f) => f.endsWith(".webp"));
  for (const f of current) await cp(path.join(PUBLIC, f), path.join(BACKUP, f));
  console.log(`backed up ${current.length} current assets → ${BACKUP}`);

  const { stdout } = await run("git", ["ls-tree", "--name-only", `${REF}`, `${PUBLIC_REL}/`], {
    cwd: REPO,
  });
  // Match the tile positively. "exclude -<size>.webp" does not work: the slug
  // itself ends in -NN, so `stoff-01.webp` looks like a sized variant too.
  const old = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /\/stoff-\d+\.webp$/.test(l));
  if (!old.length) throw new Error(`no fabric masters found in ${REF}:${PUBLIC_REL}`);
  let bytes = 0;
  for (const rel of old) {
    const { stdout: blob } = await run("git", ["show", `${REF}:${rel}`], {
      cwd: REPO,
      encoding: "buffer",
      maxBuffer: 1024 * 1024 * 32,
    });
    const slug = path.basename(rel, ".webp");
    await writeFile(path.join(PUBLIC, `${slug}.webp`), blob);
    bytes += blob.length;
  }
  console.log(
    `restored ${old.length} ${REF} masters over the tile filenames ` +
      `(${(bytes / 1024 / 1024).toFixed(1)} MB on disk; chips left at the new size on purpose)`,
  );
  console.log("run this script with 'after' before committing — public/ is dirty until then");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
