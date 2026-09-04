/**
 * Renders the app's PWA icons from the Sunny SaaS brand — no placeholder
 * squares. The mark is Orbit's own glyph: a white core (the brand dot that
 * sits beside the "Orbit" wordmark) with an orbit ring and a planet on it, on
 * the primary background (#2f68f0 = --primary). Rendered with Playwright (a dev
 * dependency), so the output is a real rasterised PNG.
 *
 *   npx tsx scripts/gen-icons.ts
 *
 * Emits public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png.
 * The maskable draws the glyph smaller, inside the 80% safe zone, so a round or
 * squircle OS mask never clips it. Hex here is intentional and documented — it
 * mirrors the CSS tokens; this file is not shipped to the client.
 */
import { chromium } from "playwright";
import path from "node:path";
import { mkdirSync } from "node:fs";

const PRIMARY = "#2f68f0"; // --primary
const ON = "#ffffff"; // --on-primary

/** The glyph, scaled to a 512 canvas; `ring` sets how big it draws. */
function svg(ring: number): string {
  const sw = ring * 0.135; // ring stroke
  const core = ring * 0.36; // central dot
  const planet = ring * 0.23; // planet on the ring
  const px = ring * Math.cos((-40 * Math.PI) / 180);
  const py = ring * Math.sin((-40 * Math.PI) / 180);
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="${PRIMARY}"/>
    <g transform="translate(256,256)">
      <ellipse rx="${ring}" ry="${ring * 0.9}" fill="none" stroke="${ON}" stroke-width="${sw}"
               transform="rotate(-20)" opacity="0.92"/>
      <circle r="${core}" fill="${ON}"/>
      <circle cx="${px}" cy="${py}" r="${planet}" fill="${ON}"/>
    </g>
  </svg>`;
}

async function render(page: import("playwright").Page, size: number, ring: number, file: string) {
  const markup = svg(ring).replace('width="512" height="512"', `width="${size}" height="${size}"`);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;padding:0">${markup}</body></html>`,
  );
  await page.waitForTimeout(80);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`  ${path.basename(file)}  ${size}x${size}  ring=${ring}`);
}

async function main() {
  mkdirSync("public", { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await render(page, 192, 150, path.join("public", "icon-192.png"));
  await render(page, 512, 150, path.join("public", "icon-512.png"));
  // iOS home-screen icon (no transparency, iOS rounds the corners itself).
  await render(page, 180, 140, path.join("public", "apple-touch-icon.png"));
  // Maskable: smaller glyph (ring 112 of 256) keeps everything inside the 80%
  // safe zone so a circular mask cannot clip the planet.
  await render(page, 512, 112, path.join("public", "icon-maskable-512.png"));
  await browser.close();
  console.log("icons written to public/");
}

main().catch((e) => { console.error(e); process.exit(1); });
