import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const OUT = "C:/Users/Besitzer/.paperclip/instances/default/projects/723a0156-47d4-4ec0-9d21-81a1cebeb182/5e251e01-8c35-4243-9a64-ebccc2ffed74/_default/bil2460-descope-screens";
await mkdir(OUT, { recursive: true });

const base = "http://localhost:3000";
const urls = [
  { name: "hub", path: "/konfigurator" },
  { name: "hose-default", path: "/konfigurator/hose" },
  { name: "hose-fabric-08", path: "/konfigurator/hose?hose=stoff-08" },
  { name: "hose-fabric-14", path: "/konfigurator/hose?hose=stoff-14" },
  { name: "muetze-default", path: "/konfigurator/muetze" },
  { name: "muetze-fabric-01", path: "/konfigurator/muetze?muetze=stoff-01" },
  { name: "muetze-fabric-15", path: "/konfigurator/muetze?muetze=stoff-15" },
];
const viewports = [
  { name: "mobile", width: 390, height: 844, deviceScaleFactor: 2 },
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1 },
];

const browser = await chromium.launch();
for (const vp of viewports) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
  });
  const page = await ctx.newPage();
  await page.goto(base + urls[0].path, { waitUntil: "networkidle", timeout: 60000 });
  const acceptAll = page.getByRole("button", { name: /Alle akzeptieren/i });
  if (await acceptAll.count()) await acceptAll.click();
  await page.waitForTimeout(400);
  for (const u of urls) {
    await page.goto(base + u.path, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(800);
    const file = `${OUT}/${vp.name}-${u.name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log("shot", file);
  }
  await ctx.close();
}
await browser.close();
