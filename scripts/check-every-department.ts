/* Every department, from every side (2026-09-09).
 *   npx tsx --env-file=.env.local scripts/check-every-department.ts   (dev server up)
 *
 * For each department it signs in as its head, its lead and two of its people
 * and walks the day: raise work, hand it to somebody, hand it to a second
 * person, pick it up, talk on it, attach a file with its description, pin that
 * file, resolve and close — then checks the walls hold from the next department
 * along. Anything it makes ("ED ") is removed in `finally`.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PASSWORD = "orbit123";
let pass = 0;
let fail = 0;
const failures: string[] = [];

function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else { fail++; failures.push(`${name}${detail ? ` (${detail})` : ""}`); }
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
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

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  if (!res.ok) return "";
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function upload(cookie: string, name: string, text: string, type = "text/plain") {
  const form = new FormData();
  form.append("file", new File([text], name, { type }));
  const res = await fetch(`${BASE}/api/uploads`, { method: "POST", headers: { cookie }, body: form });
  return res.ok ? ((await res.json()) as { url: string; name: string; type: string }) : null;
}

async function main() {
  const departments = await prisma.department.findMany({ where: { name: { not: "Self" } }, orderBy: { orderKey: "asc" } });
  const outsiders: { deptName: string; cookie: string }[] = [];
  const madeTasks: string[] = [];

  for (const dept of departments) {
    console.log(`\n── ${dept.name} ──────────────────────────────────────────`);
    const staff = await prisma.user.findMany({
      where: { departmentId: dept.id, disabledAt: null, status: "ACTIVE", role: { notIn: ["PERSON", "ADMIN"] }, passwordHash: { not: null } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    // Prefer the seeded accounts: their password is known. A real person's
    // account is left alone — the rig must never guess at one.
    const seeded = (u: { email: string }) => u.email.startsWith("staff-");
    const byRole = (role: string) => staff.filter((u) => u.role === role).sort((a, b) => Number(seeded(b)) - Number(seeded(a)));
    const head = byRole("HOD")[0];
    const lead = byRole("TEAM_LEAD")[0];
    const members = byRole("RESOURCE").filter(seeded);
    if (!head || !lead || members.length < 2) {
      record("has a head, a lead and two people", false, `${staff.length} usable accounts`);
      continue;
    }
    record("has a head, a lead and two people", true, `${staff.length} accounts`);

    const headC = await signIn(head.email);
    const leadC = await signIn(lead.email);
    const oneC = await signIn(members[0].email);
    if (!headC || !leadC || !oneC) { record("everyone can sign in", false, "a sign-in failed"); continue; }
    record("everyone can sign in", true);
    outsiders.push({ deptName: dept.name, cookie: oneC });

    /* the head raises work and hands it over */
    const raised = await call(headC, "POST", "/api/tasks", {
      title: `ED ${dept.name} check`, type: "GENERAL", priority: "HIGH",
      departmentId: dept.id, assigneeId: members[0].id,
      descriptionMd: "Raised by the rig to walk this department end to end.",
    });
    record("the head can raise work and hand it over", raised.status === 201, `status ${raised.status}`);
    if (raised.status !== 201) continue;
    const task = raised.json;
    madeTasks.push(task.id);

    /* and gives it to a second person */
    const shared = await call(headC, "POST", `/api/tasks/${task.id}/people`, { assigneeIds: [members[1].id] });
    record("the same task can go to a second person", shared.status === 201 && shared.json?.added === 1, `status ${shared.status}`);
    const seen = await call(headC, "GET", `/api/work/${task.number}`);
    record("the record names the other person", (seen.json?.alsoWith ?? []).length === 1, (seen.json?.alsoWith ?? []).map((p: any) => p.name).join(", "));
    record("…and names nobody twice", new Set((seen.json?.alsoWith ?? []).map((p: any) => p.id)).size === (seen.json?.alsoWith ?? []).length);

    /* the overview says so too */
    const overview = await call(headC, "GET", `/api/work?q=ED%20${encodeURIComponent(dept.name)}`);
    const row = (overview.json?.items ?? []).find((t: any) => t.id === task.id);
    record("the overview shows it is shared", (row?.alsoWith ?? []).length === 1, `${(row?.alsoWith ?? []).length} others on the row`);

    /* the person picks it up */
    const mine = await call(oneC, "GET", "/api/work?mine=assigned");
    record("it lands in that person's own work", (mine.json?.items ?? []).some((t: any) => t.id === task.id), `${mine.json?.total} rows`);
    const started = await call(oneC, "POST", `/api/tasks/${task.id}/transition`, { to: "IN_PROGRESS" });
    record("they can start it", started.status === 200 || started.status === 201, `status ${started.status}`);

    /* they talk on it */
    const note = await call(oneC, "POST", `/api/tasks/${task.id}/comments`, { body: "ED On it — first pass done." });
    record("they can write a note on it", note.status === 201, `status ${note.status}`);
    const heard = await call(headC, "GET", `/api/tasks/${task.id}/activity`);
    record("the head can read it", (heard.json ?? []).some((a: any) => a.body?.includes("first pass")), `${(heard.json ?? []).length} entries`);
    const reply = await call(headC, "POST", `/api/tasks/${task.id}/comments`, { body: "ED Noted, carry on." });
    record("the head can answer", reply.status === 201, `status ${reply.status}`);

    /* they attach a file, with what it is */
    const file = await upload(oneC, `ed-${dept.name.toLowerCase().replace(/[^a-z]+/g, "-")}.txt`, `Notes for ${dept.name}\n\nWhat was done and what is left.\n`);
    record("a file can be uploaded", Boolean(file), file?.name ?? "upload failed");
    if (file) {
      const attached = await call(oneC, "POST", `/api/tasks/${task.id}/attachments`, {
        body: "What was done, and the two things still open.",
        attachmentUrl: file.url, attachmentName: file.name, attachmentType: file.type,
      });
      record("…attached with its description", attached.status === 201, `status ${attached.status}`);
      if (attached.status === 201) {
        const pinned = await call(oneC, "PATCH", `/api/tasks/${task.id}/attachments/${attached.json.id}`, { pinned: true });
        record("…and pinned to the top", pinned.status === 200 && Boolean(pinned.json?.pinnedAt), `status ${pinned.status}`);
        const back = await fetch(BASE + file.url, { headers: { cookie: oneC } });
        record("…and the file actually opens", back.ok, `status ${back.status}`);
      }
    }

    /* the lead sees the department's work */
    const leadSees = await call(leadC, "GET", "/api/work?mine=department");
    record("the lead sees their department's work", (leadSees.json?.items ?? []).some((t: any) => t.id === task.id), `${leadSees.json?.total} rows`);

    /* it gets finished */
    const resolved = await call(oneC, "POST", `/api/tasks/${task.id}/transition`, { to: "RESOLVED", resolutionCode: "COMPLETED", resolutionNote: "ED done" });
    record("the holder can resolve it", resolved.status === 200 || resolved.status === 201, `status ${resolved.status}`);
    const closed = await call(headC, "POST", `/api/tasks/${task.id}/transition`, { to: "CLOSED" });
    record("the head can close it", closed.status === 200 || closed.status === 201, `status ${closed.status}`);

    /* and somebody can be taken back off it */
    const removed = await call(headC, "DELETE", `/api/tasks/${task.id}/people`, { assigneeId: members[1].id });
    record("a person can be taken off it again", removed.status === 200 && removed.json?.removed === 1, `status ${removed.status}`);
    const after = await call(headC, "GET", `/api/work/${task.number}`);
    record("…and the record stops naming them", (after.json?.alsoWith ?? []).length === 0, `${(after.json?.alsoWith ?? []).length} left`);
  }

  /* ---- the walls between departments ---- */
  console.log(`\n── the walls between departments ────────────────────────`);
  for (let i = 0; i < outsiders.length; i++) {
    const here = outsiders[i];
    const next = outsiders[(i + 1) % outsiders.length];
    if (here.deptName === next.deptName) continue;
    const theirDept = departments.find((d) => d.name === next.deptName)!;
    const theirs = await prisma.task.findFirst({ where: { departmentId: theirDept.id, deletedAt: null, title: { startsWith: "ED " } }, select: { id: true } });
    if (!theirs) continue;
    const peek = await call(here.cookie, "GET", `/api/tasks/${theirs.id}`);
    record(`${here.deptName} cannot open ${next.deptName}'s task`, peek.status === 404 || peek.status === 403, `status ${peek.status}`);
  }

  void madeTasks;
}

main()
  .catch((e) => { console.error(e); fail++; })
  .finally(async () => {
    await prisma.taskActivity.deleteMany({ where: { task: { title: { startsWith: "ED " } } } });
    await prisma.task.deleteMany({ where: { title: { startsWith: "ED " } } });
    console.log(`\n${pass} passed, ${fail} failed`);
    if (failures.length) console.log(`\nwhat failed:\n  ${failures.join("\n  ")}`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
