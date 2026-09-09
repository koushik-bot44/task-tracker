/* Multi-email rig (2026-09-09): one person, several addresses, end to end.
 *   npx tsx --env-file=.env.local scripts/check-multi-email.ts   (dev server up)
 *
 * Walks the whole path the owner asked about: a project in a department invites
 * somebody who is not on Orbit yet — name + one email, or name + several — the
 * invite is issued, they set their own password on the link, and then they sign
 * in with ANY of their addresses. It also says plainly whether mail can leave
 * this machine. Throwaway accounts (me-*) and rows are removed in `finally`.
 */
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import { hashPassword } from "../lib/password";
import { issueInvite } from "../lib/invite";
import { sendEmail } from "../lib/email";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "me-";
/** Passes the accept route's "less predictable" guard. */
const NEW_PASSWORD = "Kestrel-Wharf-42";
let pass = 0;
let fail = 0;

function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function call(cookie: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] };
}

const signIn = (email: string, password: string) => call(null, "POST", "/api/auth", { email, password });

async function main() {
  const dept = await prisma.department.findFirst({ orderBy: { orderKey: "asc" } });
  if (!dept) throw new Error("no department on the clone");

  // The rig brings its own manager, so it depends on nobody else's account.
  const hash = await hashPassword("Rig-Manager-77");
  const manager = await prisma.user.upsert({
    where: { email: `${PREFIX}manager@orbit.local` },
    update: { passwordHash: hash, role: "MANAGER", status: "ACTIVE", disabledAt: null, departmentId: dept.id },
    create: { email: `${PREFIX}manager@orbit.local`, name: "ME Manager", role: "MANAGER", passwordHash: hash, status: "ACTIVE", departmentId: dept.id },
  });
  const signedIn = await signIn(manager.email, "Rig-Manager-77");
  record("a manager signs in", signedIn.status === 200, `status ${signedIn.status}`);
  const boss = signedIn.cookie;

  /* ---- 1. can mail leave this machine at all? ------------------------- */
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  const configured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && EMAIL_FROM);
  record("SMTP is configured", configured, configured ? `${SMTP_USER} via ${SMTP_HOST}` : "missing SMTP_* / EMAIL_FROM");
  if (configured) {
    let why = "";
    const ok = await nodemailer
      .createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: process.env.SMTP_SECURE === "true", auth: { user: SMTP_USER!, pass: SMTP_PASS! } })
      .verify()
      .then(() => true)
      .catch((e: Error) => { why = e.message; return false; });
    record("SMTP accepts the credentials (nothing sent)", ok, why);
  }
  const allow = (process.env.EMAIL_DEV_ALLOW ?? "").split(",").map((a) => a.trim()).filter(Boolean);
  console.log(`NOTE  dev mail allowlist EMAIL_DEV_ALLOW = ${allow.length ? allow.join(", ") : "(empty — no invite email leaves this laptop)"}`);

  /* ---- 2. a project invites two new people: one address, and three ---- */
  const single = `${PREFIX}single@orbit.local`;
  const multiA = `${PREFIX}multi-a@orbit.local`;
  const multiB = `${PREFIX}multi-b@orbit.local`;
  const multiC = `${PREFIX}multi-c@orbit.local`;
  const made = await call(boss, "POST", "/api/projects", {
    name: "ME Check Project",
    departmentId: dept.id,
    invites: [
      { name: "ME Single", emails: [single] },
      { name: "ME Multi", emails: [multiA, multiB, multiC] },
    ],
  });
  record("the project is created with new people on it", made.status === 201, `status ${made.status} ${JSON.stringify(made.json?.error ?? "")}`);
  record("both invitees were invited, none skipped", made.json?.invited === 2 && (made.json?.skipped ?? []).length === 0, `invited ${made.json?.invited}, skipped ${JSON.stringify(made.json?.skipped)}`);

  const one = await prisma.user.findUnique({ where: { email: single }, include: { otherEmails: true, invite: true, projectMemberships: true } });
  const many = await prisma.user.findUnique({ where: { email: multiA }, include: { otherEmails: true, invite: true, projectMemberships: true } });
  record("the one-address person exists, waiting for a password", one?.status === "PENDING" && one?.passwordHash === null, `status ${one?.status}`);
  record("the several-address person keeps the FIRST as their main one", many?.email === multiA, many?.email);
  record("their other two addresses are stored against the same person", (many?.otherEmails ?? []).map((e) => e.email).sort().join(",") === [multiB, multiC].sort().join(","), (many?.otherEmails ?? []).map((e) => e.email).join(","));
  record("both were put on the project", (one?.projectMemberships.length ?? 0) === 1 && (many?.projectMemberships.length ?? 0) === 1);
  record("both have an invite waiting", Boolean(one?.invite) && Boolean(many?.invite));
  // The rig's inboxes sit at a reserved domain, so no mail is attempted for them
  // — that is the guard working, not a failure. Real domains are unaffected.
  const decision = await sendEmail({ to: `${PREFIX}probe@orbit.local`, subject: "probe", html: "", text: "", dedupeKey: `me-probe-${Date.now()}`, userId: many!.id, kind: "probe", refId: many!.id });
  record("mail is never attempted to a domain that cannot exist", decision.sent === false && decision.reason === "unreachable-domain", decision.reason ?? "");
  const logged = await prisma.emailLog.count({ where: { userId: { in: [one!.id, many!.id] } } });
  record("the ledger records no send that never happened", logged === 0, `${logged} rows`);

  /* ---- 3. they open the link and set their own password --------------- */
  const link = await issueInvite({ user: { id: many!.id, name: many!.name, email: many!.email, role: many!.role }, inviterName: "ME Manager", createdById: manager.id });
  const check = await call(null, "GET", `/api/invite/${link.token}/validate`);
  record("the emailed link opens", check.status === 200 && check.json?.state === "valid", `status ${check.status} ${check.json?.state}`);

  const short = await call(null, "POST", `/api/invite/${link.token}/accept`, { password: "short" });
  record("a too-short password is refused", short.status === 400, `status ${short.status}`);
  const trivial = await call(null, "POST", `/api/invite/${link.token}/accept`, { password: "orbit123" });
  record("a predictable password is refused", trivial.status === 400, `status ${trivial.status}`);

  const accepted = await call(null, "POST", `/api/invite/${link.token}/accept`, { password: NEW_PASSWORD });
  record("they set their own password", accepted.status === 200, `status ${accepted.status} ${JSON.stringify(accepted.json?.error ?? "")}`);
  record("setting it signs them straight in", accepted.cookie.startsWith("orbit_session="), accepted.cookie.slice(0, 24));
  const after = await prisma.user.findUnique({ where: { id: many!.id }, select: { status: true, passwordHash: true } });
  record("the account is now active with a password", after?.status === "ACTIVE" && Boolean(after?.passwordHash));
  const reuse = await call(null, "POST", `/api/invite/${link.token}/accept`, { password: NEW_PASSWORD });
  record("the same link cannot be used twice", reuse.status === 410, `status ${reuse.status}`);

  /* ---- 4. THE POINT: they log in with any address they were given ----- */
  const byMain = await signIn(multiA, NEW_PASSWORD);
  record("they sign in with their MAIN address", byMain.status === 200, `status ${byMain.status} ${JSON.stringify(byMain.json?.error ?? "")}`);
  const bySecond = await signIn(multiB, NEW_PASSWORD);
  record("they sign in with their SECOND address", bySecond.status === 200 && bySecond.json?.user?.id === many!.id, `status ${bySecond.status} ${JSON.stringify(bySecond.json?.error ?? "")}`);
  const byThird = await signIn(multiC, NEW_PASSWORD);
  record("they sign in with their THIRD address", byThird.status === 200 && byThird.json?.user?.id === many!.id, `status ${byThird.status}`);
  const wrong = await signIn(multiB, "Not-The-Password-9");
  record("a wrong password still fails on every address", wrong.status === 401, `status ${wrong.status}`);
  const uppercase = await signIn(multiB.toUpperCase(), NEW_PASSWORD);
  record("the address is case-insensitive", uppercase.status === 200, `status ${uppercase.status}`);

  /* ---- 5. the same person is never invited twice ---------------------- */
  const again = await call(boss, "POST", "/api/projects", {
    name: "ME Check Project Two",
    departmentId: dept.id,
    invites: [{ name: "ME Multi", emails: [multiC] }],
  });
  record("inviting them by their THIRD address adds the person, not a copy", again.json?.added === 1 && again.json?.invited === 0, `added ${again.json?.added}, invited ${again.json?.invited}`);
  const copies = await prisma.user.count({ where: { OR: [{ email: { in: [multiA, multiB, multiC] } }, { otherEmails: { some: { email: { in: [multiA, multiB, multiC] } } } }] } });
  record("still exactly one account for that person", copies === 1, `${copies} accounts`);

  /* ---- 6. the People → Invite door takes several addresses too -------- */
  const deskA = `${PREFIX}desk-a@orbit.local`;
  const deskB = `${PREFIX}desk-b@orbit.local`;
  const person = await call(boss, "POST", "/api/users", { name: "ME Desk", email: deskA, emails: [deskB], role: "RESOURCE", departmentId: dept.id });
  record("People → Invite accepts a person with two addresses", person.status === 201, `status ${person.status} ${JSON.stringify(person.json?.error ?? "")}`);
  const clash = await call(boss, "POST", "/api/users", { name: "ME Clash", email: `${PREFIX}clash@orbit.local`, emails: [multiB], role: "RESOURCE", departmentId: dept.id });
  record("an address that already belongs to somebody is refused", clash.status === 409, `status ${clash.status} ${JSON.stringify(clash.json?.error ?? "")}`);
  const nobody = await prisma.user.findUnique({ where: { email: `${PREFIX}clash@orbit.local` } });
  record("that refusal left no half-made account behind", nobody === null);

  const deskUser = await prisma.user.findUnique({ where: { email: deskA } });
  const deskLink = await issueInvite({ user: { id: deskUser!.id, name: deskUser!.name, email: deskUser!.email, role: deskUser!.role }, inviterName: "ME Manager", createdById: manager.id });
  await call(null, "POST", `/api/invite/${deskLink.token}/accept`, { password: NEW_PASSWORD });
  const deskLogin = await signIn(deskB, NEW_PASSWORD);
  record("that person signs in with their second address too", deskLogin.status === 200, `status ${deskLogin.status}`);

  /* ---- 7. forgot-password answers on any address ---------------------- */
  const forgot = await call(null, "POST", "/api/password-reset/request", { email: multiB });
  record("forgot-password accepts a second address", forgot.status === 200, `status ${forgot.status}`);
  const reset = await prisma.passwordResetRequest.count({ where: { userId: many!.id, status: "PENDING" } });
  record("it filed the request against the right person", reset === 1, `${reset} requests`);

  /* ---- 8. the TASK side: give work to several people at once, inviting
            the ones who are not on Orbit yet in the same form ------------- */
  const crewA = `${PREFIX}crew-a@orbit.local`;
  const crewB = `${PREFIX}crew-b@orbit.local`;
  const crewBAlt = `${PREFIX}crew-b-alt@orbit.local`;
  const holders: string[] = [];
  for (const row of [{ name: "ME Crew A", email: crewA, emails: [] as string[] }, { name: "ME Crew B", email: crewB, emails: [crewBAlt] }]) {
    const r = await call(boss, "POST", "/api/users", { name: row.name, email: row.email, emails: row.emails, role: "RESOURCE", departmentId: dept.id });
    if (r.status === 201) holders.push(r.json.user.id);
  }
  record("New Task invites two new people in the same form", holders.length === 2, `${holders.length} created`);
  // One record per person, exactly as the sheet raises them.
  const raised: any[] = [];
  for (const assigneeId of holders) {
    const r = await call(boss, "POST", "/api/tasks", { title: "ME Crew Task", type: "GENERAL", assigneeId, departmentId: dept.id, priority: "MEDIUM" });
    if (r.status === 201 || r.status === 200) raised.push(r.json);
  }
  record("each named person gets their own task", raised.length === 2, `${raised.length} tasks`);
  const heldByNewbies = await prisma.task.count({ where: { assigneeId: { in: holders }, deletedAt: null } });
  record("the tasks are held by the newly invited people", heldByNewbies === 2, `${heldByNewbies} held`);

  const crewBUser = await prisma.user.findUnique({ where: { email: crewB } });
  record("an invited task-holder is PENDING until they accept", crewBUser?.status === "PENDING" && crewBUser?.passwordHash === null, `status ${crewBUser?.status}`);
  const tooSoon = await signIn(crewBAlt, NEW_PASSWORD);
  record("they cannot sign in before setting a password", tooSoon.status === 401, `status ${tooSoon.status}`);

  const crewLink = await issueInvite({ user: { id: crewBUser!.id, name: crewBUser!.name, email: crewBUser!.email, role: crewBUser!.role }, inviterName: "ME Manager", createdById: manager.id });
  const crewAccept = await call(null, "POST", `/api/invite/${crewLink.token}/accept`, { password: NEW_PASSWORD });
  record("the task-holder sets their password from the invite", crewAccept.status === 200, `status ${crewAccept.status}`);
  const crewSignIn = await signIn(crewBAlt, NEW_PASSWORD);
  record("and then signs in with their SECOND address", crewSignIn.status === 200, `status ${crewSignIn.status}`);
  const mine = await call(crewSignIn.cookie, "GET", "/api/work?mine=assigned");
  const items: any[] = mine.json?.items ?? [];
  record("their task is waiting for them when they arrive", items.some((t) => t.title === "ME Crew Task"), `${items.length} tasks visible`);

  /* ---- 9. the project "Add people" door ------------------------------- */
  const proj = await prisma.project.findFirst({ where: { name: "ME Check Project" }, select: { id: true } });
  const joinA = `${PREFIX}join-a@orbit.local`;
  const joinB = `${PREFIX}join-b@orbit.local`;
  const joined = await call(boss, "POST", `/api/projects/${proj!.id}/members`, { invite: { name: "ME Join", email: joinA, emails: [joinB], role: "RESOURCE" } });
  record("Add people invites a person with two addresses", joined.status === 201, `status ${joined.status} ${JSON.stringify(joined.json?.error ?? "")}`);
  const joinUser = await prisma.user.findUnique({ where: { email: joinA }, include: { otherEmails: true } });
  record("their second address is stored on the same person", (joinUser?.otherEmails ?? []).some((e) => e.email === joinB));
  const rejoin = await call(boss, "POST", `/api/projects/${proj!.id}/members`, { invite: { name: "ME Join", email: joinB, role: "RESOURCE" } });
  record("re-adding by the second address finds them, makes no copy", rejoin.status === 200 && rejoin.json?.userId === joinUser!.id, `status ${rejoin.status}`);

  /* ---- 10. edges a production database will meet ---------------------- */
  const dupes = await call(boss, "POST", "/api/users", { name: "ME Dupe", email: `${PREFIX}dupe@orbit.local`, emails: [`${PREFIX}dupe@orbit.local`, `  ${PREFIX.toUpperCase()}DUPE@ORBIT.LOCAL `], role: "RESOURCE", departmentId: dept.id });
  record("the same address typed twice is stored once", dupes.status === 201, `status ${dupes.status}`);
  const dupeRow = await prisma.user.findUnique({ where: { email: `${PREFIX}dupe@orbit.local` }, include: { otherEmails: true } });
  record("no duplicate extra address was written", (dupeRow?.otherEmails ?? []).length === 0, `${(dupeRow?.otherEmails ?? []).length} extras`);

  const bad = await call(boss, "POST", "/api/users", { name: "ME Bad", email: "not-an-email", role: "RESOURCE", departmentId: dept.id });
  record("a malformed main address is refused", bad.status === 400, `status ${bad.status}`);
  const badExtra = await call(boss, "POST", "/api/users", { name: "ME Bad2", email: `${PREFIX}ok@orbit.local`, emails: ["also-not-an-email"], role: "RESOURCE", departmentId: dept.id });
  record("a malformed EXTRA address is refused too", badExtra.status === 400, `status ${badExtra.status}`);
  record("and it left no account behind", (await prisma.user.findUnique({ where: { email: `${PREFIX}ok@orbit.local` } })) === null);

  const asMain = await call(boss, "POST", "/api/users", { name: "ME Steal", email: multiB, role: "RESOURCE", departmentId: dept.id });
  record("somebody's EXTRA address cannot become another's main one", asMain.status === 409, `status ${asMain.status}`);
  const tooMany = await call(boss, "POST", "/api/users", { name: "ME Many", email: `${PREFIX}many@orbit.local`, emails: Array.from({ length: 11 }, (_, i) => `${PREFIX}many-${i}@orbit.local`), role: "RESOURCE", departmentId: dept.id });
  record("more addresses than the cap is refused", tooMany.status === 400, `status ${tooMany.status}`);

  const spaced = await signIn(`  ${multiB}  `, NEW_PASSWORD);
  record("surrounding spaces do not stop a sign-in", spaced.status === 200, `status ${spaced.status}`);

  /* ---- 11. leaving takes every address with it ------------------------ */
  const dupeId = dupeRow!.id;
  await prisma.$transaction([
    prisma.userEmail.createMany({ data: [{ userId: dupeId, email: `${PREFIX}gone-a@orbit.local` }, { userId: dupeId, email: `${PREFIX}gone-b@orbit.local` }] }),
  ]);
  await prisma.user.delete({ where: { id: dupeId } });
  const orphans = await prisma.userEmail.count({ where: { email: { in: [`${PREFIX}gone-a@orbit.local`, `${PREFIX}gone-b@orbit.local`] } } });
  record("deleting a person takes their other addresses with them", orphans === 0, `${orphans} left behind`);
  const reuse2 = await call(boss, "POST", "/api/users", { name: "ME Reuse", email: `${PREFIX}gone-a@orbit.local`, role: "RESOURCE", departmentId: dept.id });
  record("a freed address can be given to somebody new", reuse2.status === 201, `status ${reuse2.status}`);

  /* ---- 12. only the people who may make accounts may invite ------------ */
  const hash2 = await hashPassword("Rig-Member-77");
  const member = await prisma.user.upsert({
    where: { email: `${PREFIX}member@orbit.local` },
    update: { passwordHash: hash2, role: "RESOURCE", status: "ACTIVE", disabledAt: null, departmentId: dept.id },
    create: { email: `${PREFIX}member@orbit.local`, name: "ME Member", role: "RESOURCE", passwordHash: hash2, status: "ACTIVE", departmentId: dept.id },
  });
  const memberCookie = (await signIn(member.email, "Rig-Member-77")).cookie;
  const sneaky = await call(memberCookie, "POST", "/api/users", { name: "ME Sneaky", email: `${PREFIX}sneaky@orbit.local`, emails: [`${PREFIX}sneaky2@orbit.local`], role: "RESOURCE", departmentId: dept.id });
  record("a team member cannot invite anybody", sneaky.status === 403, `status ${sneaky.status}`);
  record("nor did a stray address get written", (await prisma.userEmail.count({ where: { email: `${PREFIX}sneaky2@orbit.local` } })) === 0);
  const anon = await call(null, "POST", "/api/users", { name: "ME Anon", email: `${PREFIX}anon@orbit.local`, role: "RESOURCE" });
  record("a signed-out stranger cannot invite anybody", anon.status === 401 || anon.status === 403, `status ${anon.status}`);

  /* ---- 13. a disabled person is shut out on every address ------------- */
  await prisma.user.update({ where: { id: many!.id }, data: { disabledAt: new Date() } });
  const shutMain = await signIn(multiA, NEW_PASSWORD);
  const shutAlt = await signIn(multiB, NEW_PASSWORD);
  record("a disabled person cannot sign in with their main address", shutMain.status === 401, `status ${shutMain.status}`);
  record("nor with any of their other addresses", shutAlt.status === 401, `status ${shutAlt.status}`);
  await prisma.user.update({ where: { id: many!.id }, data: { disabledAt: null } });
  record("re-enabling lets every address back in", (await signIn(multiB, NEW_PASSWORD)).status === 200);

  /* ---- 14. does anything actually reach the person? ------------------- */
  // Push can only be delivered if the server holds VAPID keys.
  record("push is configured (VAPID keys present)", Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY), process.env.VAPID_SUBJECT ?? "");

  // An ACTIVE teammate: the full bell + push + email fan-out applies.
  const buddyHash = await hashPassword("Rig-Buddy-77");
  const buddy = await prisma.user.upsert({
    where: { email: `${PREFIX}buddy@orbit.local` },
    update: { passwordHash: buddyHash, role: "RESOURCE", status: "ACTIVE", disabledAt: null, departmentId: dept.id, emailOptIn: true },
    create: { email: `${PREFIX}buddy@orbit.local`, name: "ME Buddy", role: "RESOURCE", passwordHash: buddyHash, status: "ACTIVE", departmentId: dept.id },
  });
  const buddyCookie = (await signIn(buddy.email, "Rig-Buddy-77")).cookie;

  const given = await call(boss, "POST", "/api/tasks", { title: "ME Bell Task", type: "GENERAL", assigneeId: buddy.id, departmentId: dept.id, priority: "MEDIUM" });
  record("a task can be given to them", given.status === 201, `status ${given.status}`);
  const bell = await prisma.notification.count({ where: { userId: buddy.id } });
  record("being given a task rings their bell", bell >= 1, `${bell} notifications`);

  const inbox = await call(buddyCookie, "GET", "/api/notifications");
  const unread: number = inbox.json?.unread ?? 0;
  const firstId: string | undefined = inbox.json?.items?.[0]?.id;
  record("their bell is readable through the API", inbox.status === 200 && (inbox.json?.items ?? []).length >= 1, `status ${inbox.status}, unread ${unread}`);
  record("the notification carries a title and a link", Boolean(inbox.json?.items?.[0]?.title) && Boolean(inbox.json?.items?.[0]?.url), inbox.json?.items?.[0]?.url ?? "");

  const readOne = await call(buddyCookie, "POST", "/api/notifications/read", { id: firstId });
  const after2 = await call(buddyCookie, "GET", "/api/notifications");
  record("marking one read lowers the unread count", readOne.status === 200 && (after2.json?.unread ?? 99) < unread, `${unread} → ${after2.json?.unread}`);

  const someoneElse = await call(crewSignIn.cookie, "POST", "/api/notifications/read", { id: firstId });
  record("nobody can mark somebody else's bell read", someoneElse.status === 404 || someoneElse.status === 403, `status ${someoneElse.status}`);

  // A note on a task reaches the people on it (owner, 2026-09-09).
  const noted = await call(boss, "POST", "/api/comments", { targetType: "TASK", targetId: given.json?.id, body: "ME note for the holder" });
  const noteBell = await prisma.notification.count({ where: { userId: buddy.id, type: { contains: "note" } } });
  record("a note on their task reaches them", noted.status === 201 && noteBell >= 1, `status ${noted.status}, ${noteBell} note bells`);

  // The person who has not joined yet: bell only, the invite mail comes first.
  const pendingHolder = await prisma.user.findUnique({ where: { email: crewA }, select: { id: true, status: true } });
  const pendingBell = await prisma.notification.count({ where: { userId: pendingHolder!.id } });
  const pendingMail = await prisma.emailLog.count({ where: { userId: pendingHolder!.id, kind: { not: "invite" } } });
  record("someone who has not joined gets the bell, not task mail", pendingBell >= 1 && pendingMail === 0, `${pendingBell} bells, ${pendingMail} task mails`);
}

main()
  .catch((e) => { console.error(e); fail++; })
  .finally(async () => {
    // Throwaways go, whatever happened above.
    // Its tasks go too: their holders are deleted but the rows would linger.
    await prisma.taskActivity.deleteMany({ where: { task: { title: { startsWith: "ME " } } } });
    await prisma.task.deleteMany({ where: { title: { startsWith: "ME " } } });
    const mine = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
    const ids = mine.map((u) => u.id);
    if (ids.length) {
      await prisma.project.deleteMany({ where: { name: { startsWith: "ME Check Project" } } });
      await prisma.passwordResetRequest.deleteMany({ where: { userId: { in: ids } } });
      await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
