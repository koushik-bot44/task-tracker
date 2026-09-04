/**
 * Phase 27 — generate the Orbit icon set from the pristine master
 * (public/orbit-logo-source.png): a 1254x1254 SQUARE dark-navy (#010319) app
 * icon (white central node + two nodes + concentric orbit arcs). Used AS-IS —
 * the dark logo appears in the light app too (owner choice), and the phone
 * install icon KEEPS the logo's own dark navy background.
 *
 * Square + high-res, so the "any"/apple/favicon icons are straight resizes. The
 * MASKABLE is the exception: the source's outer orbit arcs reach ~81% of the
 * half-width, so a straight 512 would put them at ~208px — just outside the
 * ~205px 80% safe-zone radius. We scale the artwork to 82% and pad the border
 * with the SAME sampled navy (#010319), so a circle/squircle crop trims navy,
 * not artwork. Run: `node scripts/gen-icons.mjs`.
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const SRC = "public/orbit-logo-source.png";
const NAVY = { r: 1, g: 3, b: 25, alpha: 1 }; // sampled corner = #010319

async function straight(size, out) {
  await sharp(SRC).resize(size, size, { fit: "cover" }).png().toFile(out);
  console.log(`${out}  ${size}x${size}  straight resize (navy bg as-is)`);
}
await straight(192, "public/icon-192.png");
await straight(512, "public/icon-512.png");
await straight(180, "public/apple-touch-icon.png");

// Maskable: artwork at 82% of the frame, remainder padded with the sampled navy.
const MASK = 512, scale = 0.82;
const inner = Math.round(MASK * scale);
const art = await sharp(SRC).resize(inner, inner, { fit: "cover" }).toBuffer();
const maskable = await sharp({ create: { width: MASK, height: MASK, channels: 4, background: NAVY } })
  .composite([{ input: art, gravity: "center" }]).png().toBuffer();
writeFileSync("public/icon-maskable-512.png", maskable);
console.log(`public/icon-maskable-512.png  ${MASK}x${MASK}  artwork ${inner}x${inner} (${scale * 100}%) centred, navy #010319 pad -> outer ring ~${(0.811 * scale * (MASK / 2)).toFixed(0)}px (safe-zone radius 205)`);

// In-app / email derivative: square, crisp (256).
await sharp(SRC).resize(256, 256, { fit: "cover" }).png().toFile("public/orbit-logo.png");
console.log(`public/orbit-logo.png  256x256  square (in-app + email badge)`);

// favicon.ico — pack 16/32/48 straight resizes (dark navy is fine in a tab).
const icoSizes = [16, 32, 48];
const entries = [];
for (const s of icoSizes) {
  const png = await sharp(SRC).resize(s, s, { fit: "cover" }).png().toBuffer();
  entries.push({ size: s, data: png });
}
writeFileSync("app/favicon.ico", buildIco(entries));
console.log(`app/favicon.ico  packed ${icoSizes.join("/")} PNGs`);

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;
  const bodies = [];
  images.forEach((img, i) => {
    const b = i * 16;
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b);
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b + 1);
    dir.writeUInt16LE(1, b + 4);
    dir.writeUInt16LE(32, b + 6);
    dir.writeUInt32LE(img.data.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += img.data.length;
    bodies.push(img.data);
  });
  return Buffer.concat([header, dir, ...bodies]);
}
