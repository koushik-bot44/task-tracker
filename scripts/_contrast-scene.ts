import sharp from "sharp";

const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
const INK = lum(0x16, 0x25, 0x5b), WHITE = lum(255, 255, 255);
const SCRIM = [9, 13, 38];
const over = (px: number[], a: number) => px.map((c, i) => SCRIM[i] * a + c * (1 - a));

async function check(label: string, file: string, band: [number, number, number, number], textLum: number, scrimA = 0) {
  const { width = 0, height = 0 } = await sharp(file).metadata();
  const left = Math.round(width * band[0]), top = Math.round(height * band[1]);
  const w = Math.round(width * band[2]), h = Math.round(height * band[3]);
  const { data, info } = await sharp(file).extract({ left, top, width: w, height: h }).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let worst = Infinity, sum = 0, n = 0;
  for (let i = 0; i < data.length; i += ch) {
    let px = [data[i], data[i + 1], data[i + 2]];
    if (scrimA > 0) px = over(px, scrimA);
    const bg = lum(px[0], px[1], px[2]);
    worst = Math.min(worst, contrast(textLum, bg)); sum += contrast(textLum, bg); n++;
  }
  console.log(`${label.padEnd(30)} mean ${(sum / n).toFixed(2)}:1  WORST ${worst.toFixed(2)}:1  ${worst >= 4.5 ? "PASS" : "FAIL"}`);
}

async function main() {
  const greet: [number, number, number, number] = [0.15, 0.05, 0.7, 0.06];
  const signout: [number, number, number, number] = [0.25, 0.925, 0.5, 0.04];
  const day = "records/evidence/phase44/p44-day-scene.png", night = "records/evidence/phase44/p44-night-scene.png";
  await check("day greeting (ink, no scrim)", day, greet, INK);
  await check("night greeting (white + scrim .85)", night, greet, WHITE, 0.85);
  await check("night greeting (white + scrim .7)", night, greet, WHITE, 0.7);
  await check("day sign-out (ink)", day, signout, INK);
  await check("night sign-out (white)", night, signout, WHITE);
}
main().catch((e) => { console.error(e); process.exit(1); });
