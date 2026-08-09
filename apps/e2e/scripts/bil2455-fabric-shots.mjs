import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const OUT = "C:/Users/Besitzer/.paperclip/instances/default/projects/723a0156-47d4-4ec0-9d21-81a1cebeb182/5e251e01-8c35-4243-9a64-ebccc2ffed74/_default/bil2455-fabric-screens";
await mkdir(OUT, { recursive: true });

const base = "http://localhost:3000";
const urls = [
  { name: "hose-default", path: "/konfigurator/hose" },
  { name: "hose-fabric-unicorn-purple", path: "/konfigurator/hose?hose=stoff-01" },
  { name: "hose-fabric-rainbow-denim", path: "/konfigurator/hose?hose=stoff-16" },
  { name: "hose-fabric-plus-buendchen", path: "/konfigurator/hose?hose=stoff-04&buendchen=terracotta" },
  { name: "body-fabric-unicorn-blue", path: "/konfigurator/body?hauptteil=stoff-04" },
  { name: "muetze-fabric-rainbow", path: "/konfigurator/muetze?muetze=stoff-16" },
  { name: "turban-fabric-purple", path: "/konfigurator/turban?turban=stoff-01" },
  { name: "dreieckstuch-fabric", path: "/konfigurator/dreieckstuch?tuch=stoff-14" },
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
  // Pre-consent so the cookie banner is dismissed for every shot in this ctx.
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
