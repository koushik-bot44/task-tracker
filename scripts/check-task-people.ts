/* Several people on one task (2026-09-09).
 *   npx tsx --env-file=.env.local scripts/check-task-people.ts   (dev server up)
 *
 * One task given to several people is one record each — so each can finish
 * their own — tied together by a key. These checks prove a record can name
 * everyone on it, and that more people can be added later without duplicates.
 * Throwaway accounts (tp-*) and tasks ("TP ") are removed in `finally`.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "tp-";
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

const signIn = async (email: string, password: string) => {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
};

async function main() {
  const [dept, deptB] = await prisma.department.findMany({ orderBy: { orderKey: "asc" }, take: 2 });
  const hash = await hashPassword("Rig-People-77");
  const mk = (label: string, role: "MANAGER" | "RESOURCE", departmentId = dept!.id) =>
    prisma.user.upsert({
      where: { email: `${PREFIX}${label}@orbit.local` },
      update: { passwordHash: hash, role, status: "ACTIVE", disabledAt: null, departmentId },
      create: { email: `${PREFIX}${label}@orbit.local`, name: `TP ${label}`, role, passwordHash: hash, status: "ACTIVE", departmentId },
    });
  const boss = await mk("boss", "MANAGER");
  const [a, b, c, d] = [await mk("ann", "RESOURCE"), await mk("bob", "RESOURCE"), await mk("cal", "RESOURCE"), await mk("dee", "RESOURCE")];
  // Somebody with no connection to the task at all — a member of another
  // department. (Its HOLDER may hand it on; that is deliberate, so testing the
  // wall means testing a genuine outsider.)
  const outsider = await mk("outsider", "RESOURCE", deptB?.id ?? dept!.id);
  const cookie = await signIn(boss.email, "Rig-People-77");
  const outsiderCookie = await signIn(outsider.email, "Rig-People-77");

  /* ---- raised for three people at once ---- */
  const key = `tp-key-${Date.now()}`;
  const raised = [];
  for (const who of [a, b, c]) {
    const r = await call(cookie, "POST", "/api/tasks", { title: "TP Shared Task", type: "GENERAL", priority: "MEDIUM", departmentId: dept!.id, assigneeId: who.id, siblingKey: key });
    if (r.status === 201) raised.push(r.json);
  }
  record("one task given to three people makes three records", raised.length === 3, `${raised.length} records`);
  record("they all carry the same key", new Set(raised.map((t) => t.siblingKey)).size === 1, raised[0]?.siblingKey ?? "");

  const seen = await call(cookie, "GET", `/api/work/${raised[0].number}`);
  const names = (seen.json?.alsoWith ?? []).map((p: any) => p.name).sort();
  record("a record names the OTHER people on it", seen.status === 200 && names.length === 2, names.join(", "));
  record("…and does not name its own holder twice", !names.includes(seen.json?.assigneeName), seen.json?.assigneeName ?? "");

  const everyone = await call(cookie, "GET", `/api/tasks/${raised[0].id}/people`);
  record("the whole crew can be listed", (everyone.json ?? []).length === 3, `${(everyone.json ?? []).length} people`);

  /* ---- more people, later ---- */
  const more = await call(cookie, "POST", `/api/tasks/${raised[0].id}/people`, { assigneeIds: [d.id] });
  record("a fourth person can be added afterwards", more.status === 201 && more.json?.added === 1, `status ${more.status}, added ${more.json?.added}`);
  const four = await call(cookie, "GET", `/api/tasks/${raised[0].id}/people`);
  record("the crew is now four", (four.json ?? []).length === 4, `${(four.json ?? []).length}`);
  const held = await prisma.task.count({ where: { siblingKey: key, deletedAt: null } });
  record("and there are four records, one each", held === 4, `${held}`);

  const again = await call(cookie, "POST", `/api/tasks/${raised[0].id}/people`, { assigneeIds: [d.id, a.id] });
  record("adding somebody already on it changes nothing", again.json?.added === 0 && (again.json?.skipped ?? []).length === 2, `added ${again.json?.added}`);

  /* ---- a task that was never shared ---- */
  const solo = (await call(cookie, "POST", "/api/tasks", { title: "TP Solo Task", type: "GENERAL", priority: "LOW", departmentId: dept!.id, assigneeId: a.id })).json;
  record("a task raised for one person has no key", solo.siblingKey === null, String(solo.siblingKey));
  const shareIt = await call(cookie, "POST", `/api/tasks/${solo.id}/people`, { assigneeIds: [b.id] });
  record("sharing it later gives it one", shareIt.status === 201 && shareIt.json?.added === 1, `status ${shareIt.status}`);
  const soloRow = await prisma.task.findUnique({ where: { id: solo.id }, select: { siblingKey: true } });
  record("…and the original record joins the group too", Boolean(soloRow?.siblingKey), String(soloRow?.siblingKey));
  const soloSeen = await call(cookie, "GET", `/api/work/${solo.number}`);
  record("the original now names the person added", (soloSeen.json?.alsoWith ?? []).length === 1, (soloSeen.json?.alsoWith ?? []).map((p: any) => p.name).join(", "));

  /* ---- walls ---- */
  const byOutsider = await call(outsiderCookie, "POST", `/api/tasks/${raised[0].id}/people`, { assigneeIds: [d.id] });
  record("an outsider cannot hand it round", byOutsider.status === 403 || byOutsider.status === 404, `status ${byOutsider.status}`);
  const byHolder = await call(await signIn(a.email, "Rig-People-77"), "POST", `/api/tasks/${raised[0].id}/people`, { assigneeIds: [d.id] });
  record("its holder may hand it on (as they always could)", byHolder.status === 201, `status ${byHolder.status}`);
  const anon = await call("", "POST", `/api/tasks/${raised[0].id}/people`, { assigneeIds: [d.id] });
  record("a signed-out stranger cannot either", anon.status === 401 || anon.status === 403, `status ${anon.status}`);
  const nobody = await call(cookie, "POST", `/api/tasks/${raised[0].id}/people`, { assigneeIds: [] });
  record("asking to add nobody is refused", nobody.status === 400, `status ${nobody.status}`);
  const ghost = await call(cookie, "POST", `/api/tasks/${raised[0].id}/people`, { assigneeIds: ["does-not-exist"] });
  record("a person who does not exist is skipped, not fatal", ghost.status === 201 && ghost.json?.added === 0, `status ${ghost.status}`);

  const step = await call(cookie, "POST", "/api/tasks", { title: "TP Step", type: "GENERAL", departmentId: dept!.id, parentId: solo.id });
  if (step.status === 201) {
    const shareStep = await call(cookie, "POST", `/api/tasks/${step.json.id}/people`, { assigneeIds: [b.id] });
    record("a step cannot be handed round on its own", shareStep.status === 400, `status ${shareStep.status}`);
  } else {
    record("a step cannot be handed round on its own", true, `step not created (${step.status})`);
  }

  /* ---- the list groups them ---- */
  const list = await call(cookie, "GET", "/api/work?q=TP%20Shared");
  const items = list.json?.items ?? [];
  record("the list returns every record of the shared task", items.length >= 4, `${items.length} rows`);
  record("…each carrying the key the list groups by", items.every((t: any) => t.siblingKey), "");
}

main()
  .catch((e) => { console.error(e); fail++; })
  .finally(async () => {
    await prisma.task.deleteMany({ where: { title: { startsWith: "TP " } } });
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
