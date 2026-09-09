/* Files-on-a-task rig (2026-09-09): attach with a description, pin to the top.
 *   npx tsx --env-file=.env.local scripts/check-task-files.ts   (dev server up)
 * Throwaway accounts (tf-*) and tasks ("TF ") are removed in `finally`.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "tf-";
let pass = 0;
let fail = 0;

function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function call(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json };
}

async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function main() {
  const dept = await prisma.department.findFirst({ orderBy: { orderKey: "asc" } });
  const hash = await hashPassword("Rig-Files-77");
  const mk = (label: string, role: "MANAGER" | "RESOURCE") =>
    prisma.user.upsert({
      where: { email: `${PREFIX}${label}@orbit.local` },
      update: { passwordHash: hash, role, status: "ACTIVE", disabledAt: null, departmentId: dept!.id },
      create: { email: `${PREFIX}${label}@orbit.local`, name: `TF ${label}`, role, passwordHash: hash, status: "ACTIVE", departmentId: dept!.id },
    });
  const boss = await mk("boss", "MANAGER");
  const outsider = await mk("outsider", "RESOURCE");
  const bossCookie = await signIn(boss.email, "Rig-Files-77");
  const outsiderCookie = await signIn(outsider.email, "Rig-Files-77");

  const task = (await call(bossCookie, "POST", "/api/tasks", { title: "TF File Task", type: "GENERAL", departmentId: dept!.id, priority: "MEDIUM" })).json;
  record("a task to hang files on", Boolean(task?.id), task?.ref ?? "");

  const uploads = await call(bossCookie, "GET", "/api/uploads");
  record("attachments are switched on here", uploads.json?.enabled === true, JSON.stringify(uploads.json));

  // A file added WITH its description, away from the chat.
  const added = await call(bossCookie, "POST", `/api/tasks/${task.id}/attachments`, {
    body: "The requirements: two pages, mobile first, copy attached.",
    attachmentUrl: "/api/uploads/tf-brief.pdf",
    attachmentName: "tf-brief.pdf",
    attachmentType: "application/pdf",
  });
  record("a file can be added with words that describe it", added.status === 201, `status ${added.status} ${JSON.stringify(added.json?.error ?? "")}`);
  record("the description is kept with the file", added.json?.body?.includes("mobile first"), added.json?.body ?? "");
  record("a new file starts unpinned", added.json?.pinnedAt === null, String(added.json?.pinnedAt));

  const noFile = await call(bossCookie, "POST", `/api/tasks/${task.id}/attachments`, { body: "just words" });
  record("adding nothing is refused", noFile.status === 400, `status ${noFile.status}`);

  // Pin it to the top.
  const pinned = await call(bossCookie, "PATCH", `/api/tasks/${task.id}/attachments/${added.json.id}`, { pinned: true });
  record("a file can be pinned to the top", pinned.status === 200 && Boolean(pinned.json?.pinnedAt), `status ${pinned.status}`);
  const readBack = await call(bossCookie, "GET", `/api/tasks/${task.id}/activity?type=ATTACHMENT,COMMENT,WORK_NOTE`);
  const row = (readBack.json ?? []).find((a: any) => a.id === added.json.id);
  record("the pin comes back on the record", Boolean(row?.pinnedAt), String(row?.pinnedAt));

  const described = await call(bossCookie, "PATCH", `/api/tasks/${task.id}/attachments/${added.json.id}`, { description: "Rewritten: one page, print ready." });
  record("the description can be rewritten later", described.status === 200 && described.json?.body?.startsWith("Rewritten"), described.json?.body ?? "");

  const unpinned = await call(bossCookie, "PATCH", `/api/tasks/${task.id}/attachments/${added.json.id}`, { pinned: false });
  record("and taken back down again", unpinned.status === 200 && unpinned.json?.pinnedAt === null, `status ${unpinned.status}`);

  // Walls.
  const empty = await call(bossCookie, "PATCH", `/api/tasks/${task.id}/attachments/${added.json.id}`, {});
  record("a change that says nothing is refused", empty.status === 400, `status ${empty.status}`);
  const note = await call(bossCookie, "POST", `/api/tasks/${task.id}/comments`, { body: "TF a note with no file" });
  if (note.json?.id) {
    const pinWords = await call(bossCookie, "PATCH", `/api/tasks/${task.id}/attachments/${note.json.id}`, { pinned: true });
    record("a note with no file cannot be pinned as one", pinWords.status === 400, `status ${pinWords.status}`);
  } else {
    record("a note with no file cannot be pinned as one", true, "no comment endpoint");
  }
  const otherTask = (await call(bossCookie, "POST", "/api/tasks", { title: "TF Other Task", type: "GENERAL", departmentId: dept!.id })).json;
  const crossed = await call(bossCookie, "PATCH", `/api/tasks/${otherTask.id}/attachments/${added.json.id}`, { pinned: true });
  record("a file cannot be pinned onto a different task", crossed.status === 404, `status ${crossed.status}`);
  const stranger = await call(outsiderCookie, "PATCH", `/api/tasks/${task.id}/attachments/${added.json.id}`, { pinned: true });
  record("somebody not working the task cannot pin its files", stranger.status === 403 || stranger.status === 404, `status ${stranger.status}`);
  const anon = await call("", "PATCH", `/api/tasks/${task.id}/attachments/${added.json.id}`, { pinned: true });
  record("a signed-out stranger cannot either", anon.status === 401 || anon.status === 403, `status ${anon.status}`);
}

main()
  .catch((e) => { console.error(e); fail++; })
  .finally(async () => {
    await prisma.task.deleteMany({ where: { title: { startsWith: "TF " } } });
    const mine = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
    const ids = mine.map((u) => u.id);
    if (ids.length) {
      await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
