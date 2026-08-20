/**
 * BIL-2522 — Gegenprobe VOR dem Ticketschluss (Board-Abnahme 2026-08-20 06:55Z).
 *
 * Das Board hat abgenommen, was es am 19.08. gesehen hat. Zwischen der Frage
 * und der Antwort lagen aber sieben Commits auf `main`, davon drei mitten in
 * meiner Relief-Ebene (BIL-2529 Cookie-Banner, BIL-2531 Zeitscheiben +
 * `createImageBitmap`). Eine Abnahme auf einen Stand, den es live nicht mehr
 * gibt, waere wertlos — deshalb wird hier nachgewiesen, dass das abgenommene
 * Bild noch das ausgelieferte ist.
 *
 * Drei Fragen, drei Messungen:
 *
 *  1. Sind die Relief-Karten unveraendert? md5 der von bilulu.de gelieferten
 *     `relief.webp` gegen die Datei im Repo, alle fuenf.
 *  2. Malt die Ebene noch? Das Canvas existiert nur, wenn eine Zone eine
 *     Textur hat (BIL-2528), und wird erst auf opacity 1 gezogen, wenn wirklich
 *     gemalt wurde. Zusaetzlich die Standardabweichung der Canvas-Pixel: eine
 *     leere oder flach gefuellte Ebene faellt hier auf, ein gemustertes Relief
 *     nicht.
 *  3. Sieht es noch gleich aus? Screenshots Desktop + 390px, mit den beiden
 *     Fallen aus BIL-2492: Consent wird vorgesetzt (nicht weggeklickt), und
 *     jeder Schuss wird per Byte-Hash gegen alle anderen geprueft. Dazu eine
 *     Jitter-Kontrolle: dieselbe URL zweimal muss Diff 0 ergeben, sonst
 *     beweist kein einziger Vergleich etwas.
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const OUT = "reports/bil2522/abnahme-20260820";
await mkdir(OUT, { recursive: true });
const BASE = "https://bilulu.de";
const REPO = "../storefront/public";

const md5 = (buf) => createHash("md5").update(buf).digest("hex");
const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 12);

/** Ein Stoff pro Teil — jeweils der, der in den Abnahme-Belegen steckt. */
const CASES = [
  { name: "hose", asset: "hose-foto", url: `${BASE}/konfigurator/hose?hose=stoff-15&bund=sage&buendchen=sage` },
  { name: "hose-kurz", asset: "hose-kurz-foto", url: `${BASE}/konfigurator/hose-kurz?hose=stoff-04&bund=mustard&buendchen=mustard` },
  { name: "muetze", asset: "muetze-foto", url: `${BASE}/konfigurator/muetze?muetze=stoff-19&futter=powder-pink` },
  { name: "turban", asset: "turban-foto", url: `${BASE}/konfigurator/turban?turban=stoff-15&schleife=sage` },
  { name: "dreieckstuch", asset: "dreieckstuch-foto", url: `${BASE}/konfigurator/dreieckstuch?tuch=stoff-14&knoten=sage` },
];

const VIEWPORTS = [
  { id: "desktop", width: 1440, height: 900, isMobile: false },
  { id: "mobile", width: 390, height: 844, isMobile: true },
];

const CONSENT = () => {
  window.localStorage.setItem(
    "bilulu_cookie_consent_v1",
    JSON.stringify({
      version: "1",
      decidedAt: "2026-08-18T00:00:00.000Z",
      categories: { strict: true, functional: false, analytics: false, marketing: false },
    }),
  );
};

// ---------------------------------------------------------------- 1. Assets
const assets = [];
for (const c of CASES) {
  const src = `/konfigurator/${c.asset}/relief.webp`;
  const res = await fetch(BASE + src);
  const live = Buffer.from(await res.arrayBuffer());
  const repo = await readFile(path.join(REPO, src));
  assets.push({
    name: c.name,
    status: res.status,
    bytes: live.length,
    live: md5(live),
    repo: md5(repo),
    same: md5(live) === md5(repo),
  });
  console.log(`asset ${c.name.padEnd(14)} ${res.status} ${String(live.length).padStart(7)}B live=${md5(live).slice(0, 8)} repo=${md5(repo).slice(0, 8)} ${md5(live) === md5(repo) ? "OK" : "!! ABWEICHUNG"}`);
}

// ------------------------------------------------- 2./3. Browser auf bilulu.de
const browser = await chromium.launch();
const hashes = new Map();
const shots = [];
const canvasStats = [];
const consoleErrors = [];

/** Ein Fall, ein Viewport. `label` haengt am Dateinamen (Jitter-Kontrolle). */
async function shoot(page, c, vp, label) {
  await page.goto(c.url, { waitUntil: "networkidle", timeout: 60000 });

  const banner = page.getByRole("button", { name: /alle akzeptieren|zustimmen/i });
  if (await banner.count()) {
    throw new Error("Cookie-Banner trotz vorgesetztem Consent sichtbar — localStorage-Key geaendert?");
  }

  // Auf das SICHTBARE Relief-Canvas warten, nicht auf seine Existenz: die Ebene
  // mountet mit opacity 0 und zieht erst hoch, wenn gemalt wurde.
  const stat = await page.evaluate(async () => {
    const sel = 'canvas[aria-hidden="true"]';
    const deadline = performance.now() + 25000;
    let c = null;
    while (performance.now() < deadline) {
      const el = document.querySelector(sel);
      if (el && getComputedStyle(el).opacity === "1") { c = el; break; }
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!c) return { canvasVisible: false };
    // Standardabweichung der Luminanz ueber die gemalten (alpha>0) Pixel.
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0, s = 0, s2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      n++; s += y; s2 += y * y;
    }
    return {
      canvasVisible: true,
      canvasPx: { w: c.width, h: c.height },
      paintedPx: n,
      meanY: n ? +(s / n).toFixed(2) : null,
      sigmaY: n ? +Math.sqrt(s2 / n - (s / n) ** 2).toFixed(2) : null,
    };
  });
  if (!stat.canvasVisible) throw new Error(`${c.name}/${vp.id}: Relief-Canvas wurde nicht sichtbar`);
  canvasStats.push({ case: c.name, viewport: vp.id, label, ...stat });

  const preview = page.locator('[role="img"]').first();
  await preview.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(400);

  let buf;
  if (vp.isMobile) {
    // Element-Screenshot fotografiert auf Mobile das fixe Paletten-Sheet mit
    // (BIL-2492). Also die Vorschau an den oberen Rand und ehrlich den Viewport.
    await preview.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8));
    await page.waitForTimeout(400);
    buf = await page.screenshot();
  } else {
    buf = await preview.screenshot();
  }
  const file = path.join(OUT, `${c.name}-${vp.id}${label ? `-${label}` : ""}.png`);
  await writeFile(file, buf);
  return { file, buf };
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
  });
  await ctx.addInitScript(CONSENT);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`${vp.id}: ${m.text().slice(0, 200)}`); });

  for (const c of CASES) {
    const { buf } = await shoot(page, c, vp, "");
    const h = sha(buf);
    const clash = hashes.get(h);
    if (clash) console.log(`!! IDENTISCH zu ${clash}: ${c.name}-${vp.id} (Beleg wertlos)`);
    hashes.set(h, `${c.name}-${vp.id}`);
    shots.push({ case: c.name, viewport: vp.id, sha: h, bytes: buf.length });
    const s = canvasStats.at(-1);
    console.log(`shot  ${c.name.padEnd(14)} ${vp.id.padEnd(8)} sha=${h} ${String(buf.length).padStart(7)}B  canvas ${s.canvasPx.w}x${s.canvasPx.h} gemalt=${s.paintedPx} sigmaY=${s.sigmaY}`);
  }

  // Jitter-Kontrolle nur auf Desktop: dieselbe URL ein zweites Mal.
  if (!vp.isMobile) {
    const c = CASES[0];
    const { buf } = await shoot(page, c, vp, "jitter");
    const first = shots.find((s) => s.case === c.name && s.viewport === vp.id);
    const same = sha(buf) === first.sha;
    console.log(`jitter ${c.name} desktop: ${same ? "Diff 0 — Vergleiche sind belastbar" : "!! ABWEICHUNG, Screenshots beweisen nichts"}`);
    shots.push({ case: `${c.name} (jitter)`, viewport: vp.id, sha: sha(buf), bytes: buf.length, jitterClean: same });
  }
  await ctx.close();
}
await browser.close();

const summary = {
  ranAt: new Date().toISOString(),
  base: BASE,
  assets,
  assetsAllSame: assets.every((a) => a.same && a.status === 200),
  shots,
  distinctShots: hashes.size,
  totalShots: hashes.size === shots.filter((s) => !s.jitterClean).length,
  canvasStats,
  jitterClean: shots.find((s) => s.jitterClean !== undefined)?.jitterClean ?? null,
  consoleErrors,
};
await writeFile(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`\nAssets identisch: ${summary.assetsAllSame ? "5/5" : "NEIN"}`);
console.log(`Verschiedene Screenshots: ${hashes.size} / ${shots.filter((s) => s.jitterClean === undefined).length}`);
console.log(consoleErrors.length ? `console errors:\n  ${consoleErrors.join("\n  ")}` : "console errors: none");
