/* Attachments everywhere — and working without a Blob store (2026-09-10).
 *   npx tsx --env-file=.env.local scripts/check-attachments.ts
 *   (dev server up, restarted after the stored_files migration)
 *
 * The live site has no Vercel Blob store, so every paper-clip hid itself there
 * and the option read as removed. Files now go to the database when Blob isn't
 * connected. Over the API: the limit is reported; a picture, a document and a
 * web page are stored and come back — the picture opens in the browser, the
 * page downloads, so it can never run inside Orbit; programs and oversized
 * files are refused; nobody signed out, and no Well Being person, can open one;
 * a file sent in a task's chat reaches the person holding the task; a task
 * comment and a project note carry files too. On screen: the paper-clip in the
 * task chat and a file really sent from it, the Attachments tab, the task
 * drawer's comments, project notes, the project logo, and the chat on a phone.
 *
 * Leaves no trace: its notes, files and bells are removed and the task's
 * "updated" time is put back. Evidence: records/evidence/attachments/
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const DIR = "records/evidence/attachments";
const PASSWORD = "orbit123";
const MB = 1024 * 1024;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** A one-pixel picture. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
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

async function signIn(email: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  return res.ok ? (res.headers.get("set-cookie") ?? "").split(";")[0] : null;
}
async function call(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json };
}
async function upload(cookie: string, name: string, type: string, bytes: Buffer) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  const res = await fetch(`${BASE}/api/uploads`, { method: "POST", headers: { cookie }, body: form });
  let json: any = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json };
}
async function fetchFile(cookie: string | null, url: string) {
  const res = await fetch(BASE + url, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    type: res.headers.get("content-type") ?? "",
    disposition: res.headers.get("content-disposition") ?? "",
    nosniff: res.headers.get("x-content-type-options") === "nosniff",
    csp: res.headers.get("content-security-policy") ?? "",
    bytes,
  };
}

const start = new Date();
let taskId: string | null = null;
let taskUpdatedAt: Date | null = null;

async function main() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("A Blob token is set, so this check would upload to a real Blob store. Unset it and run again.");
    process.exit(1);
  }
  const ceo = await signIn("founder@orbit.local");
  const wellBeing = await signIn("arjun@orbit.local");
  record("the CEO signs in", Boolean(ceo));
  if (!ceo) return;

  /* ---- storing and serving ---- */
  const limits = await call(ceo, "GET", "/api/uploads");
  record("attachments are on, with the database store's 4 MB limit", limits.json?.enabled === true && limits.json?.maxBytes === 4 * MB, JSON.stringify(limits.json));

  const png = await upload(ceo, "atx-photo.png", "image/png", PNG);
  const pngUrl: string | null = png.json?.url ?? null;
  record("a picture is stored", png.status === 201 && /^\/api\/uploads\/c[a-z0-9]{20,40}$/.test(pngUrl ?? ""), `status ${png.status}, ${pngUrl ?? png.json?.error}`);
  const row = pngUrl ? await prisma.storedFile.findUnique({ where: { id: pngUrl.split("/").pop()! }, select: { size: true } }) : null;
  record("…in the database, not on this laptop's disk", row?.size === PNG.length, `${row?.size ?? "no"} bytes stored`);
  if (pngUrl) {
    const back = await fetchFile(ceo, pngUrl);
    record("it comes back byte for byte", back.status === 200 && back.bytes.equals(PNG), `status ${back.status}, ${back.bytes.length} bytes`);
    record("…and opens in the browser as a picture", back.type === "image/png" && back.disposition.startsWith("inline") && back.nosniff, `${back.type}; ${back.disposition}`);
    const out = await fetchFile(null, pngUrl);
    record("nobody signed out can open it", out.status >= 300 && !out.bytes.equals(PNG), `status ${out.status}`);
    if (wellBeing) {
      const wb = await fetchFile(wellBeing, pngUrl);
      record("a Well Being person can't open it", wb.status === 403, `status ${wb.status}`);
    }
  }

  const page = await upload(ceo, "atx-page.html", "text/html", Buffer.from("<script>document.title='ran'</script>"));
  record("a web page can be attached", page.status === 201, `status ${page.status}`);
  if (page.json?.url) {
    const back = await fetchFile(ceo, page.json.url);
    record("…but it downloads instead of opening, so it can never run inside Orbit", back.type === "application/octet-stream" && back.disposition.startsWith("attachment") && back.nosniff, `${back.type}; ${back.disposition}`);
  }
  const doc = await upload(ceo, "atx-brief.docx", DOCX, Buffer.from("PK atx brief"));
  const docUrl: string | null = doc.json?.url ?? null;
  const docBack = docUrl ? await fetchFile(ceo, docUrl) : null;
  record("a document downloads under its own name", docBack?.status === 200 && docBack.disposition.includes("atx-brief.docx"), docBack ? docBack.disposition : `status ${doc.status}`);

  const svg = await upload(ceo, "atx-logo.svg", "image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>'));
  const svgBack = svg.json?.url ? await fetchFile(ceo, svg.json.url) : null;
  record("an SVG goes as a picture, so a logo shows, but downloads on its own, sandboxed", svgBack?.type === "image/svg+xml" && svgBack.disposition.startsWith("attachment") && /sandbox/.test(svgBack.csp), svgBack ? `${svgBack.type}; ${svgBack.disposition}` : `status ${svg.status}`);
  const longName = `atx-${"a".repeat(192)}.exe${"b".repeat(10)}.pdf`;
  const long = await upload(ceo, longName, "application/pdf", Buffer.from("%PDF-1.4 atx"));
  const longBack = long.json?.url ? await fetchFile(ceo, long.json.url) : null;
  record("a very long name keeps its own extension, so it can't end up as .exe", Boolean(longBack?.disposition.endsWith(".pdf")), longBack ? longBack.disposition.slice(-16) : `status ${long.status}`);

  const exe = await upload(ceo, "atx-tool.exe", "application/x-msdownload", Buffer.from("MZ"));
  record("a program is refused", exe.status === 415, `status ${exe.status}`);
  const big = await upload(ceo, "atx-big.bin", "application/octet-stream", Buffer.alloc(4 * MB + 1));
  record("a file over 4 MB is refused, saying why", big.status === 413 && /4 MB/.test(big.json?.error ?? ""), `status ${big.status}, ${big.json?.error}`);
  const missing = await fetchFile(ceo, "/api/uploads/cnotarealfile0000000000000");
  record("an address that holds no file says so", missing.status === 404, `status ${missing.status}`);

  /* ---- a file reaches the people on the work ---- */
  const task = await prisma.task.findFirst({
    where: { deletedAt: null, projectId: { not: null }, NOT: { title: { startsWith: "WFX" } }, assignee: { email: { startsWith: "staff-" }, status: "ACTIVE", disabledAt: null } },
    orderBy: { number: "asc" },
    select: { id: true, number: true, updatedAt: true, projectId: true, assignee: { select: { email: true } }, project: { select: { slug: true } } },
  });
  record("a project task held by someone else to try this on", Boolean(task), task ? `TASK${String(task.number).padStart(7, "0")}` : "none");
  if (!task || !pngUrl || !docUrl) return;
  taskId = task.id;
  taskUpdatedAt = task.updatedAt;

  const chat = await call(ceo, "POST", `/api/tasks/${task.id}/comments`, { body: "ATX here is the photo", attachmentUrl: pngUrl, attachmentName: "atx-photo.png", attachmentType: "image/png", mentions: [] });
  record("the CEO sends a picture in the task's chat", chat.status === 200 || chat.status === 201, `status ${chat.status} ${chat.json?.error ?? ""}`);
  const holder = task.assignee?.email ? await signIn(task.assignee.email) : null;
  if (holder) {
    const stream = await call(holder, "GET", `/api/tasks/${task.id}/activity?type=COMMENT`);
    const seen = Array.isArray(stream.json) && stream.json.some((a: any) => a.attachmentUrl === pngUrl);
    record("the person holding the task sees it in the chat", seen, `status ${stream.status}`);
    const opened = await fetchFile(holder, pngUrl);
    record("…and can open it", opened.status === 200 && opened.bytes.equals(PNG), `status ${opened.status}`);
  } else {
    record("the person holding the task signs in", false, "demo password refused");
  }

  const drawer = await call(ceo, "POST", "/api/comments", { targetType: "TASK", targetId: task.id, body: "ATX from the task drawer", attachmentUrl: docUrl, attachmentName: "atx-brief.docx", attachmentType: DOCX });
  record("a task comment from the drawer carries a file", drawer.status === 200 || drawer.status === 201, `status ${drawer.status} ${drawer.json?.error ?? ""}`);
  const note = await call(ceo, "POST", "/api/comments", { targetType: "PROJECT", targetId: task.projectId, body: "ATX project brief", attachmentUrl: docUrl, attachmentName: "atx-brief.docx", attachmentType: DOCX });
  const notes = await call(ceo, "GET", `/api/comments?targetType=PROJECT&targetId=${task.projectId}`);
  record("a project note carries a file", (note.status === 200 || note.status === 201) && Array.isArray(notes.json) && notes.json.some((n: any) => n.attachmentUrl === docUrl), `status ${note.status}`);

  /* ---- on screen ---- */
  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1360, height: 950 } });
  await desk.goto(`${BASE}/login`);
  await desk.fill('input[type="email"]', "founder@orbit.local");
  await desk.fill('input[type="password"]', PASSWORD);
  await desk.click('button[type="submit"]');
  await desk.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 });

  await desk.goto(`${BASE}/work/${task.number}`);
  await desk.waitForLoadState("domcontentloaded");
  await desk.waitForTimeout(3500);
  const attach = desk.getByRole("button", { name: "Attach a file" }).first();
  record("the task chat offers Attach, named on screen", (await attach.isVisible()) && /Attach/.test(await attach.innerText()), (await attach.innerText().catch(() => "")).trim());
  const chooser = desk.waitForEvent("filechooser");
  await attach.click();
  await (await chooser).setFiles({ name: "atx-screen.png", mimeType: "image/png", buffer: PNG });
  await desk.waitForTimeout(2000);
  record("a picture picked in the chat waits to be sent", await desk.getByText("atx-screen.png").first().isVisible().catch(() => false));
  await desk.getByRole("textbox", { name: "Add a note" }).fill("ATX sent from the task chat");
  await desk.getByRole("button", { name: "Send" }).click();
  await desk.waitForTimeout(3000);
  const sent = await prisma.taskActivity.findFirst({ where: { taskId: task.id, createdAt: { gte: start }, attachmentName: "atx-screen.png" }, select: { attachmentUrl: true } });
  const sentBack = sent?.attachmentUrl ? await fetchFile(ceo, sent.attachmentUrl) : null;
  record("sending it from the chat stores the file on the task, and it opens", sentBack?.status === 200 && sentBack.bytes.equals(PNG), sent?.attachmentUrl ?? "not stored");
  await desk.screenshot({ path: `${DIR}/1-task-chat.png`, fullPage: true });

  const filesTab = desk.getByRole("tab", { name: /^Attachments/ }).or(desk.getByRole("button", { name: /^Attachments/ })).first();
  await filesTab.click();
  await desk.waitForTimeout(1500);
  record("the Attachments tab offers a file with its description", await desk.getByRole("button", { name: "Attach a file with its description" }).isVisible());
  await desk.screenshot({ path: `${DIR}/2-task-attachments-tab.png`, fullPage: true });

  await desk.goto(`${BASE}/?task=${task.id}`);
  await desk.waitForLoadState("domcontentloaded");
  await desk.waitForTimeout(3500);
  const drawerAttach = await desk.getByRole("button", { name: "Attach a file" }).count();
  record("the task drawer's comments offer Attach", drawerAttach > 0, `${drawerAttach} found`);
  await desk.screenshot({ path: `${DIR}/3-task-drawer.png`, fullPage: true });

  await desk.goto(`${BASE}/project/${task.project!.slug}`);
  await desk.waitForLoadState("domcontentloaded");
  await desk.waitForTimeout(3000);
  await desk.getByRole("button", { name: /Project notes/ }).first().click();
  await desk.waitForTimeout(1500);
  const notesDrawer = desk.getByRole("dialog", { name: "Project notes" });
  record("project notes offer Attach", await notesDrawer.getByRole("button", { name: "Attach a file" }).isVisible());
  await notesDrawer.screenshot({ path: `${DIR}/4-project-notes.png` });
  await desk.keyboard.press("Escape");
  await desk.waitForTimeout(800);
  await desk.getByRole("button", { name: "Change the project's look" }).click();
  await desk.waitForTimeout(1200);
  // The visible button, not the file input behind it that carries the same name.
  record("a project's look offers a logo upload", await desk.locator("button", { hasText: /Upload a logo|Change logo/ }).first().isVisible());
  await desk.screenshot({ path: `${DIR}/5-project-look.png` });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await phone.goto(`${BASE}/login`);
  await phone.fill('input[type="email"]', "founder@orbit.local");
  await phone.fill('input[type="password"]', PASSWORD);
  await phone.click('button[type="submit"]');
  await phone.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 });
  await phone.goto(`${BASE}/work/${task.number}`);
  await phone.waitForTimeout(3500);
  const phoneAttach = phone.getByRole("button", { name: "Attach a file" }).first();
  await phoneAttach.scrollIntoViewIfNeeded().catch(() => {});
  record("on a phone the chat offers Attach and the camera", (await phoneAttach.isVisible()) && (await phone.getByRole("button", { name: "Take a photo" }).first().isVisible()));
  await phone.screenshot({ path: `${DIR}/6-task-chat-phone.png` });
  await browser.close();
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    await prisma.taskActivity.deleteMany({ where: { createdAt: { gte: start }, OR: [{ body: { startsWith: "ATX" } }, { attachmentName: { startsWith: "atx-" } }] } });
    await prisma.comment.deleteMany({ where: { createdAt: { gte: start }, body: { startsWith: "ATX" } } });
    if (taskId) await prisma.notification.deleteMany({ where: { createdAt: { gte: start }, taskId } });
    await prisma.storedFile.deleteMany({ where: { createdAt: { gte: start }, name: { startsWith: "atx-" } } });
    if (taskId && taskUpdatedAt) await prisma.task.update({ where: { id: taskId }, data: { updatedAt: taskUpdatedAt } });
    writeFileSync(`${DIR}/check-attachments.txt`, lines.join("\n") + `\n\n${pass} passed, ${fail} failed\n`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
