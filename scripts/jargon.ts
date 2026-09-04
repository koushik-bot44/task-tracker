/**
 * Jargon grep (restructure, L3): the words a non-technical person should
 * never see on a screen. Scans every JSX/TSX string in app/ and components/
 * (the Well Being surface and My notes are included — the rule is global).
 * Exit 1 on any hit so the check is a build gate, not a suggestion.
 *
 *   npx tsx scripts/jargon.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DIRS = ["app", "components"];
const WORDS = [
  /\bbacklog\b/i,
  /\bgates?\b/i,
  /\bverified\b/i,
  /\bchangelog\b/i,
  /\bfocus\b(?! ?(?:-visible|:|\(|\)|ed|es|ing|Capture|Ring|\.|,|;))/,
  /\bkanban\b/i,
  /\bhealth\b/i,
  /\ball-hands\b/i,
  /\bsprint\b/i,
];

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Only what a person could read: JSX text and string literals, not identifiers or comments. */
function visibleStrings(src: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const lines = src.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, "").replace(/\{\/\*.*?\*\/\}/g, "");
    // JSX text between tags
    for (const m of line.matchAll(/>([^<>{}]+)</g)) out.push({ line: i + 1, text: m[1] });
    // string literals in props / calls that are shown: label, title, placeholder, message, aria-label, content, name
    for (const m of line.matchAll(/(?:label|title|placeholder|message|aria-label|content|heading|body|subtitle|hint|empty)\s*[=:]\s*["'`]([^"'`]+)["'`]/g)) {
      out.push({ line: i + 1, text: m[1] });
    }
  });
  return out;
}

const files = DIRS.flatMap((d) => walk(join(ROOT, d), []));
// The Well Being family feature keeps its own vocabulary and is untouched by the restructure.
const EXEMPT = [/components\/routine\//, /app\/person\//, /app\/\(app\)\/routine\//];
let hits = 0;
for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (EXEMPT.some((r) => r.test(rel))) continue;
  const src = readFileSync(file, "utf8");
  for (const s of visibleStrings(src)) {
    for (const w of WORDS) {
      if (w.test(s.text)) {
        hits++;
        console.log(`  HIT ${rel}:${s.line}  ${w}  "${s.text.trim()}"`);
      }
    }
  }
}
console.log(`\nfiles scanned: ${files.length}, jargon hits: ${hits}`);
if (hits > 0) process.exit(1);
console.log("PASS — no jargon on screen.");
