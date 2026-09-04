import sharp from "sharp";

const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
const FG = { day: lum(0x16, 0x25, 0x5b), night: lum(0xf4, 0xf7, 0xff) };
const SOFT = { day: lum(0x44, 0x54, 0x8a), night: lum(0xc6, 0xd0, 0xee) };

async function check(label: string, file: string, region: [number, number, number, number], textLum: number, mode: "day" | "night") {
  const { width = 0, height = 0 } = await sharp(file).metadata();
  const { data, info } = await sharp(file)
    .extract({ left: Math.round(width * region[0]), top: Math.round(height * region[1]), width: Math.round(width * region[2]), height: Math.round(height * region[3]) })
    .raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; let worst = Infinity, sum = 0, n = 0;
  for (let i = 0; i < data.length; i += ch) {
    const bg = lum(data[i], data[i + 1], data[i + 2]);
    worst = Math.min(worst, contrast(textLum, bg)); sum += contrast(textLum, bg); n++;
  }
  console.log(`${label.padEnd(30)} mean ${(sum / n).toFixed(2)}:1  WORST ${worst.toFixed(2)}:1  ${worst >= 4.5 ? "PASS" : "FAIL"}`);
}

async function main() {
  const day = "records/evidence/phase46/p46-day-sample.png", night = "records/evidence/phase46/p46-night-sample.png";
  // Panel bg bands (text made transparent), representative Well Being surfaces.
  const habitsCard: [number, number, number, number] = [0.21, 0.41, 0.18, 0.14];  // Weekly-habits header/rows
  const tabs: [number, number, number, number] = [0.2, 0.17, 0.15, 0.03];         // Summary/Tracker toggle
  const tasksCard: [number, number, number, number] = [0.6, 0.42, 0.2, 0.03];     // Tasks header
  const weightNum: [number, number, number, number] = [0.6, 0.9, 0.1, 0.03];      // "44 kg"
  for (const [scene, file, fg, soft] of [["DAY", day, FG.day, SOFT.day], ["NIGHT", night, FG.night, SOFT.night]] as const) {
    console.log(`— ${scene} —`);
    await check("tab labels (fg)", file, tabs, fg, scene === "DAY" ? "day" : "night");
    await check("habits card (fg)", file, habitsCard, fg, scene === "DAY" ? "day" : "night");
    await check("habits card (soft)", file, habitsCard, soft, scene === "DAY" ? "day" : "night");
    await check("tasks card (fg)", file, tasksCard, fg, scene === "DAY" ? "day" : "night");
    await check("weight number (fg)", file, weightNum, fg, scene === "DAY" ? "day" : "night");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
