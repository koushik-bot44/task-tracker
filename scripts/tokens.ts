/**
 * Token integrity proof.
 *
 * Batch 2 shipped four dead `var(--teal)` references to production because the
 * grep proof only ever matched Tailwind class names, never raw CSS references.
 * This closes that hole permanently: it resolves EVERY `var(--x)` in the repo
 * against the tokens actually declared in globals.css, and fails the build if
 * any reference dangles.
 *
 * Run: npx tsx scripts/tokens.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const CSS = join(ROOT, "app", "globals.css");
const SCAN_DIRS = ["app", "components", "lib"];
const EXTS = [".ts", ".tsx", ".css"];

/** Tokens declared anywhere in globals.css (`--name:` at a declaration site). */
function declaredTokens(): Set<string> {
  const css = readFileSync(CSS, "utf8");
  const out = new Set<string>();
  for (const m of css.matchAll(/(^|[;{\s])(--[a-z0-9-]+)\s*:/gi)) out.add(m[2]);
  return out;
}

function walk(dir: string, hit: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, hit);
    else if (EXTS.some((e) => entry.endsWith(e))) hit.push(full);
  }
  return hit;
}

const declared = declaredTokens();
const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d), []));

type Dangler = { file: string; line: number; token: string; text: string };
const dangling: Dangler[] = [];

for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((text, i) => {
    for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      const token = m[1];
      // A var() with a fallback is legitimate even if undeclared.
      if (declared.has(token)) continue;
      dangling.push({
        file: relative(ROOT, file).replace(/\\/g, "/"),
        line: i + 1,
        token,
        text: text.trim(),
      });
    }
  });
}

/**
 * Second check, same failure mode: `bg-muted/45`.
 *
 * Tailwind cannot inject an alpha channel into a variable holding a hex
 * string, so it emits NO rule — the class is silently dropped and the element
 * renders with nothing. Eighteen of these were live at once; the most visible
 * turned the gate cluster's unpassed dots invisible, so the chip read as an
 * empty input box. Nothing in tsc, lint or the contrast audit can see it.
 *
 * Any colour token used with a /NN modifier is therefore a build failure.
 * Translucency belongs in its own token (--scrim, --dot-off), not a modifier.
 */
const TOKEN_COLORS = [...declared]
  .map((t) => t.slice(2))
  .filter((n) => !n.startsWith("r-") && !n.startsWith("shadow") && n !== "drop-glow");
const UTIL = "bg|text|border|ring|from|to|via|divide|outline|decoration|fill|stroke";
const alphaRe = new RegExp(`\\b(${UTIL})-(${TOKEN_COLORS.join("|")})\\/[0-9]+`, "g");

type Alpha = { file: string; line: number; cls: string };
const alphas: Alpha[] = [];

for (const file of files) {
  if (file.endsWith(".css")) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((text, i) => {
    for (const m of text.matchAll(alphaRe)) {
      alphas.push({
        file: relative(ROOT, file).replace(/\\/g, "/"),
        line: i + 1,
        cls: m[0],
      });
    }
  });
}

console.log(`tokens declared in app/globals.css : ${declared.size}`);
console.log(`files scanned                      : ${files.length}`);
console.log(`dangling var() references          : ${dangling.length}`);
console.log(`alpha modifiers on token colours   : ${alphas.length}`);

if (dangling.length > 0 || alphas.length > 0) {
  console.log("");
  for (const d of dangling) {
    console.log(`  FAIL ${d.file}:${d.line}  ${d.token}`);
    console.log(`       ${d.text}`);
  }
  for (const a of alphas) {
    console.log(`  FAIL ${a.file}:${a.line}  ${a.cls} emits no CSS`);
  }
  console.log("\nFAIL — dead token references and/or alpha modifiers present.");
  process.exit(1);
}

console.log("\nPASS — every var(--x) resolves, no alpha modifiers on tokens.");
