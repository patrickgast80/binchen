/**
 * BIL-2499 — proves on the DEPLOYED server that the "made with love" label is
 * byte-identical across every colour/fabric/rotation combination.
 *
 * The local proof (bil2499-label-proof.mjs) calls the compositor in-process, so
 * it can only ever vouch for the source tree. This one fetches real renders
 * from bilulu.de, which is what the board actually asked to see.
 *
 * Method — and the trap that a naive version falls into: you cannot simply crop
 * a box around the tag and demand zero deviation, because such a box also
 * contains waistband, which is SUPPOSED to change colour. The first cut of this
 * script did exactly that and reported a bogus 9k differing pixels.
 *
 * So instead of asserting on a hand-drawn box, we let the pixels draw it: build
 * a per-pixel invariance map across all N renders and isolate the tag from it.
 *
 * Second trap: "invariant" is not the same as "the tag". The OG card's cream
 * background is also identical in every render, so the invariant set is
 * (background ∪ tag). They are told apart topologically — the background
 * reaches the window border, the tag cannot, because the window is padded so
 * that recolourable waistband surrounds the tag on all sides. So: take the
 * connected components of invariant pixels, drop every one that touches the
 * border, and the largest survivor is the tag.
 *
 * Then check that it is a solid blob of the tag's expected size with no holes.
 * A recolour leaking onto the tag would punch holes in it or shrink it.
 *
 * Lives in the storefront workspace because that is where `sharp` resolves.
 *
 *   node apps/storefront/scripts/bil2499-live-label-proof.mjs [baseUrl]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const BASE = process.argv[2] ?? "https://bilulu.de";
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../../e2e/reports/bil2499/live");
await mkdir(OUT, { recursive: true });

/** Window around the tag in OG-card coordinates. Padded on purpose: it must
 *  contain waistband on all sides so we can see the invariant blob END. */
const TAG_WIN = { left: 310, top: 92, width: 92, height: 92 };
/** Negative control: bare waistband, no tag. A check that cannot fail proves
 *  nothing, so `--selftest` points the same instrument here and demands a FAIL. */
const CONTROL_WIN = { left: 180, top: 130, width: 92, height: 92 };
const SELFTEST = process.argv.includes("--selftest");
const WIN = SELFTEST ? CONTROL_WIN : TAG_WIN;
const SUF = SELFTEST ? "-control" : "";
const CH = 3;

const CASES = [
  { name: "default", qs: "" },
  { name: "cream", qs: "?bund=cream&hose=cream&buendchen=cream" },
  { name: "navy", qs: "?bund=navy&hose=forest&buendchen=rust" },
  { name: "stoff-14", qs: "?bund=navy&hose=stoff-14&buendchen=mustard" },
  { name: "stoff-01-rot90", qs: "?bund=sage&hose=stoff-01&buendchen=cream&rot=90" },
];

const crops = [];
for (const c of CASES) {
  const res = await fetch(`${BASE}/api/og/konfig/hose-kurz${c.qs}`);
  if (!res.ok) throw new Error(`${c.name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // Guard against the known next/og WebP trap: assert we really got a PNG.
  const meta = await sharp(buf).metadata();
  if (meta.format !== "png" || meta.width !== 1200) {
    throw new Error(`${c.name}: unexpected image ${meta.format} ${meta.width}x${meta.height}`);
  }
  crops.push({
    name: c.name,
    px: await sharp(buf).extract(WIN).removeAlpha().raw().toBuffer(),
  });
  await sharp(buf).extract(WIN).png().toFile(path.join(OUT, `labelwin-${c.name}${SUF}.png`));
}

const { width: W, height: H } = WIN;
const ref = crops[0].px;

/** invariant[i] = true when this pixel is identical in every render. */
const invariant = new Uint8Array(W * H);
let maxDevOverall = 0;
for (let p = 0; p < W * H; p++) {
  let dev = 0;
  for (let k = 1; k < crops.length; k++) {
    for (let ch = 0; ch < CH; ch++) {
      const d = Math.abs(crops[k].px[p * CH + ch] - ref[p * CH + ch]);
      if (d > dev) dev = d;
    }
  }
  invariant[p] = dev === 0 ? 1 : 0;
  if (dev > maxDevOverall) maxDevOverall = dev;
}

// Visual artefact: white = identical everywhere, black = varies.
await sharp(Buffer.from(invariant.map((v) => (v ? 255 : 0))), {
  raw: { width: W, height: H, channels: 1 },
}).png().toFile(path.join(OUT, `label-invariance-map${SUF}.png`));

/** Flood-fill the invariant pixels into components; keep only those that never
 *  touch the window border, so the card background drops out and the tag stays. */
const label = new Int32Array(W * H).fill(-1);
const components = [];
for (let seed = 0; seed < W * H; seed++) {
  if (!invariant[seed] || label[seed] !== -1) continue;
  const id = components.length;
  const stack = [seed];
  label[seed] = id;
  const comp = { id, pixels: 0, touchesBorder: false, minX: W, minY: H, maxX: -1, maxY: -1 };
  while (stack.length) {
    const p = stack.pop();
    const x = p % W;
    const y = (p - x) / W;
    comp.pixels++;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) comp.touchesBorder = true;
    if (x < comp.minX) comp.minX = x;
    if (x > comp.maxX) comp.maxX = x;
    if (y < comp.minY) comp.minY = y;
    if (y > comp.maxY) comp.maxY = y;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const np = ny * W + nx;
      if (!invariant[np] || label[np] !== -1) continue;
      label[np] = id;
      stack.push(np);
    }
  }
  components.push(comp);
}

/** In --selftest the expected outcome is failure, so report inverted. */
function finish(problems) {
  if (SELFTEST) {
    if (problems.length) {
      console.log(`SELFTEST PASS — control window correctly rejected: ${problems.join("; ")}`);
      process.exit(0);
    }
    console.error("SELFTEST FAIL — bare waistband passed the label check; the check is not real.");
    process.exit(1);
  }
  if (problems.length) {
    console.error(`FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  return true;
}

const enclosed = components.filter((c) => !c.touchesBorder).sort((a, b) => b.pixels - a.pixels);
if (!enclosed.length) finish(["no border-free invariant region: the tag is being recoloured"]);
const tag = enclosed[0];
const invCount = tag.pixels;
const minX = tag.minX, minY = tag.minY, maxX = tag.maxX, maxY = tag.maxY;
const bbox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };

/** (c) the blob must be SOLID, not a lace of coincidental colour matches:
 *  every pixel of the eroded interior has to be invariant. */
const INSET = 6;
let interior = 0;
let holes = 0;
for (let y = minY + INSET; y <= maxY - INSET; y++) {
  for (let x = minX + INSET; x <= maxX - INSET; x++) {
    interior++;
    if (label[y * W + x] !== tag.id) holes++;
  }
}

// Visual artefact: the isolated tag component, so a human can confirm the
// thing we measured really is the tag and not some other invariant patch.
const tagMask = new Uint8Array(W * H);
for (let p = 0; p < W * H; p++) tagMask[p] = label[p] === tag.id ? 255 : 0;
await sharp(Buffer.from(tagMask), { raw: { width: W, height: H, channels: 1 } })
  .png()
  .toFile(path.join(OUT, `label-tag-component${SUF}.png`));

const fill = invCount / (bbox.w * bbox.h);
const report = {
  base: BASE,
  route: "/api/og/konfig/hose-kurz",
  combinations: CASES.map((c) => c.name),
  window: WIN,
  invariantComponents: components.length,
  borderFreeComponents: enclosed.length,
  tagPixels: invCount,
  tagBbox: bbox,
  bboxFillRatio: Number(fill.toFixed(4)),
  interiorPixels: interior,
  interiorHoles: holes,
  maxDeviationInWindow: maxDevOverall,
};
await writeFile(path.join(OUT, `label-proof-live${SUF}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const problems = [];
// The tag renders ~36px across in this 92px window (its soft drop shadow makes
// it look bigger by eye, but the shadow blends with the band and is correctly
// NOT invariant). Bounds are wide enough to tolerate layout tweaks but tight
// enough that a recolour eating into the tag fails the check.
if (bbox.w < 28 || bbox.h < 28) problems.push(`invariant blob too small: ${bbox.w}x${bbox.h}`);
if (bbox.w > 60 || bbox.h > 60) problems.push(`invariant blob too large: ${bbox.w}x${bbox.h}`);
if (holes > 0) problems.push(`${holes} varying pixels inside the tag interior`);
// The tag is a square rotated ~8°, so its axis-aligned bbox is only ever about
// 1/(cos+sin)^2 ≈ 0.78 full. Anything much sparser is not a solid tag.
if (fill < 0.7) problems.push(`blob is not solid (fill ${fill.toFixed(3)})`);

finish(problems);
console.log(
  `PASS — tag is a solid ${bbox.w}x${bbox.h} invariant blob (${invCount} px, ${holes} interior holes) ` +
    `across ${CASES.length} live combinations.`,
);
