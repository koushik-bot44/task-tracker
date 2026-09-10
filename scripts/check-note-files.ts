/* Several files on a note, each opened beside the page (2026-09-10).
 *   npm run check:note-files   (dev server up, restarted after the note_attachments migration)
 *
 * On a project note, a milestone note and a task comment the CEO attaches three
 * files at once through the paper-clip — a PDF, a picture and a Word document —
 * sees them on the note, opens each in the viewer without anything
 * downloading, steps between them with the arrows and the ← → keys, downloads
 * from inside the viewer, and closes it with Esc, which leaves the notes open.
 * A chip can be taken off, and a refused file says so on its own chip without
 * holding up the others. A workbook and a CSV show as tables, slides as a
 * download card. A phone (390px) gets the viewer full screen; a desktop
 * (1280px) gets a panel on the right. Someone who can't see the project or the
 * task gets nothing for the files; deleting a note, or its milestone, lets its
 * files go. No console errors along the way.
 *
 * Leaves no trace: its notes, files, milestone, account and bells are removed
 * and the task's "updated" time is put back. Evidence: records/evidence/note-files/
 */
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const DIR = "records/evidence/note-files";
const PASSWORD = "orbit123";
const OUTSIDER = "nfx-outsider@orbit.local";
const OUTSIDER_PASSWORD = "Rig-Note-Files-77";
/** Names unique to this run, so a leftover from an earlier one is never mistaken for it. */
const RUN = Date.now().toString(36).slice(-5);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const lines: string[] = [];
let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`;
  lines.push(line);
  console.log(line);
}

async function until(check: () => Promise<boolean>, timeout = 20000): Promise<boolean> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/* ---- files, made on the spot ---- */

type Fixture = { name: string; mimeType: string; buffer: Buffer };
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A .zip with its entries stored as they are — all a .docx or an .xlsx needs to be read. */
function zip(entries: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [path, text] of Object.entries(entries)) {
    const name = Buffer.from(path, "utf8");
    const data = Buffer.from(text, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const dir = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

/** A one-page PDF that says `text` (letters and spaces only). */
function pdf(text: string): Buffer {
  const content = `BT /F1 20 Tf 40 120 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 240] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** A Word document with one paragraph. */
function docx(text: string): Buffer {
  return zip({
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": `${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  });
}

/** A workbook with one sheet, "Budget". */
function xlsx(rows: (string | number)[][]): Buffer {
  const strings: string[] = [];
  const cell = (value: string | number, ref: string) => {
    if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
    let i = strings.indexOf(value);
    if (i < 0) i = strings.push(value) - 1;
    return `<c r="${ref}" t="s"><v>${i}</v></c>`;
  };
  const sheetRows = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, `${String.fromCharCode(65 + c)}${r + 1}`)).join("")}</row>`).join("");
  const width = Math.max(...rows.map((r) => r.length));
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return zip({
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `${XML}<workbook ${ns} xmlns:r="${rel}"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `${XML}<worksheet ${ns}><dimension ref="A1:${String.fromCharCode(64 + width)}${rows.length}"/><sheetData>${sheetRows}</sheetData></worksheet>`,
    "xl/sharedStrings.xml": `${XML}<sst ${ns} count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`,
    "xl/styles.xml": `${XML}<styleSheet ${ns}><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`,
  });
}

/** A small picture, drawn by the browser. */
async function picture(browser: Browser, colour: string): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: 240, height: 160 } });
  await page.setContent(`<body style="margin:0"><div style="width:240px;height:160px;background:linear-gradient(135deg,${colour},#f8fafc)"></div></body>`);
  const png = await page.locator("div").screenshot();
  await page.close();
  return png;
}

/** The three files the owner named: a PDF, a picture and a Word document. */
async function three(browser: Browser, surface: string, colour: string): Promise<Fixture[]> {
  return [
    { name: `nfx-${RUN}-${surface}-brief.pdf`, mimeType: "application/pdf", buffer: pdf(`NFX ${surface} brief`) },
    { name: `nfx-${RUN}-${surface}-photo.png`, mimeType: "image/png", buffer: await picture(browser, colour) },
    { name: `nfx-${RUN}-${surface}-notes.docx`, mimeType: DOCX, buffer: docx(`NFX ${surface} notes: the viewer reads Word documents.`) },
  ];
}

/* ---- the API ---- */

async function signIn(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return res.ok ? (res.headers.get("set-cookie") ?? "").split(";")[0] : null;
}
async function call(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json };
}
async function status(cookie: string | null, url: string): Promise<number> {
  const res = await fetch(BASE + url, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  await res.arrayBuffer().catch(() => undefined);
  return res.status;
}

/* ---- the screen ---- */

type Session = { context: BrowserContext; page: Page; errors: string[]; downloads: string[] };

async function session(browser: Browser, phone: boolean): Promise<Session> {
  const context = await browser.newContext(
    phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } },
  );
  const page = await context.newPage();
  const errors: string[] = [];
  const downloads: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', "founder@orbit.local");
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  return { context, page, errors, downloads };
}

/** Picks files through the paper-clip in `scope`, then waits until no chip is still uploading. */
async function pick(s: Session, scope: Locator, files: Fixture[]): Promise<boolean> {
  const chooser = s.page.waitForEvent("filechooser");
  await scope.getByRole("button", { name: "Attach a file", exact: true }).first().click();
  const fc = await chooser;
  await fc.setFiles(files);
  await until(async () => (await scope.getByRole("progressbar").count()) === 0);
  return fc.isMultiple();
}

/** Sends the note and waits for every file to show on it. */
async function send(scope: Locator, body: string, names: string[]): Promise<boolean> {
  await scope.getByRole("textbox", { name: "Add a note" }).fill(body);
  await scope.getByRole("button", { name: "Send" }).click();
  return until(async () => {
    for (const n of names) if (!(await scope.getByRole("button", { name: `Open ${n}` }).first().isVisible())) return false;
    return true;
  });
}

async function thumbnailShows(scope: Locator, name: string): Promise<boolean> {
  return until(async () => scope.getByRole("button", { name: `Open ${name}` }).first().locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0));
}

const opened = (l: Locator, timeout = 15000) => l.waitFor({ timeout }).then(() => true).catch(() => false);

/**
 * Opens the first of a note's three files and walks the viewer: the PDF drawn,
 * Next to the picture, → to the document, ← back, → → round to the start,
 * Download from inside, Esc to close. `still` must still be open after Esc.
 */
async function walk(s: Session, label: string, scope: Locator, names: string[], still: Locator | null, shot: string) {
  const { page, downloads } = s;
  const before = downloads.length;
  const width = page.viewportSize()?.width ?? 0;
  const at = (i: number) => page.getByRole("dialog", { name: `${names[i]}, file ${i + 1} of 3` });
  const says = (i: number) => at(i).getByText(new RegExp(`^${i + 1} of 3( · .+)?$`));

  await scope.getByRole("button", { name: `Open ${names[0]}` }).first().click();
  const first = at(0);
  const open = await opened(first);
  record(`${label}: a tap opens the file in the viewer, saying "1 of 3"`, open && (await says(0).isVisible()));
  if (!open) return;
  const box = await first.boundingBox();
  const where = box ? `x ${Math.round(box.x)}, width ${Math.round(box.width)} of ${width}` : "no box";
  if (width >= 768) record(`${label}: on a desktop the viewer is a panel on the right`, Boolean(box && box.x > 200 && Math.abs(box.x + box.width - width) <= 2), where);
  else record(`${label}: on a phone the viewer fills the screen`, Boolean(box && box.x <= 1 && Math.abs(box.width - width) <= 2), where);
  const drawn = await until(async () => (await first.locator('canvas[aria-label="Page 1 of 1"]').count()) === 1 && !(await first.getByText("Opening…").isVisible()), 45000);
  record(`${label}: the PDF is drawn in the page by the viewer`, drawn && (await first.locator("iframe").count()) === 0);
  const link = first.getByRole("link", { name: "Download" });
  record(`${label}: Download sits in the viewer, for this file`, (await link.getAttribute("download")) === names[0] && /^\/api\/uploads\//.test((await link.getAttribute("href")) ?? ""));
  await first.screenshot({ path: `${DIR}/${shot}-1-pdf.png` });

  await first.getByRole("button", { name: "Next file" }).click();
  const pictured = await until(async () => at(1).locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), 15000);
  record(`${label}: Next shows the picture, "2 of 3"`, pictured && (await says(1).isVisible()));
  await at(1).screenshot({ path: `${DIR}/${shot}-2-picture.png` });

  await page.keyboard.press("ArrowRight");
  const read = await until(async () => /the viewer reads Word documents/.test(await at(2).locator(".docx-wrapper").innerText()), 45000);
  record(`${label}: → shows the Word document laid out in the page, "3 of 3"`, read && (await says(2).isVisible()));
  await at(2).screenshot({ path: `${DIR}/${shot}-3-docx.png` });

  await page.keyboard.press("ArrowLeft");
  const back = await opened(at(1), 5000);
  await page.keyboard.press("ArrowRight");
  await opened(at(2), 5000);
  await page.keyboard.press("ArrowRight");
  const round = await opened(at(0), 5000);
  record(`${label}: ← steps back, and → past the last comes round to the first`, back && round);
  record(`${label}: nothing downloads just from looking`, downloads.length === before, downloads.slice(before).join(", "));

  const got = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
  await at(0).getByRole("link", { name: "Download" }).click();
  const download = await got;
  record(`${label}: Download in the viewer saves the file under its own name`, download?.suggestedFilename() === names[0], download?.suggestedFilename() ?? "no download");

  await page.keyboard.press("Escape");
  const closed = await until(async () => (await page.getByRole("dialog", { name: /, file \d of 3$/ }).count()) === 0, 5000);
  record(`${label}: Esc closes the viewer${still ? " and leaves the notes open" : ""}`, closed && (still ? await still.isVisible() : true));
}

/* ---- the run ---- */

const start = new Date();
let browser: Browser | null = null;
let ceo: string | null = null;
let taskId: string | null = null;
let taskUpdatedAt: Date | null = null;
let milestoneId: string | null = null;
let reviewEventId: string | null = null;

async function main() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("A Blob token is set, so this check would upload to a real Blob store. Unset it and run again.");
    process.exit(1);
  }
  ceo = await signIn("founder@orbit.local", PASSWORD);
  record("the CEO signs in", Boolean(ceo));
  if (!ceo) return;

  const task = await prisma.task.findFirst({
    where: { deletedAt: null, parentId: null, project: { status: "ACTIVE" } },
    orderBy: { number: "asc" },
    select: { id: true, number: true, updatedAt: true, project: { select: { id: true, slug: true, name: true, departmentId: true } } },
  });
  const project = task?.project ?? null;
  record("a project with a task to try this on", Boolean(task && project), project ? `TASK${String(task!.number).padStart(7, "0")}` : "none");
  if (!task || !project) return;
  taskId = task.id;
  taskUpdatedAt = task.updatedAt;

  const milestoneName = `NFX files ${RUN}`;
  const made = await call(ceo, "POST", "/api/milestones", { projectId: project.id, name: milestoneName, reviewDate: new Date(Date.now() + 45 * 86_400_000).toISOString() });
  milestoneId = made.json?.id ?? null;
  record("a milestone to leave notes on", made.status === 201 && Boolean(milestoneId), `status ${made.status} ${made.json?.error ?? ""}`);
  if (!milestoneId) return;
  reviewEventId = (await prisma.milestone.findUnique({ where: { id: milestoneId }, select: { reviewEventId: true } }))?.reviewEventId ?? null;

  const other = await prisma.department.findFirst({ where: project.departmentId ? { id: { not: project.departmentId } } : {}, orderBy: { orderKey: "asc" } });
  const hash = await hashPassword(OUTSIDER_PASSWORD);
  await prisma.user.upsert({
    where: { email: OUTSIDER },
    update: { passwordHash: hash, role: "RESOURCE", status: "ACTIVE", disabledAt: null, departmentId: other?.id ?? null },
    create: { email: OUTSIDER, name: "NFX Outsider", role: "RESOURCE", passwordHash: hash, status: "ACTIVE", departmentId: other?.id ?? null },
  });

  browser = await chromium.launch();
  const desk = await session(browser, false);
  const { page } = desk;

  /* ---- a project note ---- */
  await page.goto(`${BASE}/project/${project.slug}`);
  await page.getByRole("button", { name: /Project notes/ }).first().click({ timeout: 90000 });
  const drawer = page.getByRole("dialog", { name: "Project notes" });
  await drawer.waitFor();
  const projectFiles = await three(browser, "project", "#4f46e5");
  const refused: Fixture = { name: `nfx-${RUN}-tool.exe`, mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") };
  record("project note: the paper-clip takes several files at once", await pick(desk, drawer, [...projectFiles, refused]));
  const chips = drawer.getByRole("list", { name: "4 files to send" });
  record("project note: each picked file waits on its own chip", await chips.isVisible());
  const refusedChip = chips.locator("li", { hasText: refused.name });
  record(
    "project note: a refused file says so on its own chip, with a way to try it again",
    await until(async () => refusedChip.getByRole("button", { name: `Try ${refused.name} again` }).isVisible(), 10000),
    (await refusedChip.innerText().catch(() => "")).replace(/\s+/g, " ").trim(),
  );
  record("project note: …and the others finished uploading", await until(async () => (await chips.locator("li", { hasText: "Uploading" }).count()) === 0, 10000));
  await drawer.getByRole("textbox", { name: "Add a note" }).fill(`NFX project files ${RUN}`);
  await drawer.getByRole("button", { name: "Send" }).click();
  await page.waitForTimeout(1000);
  const heldBack = await prisma.comment.count({ where: { targetType: "PROJECT", targetId: project.id, body: `NFX project files ${RUN}` } });
  record("project note: nothing is sent while one of its files failed", heldBack === 0 && (await chips.isVisible()));
  await refusedChip.getByRole("button", { name: `Remove ${refused.name}` }).click();
  record("project note: a chip can be taken off", await drawer.getByRole("list", { name: "3 files to send" }).isVisible());
  record("project note: sent, each file shows on the note", await send(drawer, `NFX project files ${RUN}`, projectFiles.map((f) => f.name)));
  let projectNote = null as Awaited<ReturnType<typeof noteWithFiles>>;
  await until(async () => Boolean((projectNote = await noteWithFiles("PROJECT", project.id, `NFX project files ${RUN}`))?.attachments.length));
  record("project note: stored with its three files, in the order picked", projectNote?.attachments.map((a) => a.name).join(",") === projectFiles.map((f) => f.name).join(","), `${projectNote?.attachments.length ?? 0} files`);
  record("project note: the picture shows as a thumbnail", await thumbnailShows(drawer, projectFiles[1].name));
  await drawer.locator("li", { hasText: `NFX project files ${RUN}` }).first().screenshot({ path: `${DIR}/project-note.png` });
  await walk(desk, "project note", drawer, projectFiles.map((f) => f.name), drawer, "project");

  /* ---- spreadsheets, CSV and slides ---- */
  const sheets: Fixture[] = [
    { name: `nfx-${RUN}-budget.xlsx`, mimeType: XLSX, buffer: xlsx([["Item", "Cost"], ["Chairs", 1200], ["Desks", 3400]]) },
    { name: `nfx-${RUN}-people.csv`, mimeType: "text/csv", buffer: Buffer.from('Name,Team\n"Asha, K",Design\nRavi,Ops\n') },
    { name: `nfx-${RUN}-deck.pptx`, mimeType: PPTX, buffer: zip({ "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>` }) },
  ];
  await pick(desk, drawer, sheets);
  record("sheets note: sent, each file shows on the note", await send(drawer, `NFX sheets ${RUN}`, sheets.map((f) => f.name)));
  await drawer.getByRole("button", { name: `Open ${sheets[0].name}` }).first().click();
  const book = page.getByRole("dialog", { name: `${sheets[0].name}, file 1 of 3` });
  record(
    "an Excel workbook shows as a table in the viewer",
    await until(async () => (await book.getByRole("cell", { name: "Chairs", exact: true }).count()) > 0 && (await book.getByRole("cell", { name: "3400", exact: true }).count()) > 0, 30000),
  );
  await book.screenshot({ path: `${DIR}/sheets-1-xlsx.png` });
  await page.keyboard.press("ArrowRight");
  const csv = page.getByRole("dialog", { name: `${sheets[1].name}, file 2 of 3` });
  record("a CSV shows as a table, a quoted comma kept in its cell", await until(async () => (await csv.getByRole("cell", { name: "Asha, K", exact: true }).count()) > 0, 20000));
  await csv.screenshot({ path: `${DIR}/sheets-2-csv.png` });
  await page.keyboard.press("ArrowRight");
  const deck = page.getByRole("dialog", { name: `${sheets[2].name}, file 3 of 3` });
  record("slides say a preview isn't available, and offer the download", await until(async () => (await deck.getByText(/Preview not available/).isVisible()) && (await deck.getByRole("link", { name: "Download" }).count()) === 2, 10000));
  await deck.screenshot({ path: `${DIR}/sheets-3-slides.png` });
  await page.keyboard.press("Escape");

  /* ---- a milestone note ---- */
  const pickNotes = drawer.getByRole("combobox", { name: "Notes for" });
  record("project notes offer each milestone's notes", await until(async () => (await pickNotes.locator("option", { hasText: milestoneName }).count()) > 0, 15000));
  await pickNotes.selectOption({ label: milestoneName });
  record("…and choosing one shows that milestone's notes", await until(async () => drawer.getByRole("heading", { name: `${milestoneName} notes` }).isVisible(), 10000));
  const milestoneFiles = await three(browser, "milestone", "#ea580c");
  record("milestone note: the paper-clip takes several files at once", await pick(desk, drawer, milestoneFiles));
  record("milestone note: sent, each file shows on the note", await send(drawer, `NFX milestone files ${RUN}`, milestoneFiles.map((f) => f.name)));
  let milestoneNote = null as Awaited<ReturnType<typeof noteWithFiles>>;
  await until(async () => Boolean((milestoneNote = await noteWithFiles("MILESTONE", milestoneId!, `NFX milestone files ${RUN}`))?.attachments.length));
  record("milestone note: stored on the milestone with its three files", milestoneNote?.attachments.length === 3, `${milestoneNote?.attachments.length ?? 0} files`);
  record("milestone note: the picture shows as a thumbnail", await thumbnailShows(drawer, milestoneFiles[1].name));
  await walk(desk, "milestone note", drawer, milestoneFiles.map((f) => f.name), drawer, "milestone");

  /* ---- a task comment, on the task's record ---- */
  await page.goto(`${BASE}/work/${task.number}`);
  const body = page.locator("body");
  await body.getByRole("button", { name: "Attach a file", exact: true }).first().waitFor({ timeout: 90000 });
  const taskFiles = await three(browser, "task", "#16a34a");
  record("task comment: the paper-clip takes several files at once", await pick(desk, body, taskFiles));
  record("task comment: all three wait to be sent", await body.getByRole("list", { name: "3 files to send" }).isVisible());
  record("task comment: sent, each file shows on the note", await send(body, `NFX task files ${RUN}`, taskFiles.map((f) => f.name)));
  let taskNote = null as Awaited<ReturnType<typeof activityWithFiles>>;
  await until(async () => Boolean((taskNote = await activityWithFiles(task.id, `NFX task files ${RUN}`))?.attachments.length));
  record("task comment: stored on the task with its three files, in order", taskNote?.attachments.map((a) => a.name).join(",") === taskFiles.map((f) => f.name).join(","), `${taskNote?.attachments.length ?? 0} files`);
  record("task comment: the picture shows as a thumbnail", await thumbnailShows(body, taskFiles[1].name));
  await walk(desk, "task comment", body, taskFiles.map((f) => f.name), null, "task");

  await page.getByRole("tab", { name: /^Attachments/ }).or(page.getByRole("button", { name: /^Attachments/ })).first().click();
  await page.getByRole("button", { name: taskFiles[2].name, exact: true }).first().click();
  const fromTab = page.getByRole("dialog", { name: `${taskFiles[2].name}, file 3 of 3` });
  record("task Attachments tab: a file's name opens it in the viewer, its note's other files a step away", await opened(fromTab, 10000));
  await page.keyboard.press("Escape");

  /* ---- an old task link: the old panel is gone, the full record opens (owner, 2026-09-11) ---- */
  await page.goto(`${BASE}/?task=${task.id}`);
  const landed = await until(async () => new URL(page.url()).pathname === `/work/${task.number}`, 30000);
  const inRecord = page.getByRole("button", { name: `Open ${taskFiles[0].name}` }).first();
  const shown = landed && (await opened(inRecord, 90000));
  record("an old task link opens the full record, with the comment's files", shown, new URL(page.url()).pathname);
  if (shown) {
    await inRecord.click();
    const viewer = page.getByRole("dialog", { name: `${taskFiles[0].name}, file 1 of 3` });
    record("…a file opens in the viewer", await opened(viewer, 10000));
    await page.keyboard.press("Escape");
    record("…and Esc closes it", await until(async () => (await viewer.count()) === 0, 5000));
  }

  /* ---- a phone ---- */
  const phone = await session(browser, true);
  await phone.page.goto(`${BASE}/project/${project.slug}`);
  await phone.page.getByRole("button", { name: /Project notes/ }).first().click({ timeout: 90000 });
  const phoneDrawer = phone.page.getByRole("dialog", { name: "Project notes" });
  await phoneDrawer.getByRole("button", { name: `Open ${projectFiles[0].name}` }).first().waitFor({ timeout: 30000 }).catch(() => undefined);
  await walk(phone, "phone, project note", phoneDrawer, projectFiles.map((f) => f.name), phoneDrawer, "phone-project");
  await phone.page.goto(`${BASE}/work/${task.number}`);
  const phoneBody = phone.page.locator("body");
  await phoneBody.getByRole("button", { name: `Open ${taskFiles[0].name}` }).first().waitFor({ timeout: 90000 }).catch(() => undefined);
  await walk(phone, "phone, task comment", phoneBody, taskFiles.map((f) => f.name), null, "phone-task");

  // The program was refused on purpose; its 415 is the only error expected.
  const expected = (e: string) => /status of 415/.test(e);
  const deskErrors = desk.errors.filter((e) => !expected(e));
  const phoneErrors = phone.errors.filter((e) => !expected(e));
  record("desktop: no console errors", deskErrors.length === 0, deskErrors.slice(0, 3).join(" | ").slice(0, 400));
  record("phone: no console errors", phoneErrors.length === 0, phoneErrors.slice(0, 3).join(" | ").slice(0, 400));
  await browser.close();
  browser = null;

  /* ---- who can open the files ---- */
  const outsider = await signIn(OUTSIDER, OUTSIDER_PASSWORD);
  record("someone outside the project signs in", Boolean(outsider));
  if (outsider && projectNote && milestoneNote && taskNote) {
    const notesSeen = await call(outsider, "GET", `/api/comments?targetType=PROJECT&targetId=${project.id}`);
    record("…who can't read the project's notes", notesSeen.status === 403 || notesSeen.status === 404, `status ${notesSeen.status}`);
    for (const [label, files] of [["project note", projectNote.attachments], ["milestone note", milestoneNote.attachments], ["task comment", taskNote.attachments]] as const) {
      const mine = await Promise.all(files.map((f) => status(ceo, f.url)));
      const theirs = await Promise.all(files.map((f) => status(outsider, f.url)));
      const nobody = await Promise.all(files.map((f) => status(null, f.url)));
      record(`${label}: its files open for someone who can see it`, mine.every((s) => s === 200), mine.join(","));
      record(`${label}: someone who can't see it gets nothing for them`, theirs.every((s) => s === 404), theirs.join(","));
      record(`${label}: nobody signed out gets them`, nobody.every((s) => s !== 200), nobody.join(","));
    }
  }

  /* ---- deleting lets files go ---- */
  const gone = async (urls: string[]) => (await prisma.storedFile.count({ where: { id: { in: urls.map((u) => u.split("/").pop()!) } } })) === 0;
  if (taskNote) {
    const del = await call(ceo, "DELETE", `/api/comments/${taskNote.id}`);
    const urls = taskNote.attachments.map((a) => a.url);
    record("deleting a task comment deletes its files", del.status === 200 && (await prisma.commentAttachment.count({ where: { activityId: taskNote.id } })) === 0 && (await gone(urls)), `status ${del.status}`);
    record("…and they no longer open", (await status(ceo, urls[0])) === 404);
  }
  if (projectNote) {
    const del = await call(ceo, "DELETE", `/api/comments/${projectNote.id}`);
    record("deleting a project note deletes its files", del.status === 200 && (await gone(projectNote.attachments.map((a) => a.url))), `status ${del.status}`);
  }
  if (milestoneNote) {
    const del = await call(ceo, "DELETE", `/api/milestones/${milestoneId}`);
    if (del.status === 200) milestoneId = null;
    record("deleting a milestone deletes its notes' files", del.status === 200 && (await gone(milestoneNote.attachments.map((a) => a.url))), `status ${del.status}`);
  }
}

function noteWithFiles(targetType: "PROJECT" | "MILESTONE", targetId: string, body: string) {
  return prisma.comment.findFirst({ where: { targetType, targetId, body }, include: { attachments: { orderBy: { orderKey: "asc" } } } });
}
function activityWithFiles(taskId: string, body: string) {
  return prisma.taskActivity.findFirst({ where: { taskId, body }, include: { attachments: { orderBy: { orderKey: "asc" } } } });
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    await browser?.close().catch(() => undefined);
    if (milestoneId && ceo) await call(ceo, "DELETE", `/api/milestones/${milestoneId}`).catch(() => undefined);
    if (milestoneId) await prisma.milestone.deleteMany({ where: { id: milestoneId } }).catch(() => undefined);
    if (reviewEventId) {
      await prisma.notification.deleteMany({ where: { eventId: reviewEventId } }).catch(() => undefined);
      await prisma.calendarEvent.deleteMany({ where: { id: reviewEventId } }).catch(() => undefined);
    }
    await prisma.comment.deleteMany({ where: { createdAt: { gte: start }, body: { startsWith: "NFX" } } });
    if (taskId) {
      await prisma.taskActivity.deleteMany({ where: { taskId, createdAt: { gte: start }, body: { startsWith: "NFX" } } });
      await prisma.notification.deleteMany({ where: { createdAt: { gte: start }, taskId } });
      if (taskUpdatedAt) await prisma.task.update({ where: { id: taskId }, data: { updatedAt: taskUpdatedAt } });
    }
    await prisma.notification.deleteMany({ where: { createdAt: { gte: start }, OR: [{ title: { contains: "NFX" } }, { body: { contains: "NFX" } }] } }).catch(() => undefined);
    await prisma.storedFile.deleteMany({ where: { createdAt: { gte: start }, name: { startsWith: "nfx-" } } });
    await prisma.user.deleteMany({ where: { email: OUTSIDER } }).catch(() => undefined);
    writeFileSync(`${DIR}/check-note-files.txt`, lines.join("\n") + `\n\n${pass} passed, ${fail} failed\n`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
