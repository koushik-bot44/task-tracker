import sharp from "sharp";

const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
// text colours over the glass panel
const FG = { day: lum(0x16, 0x25, 0x5b), night: lum(0xf4, 0xf7, 0xff) };
const SOFT = { day: lum(0x44, 0x54, 0x8a), night: lum(0xc6, 0xd0, 0xee) };

/** Sample the (text-free) panel background in a band and report worst-case contrast
    against a text colour. mode "dark" text loses most against the darkest bg pixel;
    "light" text against the lightest. */
async function band(file: string, region: [number, number, number, number]) {
  const { width = 0, height = 0 } = await sharp(file).metadata();
  const { data, info } = await sharp(file)
    .extract({ left: Math.round(width * region[0]), top: Math.round(height * region[1]), width: Math.round(width * region[2]), height: Math.round(height * region[3]) })
    .raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; const lums: number[] = [];
  for (let i = 0; i < data.length; i += ch) lums.push(lum(data[i], data[i + 1], data[i + 2]));
  return lums;
}
async function check(label: string, file: string, region: [number, number, number, number], textLum: number, mode: "dark" | "light") {
  const lums = await band(file, region);
  const worstBg = mode === "dark" ? Math.max(...lums) === 0 ? 0 : Math.min(...lums) : Math.max(...lums);
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
  const worst = contrast(textLum, worstBg), avg = contrast(textLum, mean);
  console.log(`${label.padEnd(34)} mean ${avg.toFixed(2)}:1  WORST ${worst.toFixed(2)}:1  ${worst >= 4.5 ? "PASS" : "FAIL"}`);
}

async function main() {
  const day = "records/evidence/phase45/p45-day-sample.png";
  const night = "records/evidence/phase45/p45-night-sample.png";
  // Bands over the panel where text sits (text made transparent in the sample frame):
  const tabs: [number, number, number, number] = [0.08, 0.115, 0.84, 0.05];      // tab labels
  const segTitle: [number, number, number, number] = [0.08, 0.17, 0.5, 0.02];    // "Sleep & Wake"
  const weekday: [number, number, number, number] = [0.06, 0.205, 0.88, 0.015];  // M T W T F S S
  const habitName: [number, number, number, number] = [0.08, 0.228, 0.6, 0.02];  // "In bed by 10:30 PM"
  console.log("— DAY (dark text over light glass) —");
  await check("tab labels (fg)", day, tabs, FG.day, "dark");
  await check("segment title (fg)", day, segTitle, FG.day, "dark");
  await check("habit name (fg)", day, habitName, FG.day, "dark");
  await check("weekday header (soft)", day, weekday, SOFT.day, "dark");
  console.log("— NIGHT (light text over dark glass) —");
  await check("tab labels (fg)", night, tabs, FG.night, "light");
  await check("segment title (fg)", night, segTitle, FG.night, "light");
  await check("habit name (fg)", night, habitName, FG.night, "light");
  await check("weekday header (soft)", night, weekday, SOFT.night, "light");
}
main().catch((e) => { console.error(e); process.exit(1); });
