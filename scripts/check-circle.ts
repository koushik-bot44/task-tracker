/* The circle around the person (2026-09-25).
 *   npx tsx --env-file=.env.local scripts/check-circle.ts   (dev server on :3010; after .localdb/seed-circle-demo.ts)
 *
 * The CEO's Well Being carries the tutors' reports and the people around Arjun.
 * Arjun adds and removes his own extras, and can touch nothing the parent set. Priya, the co-parent, opens the
 * same Well Being from her own walled login and can set a task Arjun sees, but
 * cannot invite anyone and reaches nothing of the work app. Dr Rao, the tutor,
 * sees one screen with Arjun and his reports and nothing of the Well Being; a
 * report cannot be dated ahead. The CEO can make Priya view-only and back. A head
 * of department is still kept out of all of it. Then every screen is photographed
 * at phone size, and each photo is checked for sideways overflow and small taps.
 *
 * Leaves no trace: the check's own task lines are removed and Priya's
 * permission put back before anything is photographed.
 * Evidence: records/evidence/circle/ (addresses are never printed).
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { CircleMemberDTO, MentorReportDTO, MentorViewDTO, PersonViewDTO, RoutineOverviewDTO, RoutineTaskDTO, WhoDTO } from "../lib/types";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3010";
const DIR = "records/evidence/circle";
// The safety net below writes to the database directly, so it runs on the local clone only.
const ON_CLONE = /127\.0\.0\.1:5433|localhost:5433/.test(process.env.DATABASE_URL ?? "");
const prisma = ON_CLONE ? new PrismaClient() : null;
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

/** The demo logins (.localdb/seed-circle-demo.ts). The invite page refuses "orbit123". */
const CEO = { email: "founder@orbit.local", password: "orbit123", name: "Rahul" };
const ARJUN = { email: "arjun.wb@orbit.local", password: "orbit123", name: "Arjun" };
const PRIYA = { email: "priya.wb@orbit.local", password: "orbit1234", name: "Priya" };
const RAO = { email: "rao.tutor@orbit.local", password: "orbit1234", name: "Dr Rao" };
const COACH = { email: "coach.wb@orbit.local", password: "orbit1234", name: "Rahul Sharma" };
/** Somebody from the work app who has nothing to do with the family: the first that signs in. */
const OUTSIDERS = ["hod-dev@orbit.local", "vikram@orbit.local", "rohit@orbit.local"];
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

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
function info(text: string) {
  lines.push(`INFO  ${text}`);
  console.log(`INFO  ${text}`);
}

function addDays(k: string, n: number): string {
  const d = new Date(`${k}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Reply<T> = { status: number; json: (T & { error?: string }) | null };
type Ok = { ok?: boolean };

async function signIn(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return res.ok ? (res.headers.get("set-cookie") ?? "").split(";")[0] : null;
}
async function call<T = Ok>(cookie: string, method: string, path: string, body?: unknown): Promise<Reply<T>> {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: Reply<T>["json"] = null;
  try { json = (await res.json()) as Reply<T>["json"]; } catch { /* no body */ }
  return { status: res.status, json };
}
/** A page fetched like a browser would, but without following the redirect. */
async function fetchPage(cookie: string, path: string): Promise<{ status: number; location: string; body: string }> {
  const res = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") ?? "", body: res.status === 200 ? await res.text() : "" };
}
async function browserSignIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.locator("#email").waitFor({ state: "visible" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 });
}

/* Everything the check makes, so it can be taken away again. */
let personId: string | null = null;
let arjunCookie: string | null = null;
let ceoCookie: string | null = null;
let priyaCookie: string | null = null;
let madeKidTask: string | null = null;
let madePriyaTask: string | null = null;
let priyaRow: CircleMemberDTO | null = null;
let priyaChanged = false;

async function cleanUp() {
  if (madeKidTask && arjunCookie) await call(arjunCookie, "DELETE", `/api/routine/kid/tasks/${madeKidTask}`);
  madeKidTask = null;
  if (madePriyaTask && ceoCookie) await call(ceoCookie, "DELETE", `/api/routine/tasks/${madePriyaTask}`);
  madePriyaTask = null;
  if (priyaChanged && priyaRow && ceoCookie) await call(ceoCookie, "PATCH", `/api/routine/circle/${priyaRow.id}`, { permission: "EDITABLE" });
  priyaChanged = false;
  // The safety net: anything of the check's that an earlier failure left behind.
  if (prisma && personId) {
    await prisma.routineTask.deleteMany({ where: { personId, title: { startsWith: "Check:" } } });
    await prisma.mentorReport.deleteMany({ where: { personId, covered: { startsWith: "Check:" } } });
  }
}

/* ── The screens: what the DOM says about a photographed page. ─────────────── */

/** Every visible tap target inside `scope` (a CSS selector list; "" = the whole page)
    with its height. Given to page.evaluate as a STRING: under tsx a function literal
    breaks with "__name is not defined". */
function controlsScript(scope: string): string {
  return `(() => {
    const scope = ${JSON.stringify(scope)};
    const roots = scope ? Array.from(document.querySelectorAll(scope)) : [document.body];
    const seen = new Set();
    const out = [];
    for (const root of roots) for (const el of root.querySelectorAll("button, a, input, textarea, select")) {
      if (seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.getAttribute("type") || "").trim().replace(/\\s+/g, " ").slice(0, 40);
      out.push({ tag: el.tagName.toLowerCase(), label, h: Math.round(r.height) });
    }
    return out;
  })()`;
}
type Control = { tag: string; label: string; h: number };
/** Controls that were there before the circle and are not this check's concern. */
const LEGACY = new Set(["Edit person", "Remove person", "Previous week", "Next week", "Enter full screen", "Exit full screen", "Sign out"]);

/** Photograph the page as it stands, then say whether it fits a phone and whether
    its taps are big enough. `strict`: the page is one of the new screens, so a tap
    under 36px there is a failure; elsewhere small taps are only listed. */
async function photograph(page: Page, file: string, what: string, scope: string, strict: boolean) {
  await page.screenshot({ path: `${DIR}/${file}`, fullPage: true });
  const width = (await page.evaluate("document.documentElement.scrollWidth")) as number;
  record(`${what} fits a phone with no sideways scroll`, width <= 390, `page width ${width}px`);
  const controls = (await page.evaluate(controlsScript(scope))) as Control[];
  const small = controls.filter((c) => c.h < 40);
  if (small.length) info(`${what}: taps under 40px — ${small.map((c) => `${c.tag} "${c.label}" ${c.h}px`).join(", ")}`);
  const tiny = small.filter((c) => c.h < 36 && !LEGACY.has(c.label));
  if (strict) record(`${what}: every tap on the new sections is at least 36px tall`, tiny.length === 0, tiny.length ? tiny.map((c) => `${c.tag} "${c.label}" ${c.h}px`).join(", ") : `${controls.length} controls`);
  else info(`${what}: ${controls.length} controls, ${tiny.length} under 36px (older sections, listed only)`);
}
async function openTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name, exact: true });
  await tab.waitFor({ state: "visible" });
  await tab.click();
  await page.waitForTimeout(1500);
}
async function seen(page: Page, text: string): Promise<boolean> {
  return page.getByText(text).first().waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
}

async function main() {
  /* ---- the CEO's side ---- */
  ceoCookie = await signIn(CEO.email, CEO.password);
  record("the CEO signs in", Boolean(ceoCookie));
  if (!ceoCookie) return;
  const ov = await call<RoutineOverviewDTO>(ceoCookie, "GET", "/api/routine");
  const person = ov.json?.person ?? null;
  personId = person?.id ?? null;
  const today = ov.json?.today ?? "";
  record(`the CEO's Well Being is ${ARJUN.name}'s, as its owner`, ov.status === 200 && person?.name === ARJUN.name && ov.json?.role === "OWNER", `status ${ov.status}, person ${person?.name}, role ${ov.json?.role}`);
  if (!personId || !today) return;
  const reports = ov.json?.reports ?? [];
  record("…and carries the tutors' reports for this week", reports.length >= 3 && reports.some((r) => r.subject === "Maths" && r.mentorName === RAO.name) && reports.some((r) => r.subject === "Tennis"), reports.map((r) => `${r.date} ${r.subject} · ${r.mentorName}`).join(", "));
  const circle = ov.json?.circle ?? [];
  priyaRow = circle.find((c) => c.name === PRIYA.name) ?? null;
  const rao = circle.find((c) => c.name === RAO.name);
  const coach = circle.find((c) => c.name === COACH.name);
  record("…and the people around him: a co-parent who can edit, a Maths tutor and a tennis coach, all active", priyaRow?.kind === "FAMILY" && priyaRow.permission === "EDITABLE" && rao?.kind === "MENTOR" && rao.subject === "Maths" && coach?.kind === "MENTOR" && coach.subject === "Tennis" && circle.every((c) => c.status === "ACTIVE"), circle.map((c) => `${c.name} ${c.kind}${c.subject ? ` ${c.subject}` : ""} ${c.status}`).join(", "));
  const ceoWho = await call<WhoDTO>(ceoCookie, "GET", "/api/routine/who");
  record("the CEO's own login is not one of the walled ones", ceoWho.status === 403, `status ${ceoWho.status}`);
  const people = await call<{ role: string }[]>(ceoCookie, "GET", "/api/users");
  record("nobody from the family corner shows up in People", Array.isArray(people.json) && people.json.every((u) => u.role !== "PERSON"), `${Array.isArray(people.json) ? people.json.length : 0} people`);
  if (priyaRow) {
    const resend = await call(ceoCookie, "POST", `/api/routine/circle/${priyaRow.id}/resend`, { sendEmail: false });
    record("a fresh link for someone who already set a password is refused", resend.status === 400, `status ${resend.status}: ${resend.json?.error}`);
  }

  /* ---- Arjun's side ---- */
  arjunCookie = await signIn(ARJUN.email, ARJUN.password);
  record(`${ARJUN.name} signs in`, Boolean(arjunCookie));
  if (!arjunCookie) return;
  const who = await call<WhoDTO>(arjunCookie, "GET", "/api/routine/who");
  record(`the app knows ${ARJUN.name} is the person himself`, who.json?.kind === "SON" && who.json?.name === ARJUN.name, `${who.json?.kind} ${who.json?.name}`);
  const kid = await call<PersonViewDTO>(arjunCookie, "GET", "/api/routine/kid");
  record("his screen carries the latest reports", kid.status === 200 && (kid.json?.reports.length ?? 0) >= 3, `status ${kid.status}, ${kid.json?.reports.length} reports`);
  const own = (kid.json?.tasks ?? []).filter((t) => t.addedBy === "PERSON");
  const parentTask = (kid.json?.tasks ?? []).find((t) => t.addedBy === "MANAGER");
  record("his own extra is tagged as his, the parent's as theirs", own.some((t) => t.title === "Call grandma") && Boolean(parentTask), `${own.map((t) => t.title).join(", ")} | parent: ${parentTask?.title}`);

  const made = await call<RoutineTaskDTO>(arjunCookie, "POST", "/api/routine/kid/tasks", { title: "Check: water the plants" });
  madeKidTask = made.json?.id ?? null;
  record(`${ARJUN.name} adds an extra of his own for today`, made.status === 201 && made.json?.dueDate === today && made.json?.addedBy === "PERSON", `status ${made.status}, due ${made.json?.dueDate}, ${made.json?.addedBy}`);
  if (madeKidTask) {
    const off = await call(arjunCookie, "DELETE", `/api/routine/kid/tasks/${madeKidTask}`);
    record("…and can take it off again", off.status === 200 && off.json?.ok === true, `status ${off.status}`);
    if (off.status === 200) madeKidTask = null;
  }
  if (parentTask) {
    const no = await call(arjunCookie, "DELETE", `/api/routine/kid/tasks/${parentTask.id}`);
    record("…but not a task the parent set", no.status === 403 && no.json?.error === "Only the person who set this can remove it.", `status ${no.status}: ${no.json?.error}`);
  }
  const gone = await call(arjunCookie, "DELETE", "/api/routine/kid/tasks/nope");
  record("a task that does not exist is a plain not-found", gone.status === 404, `status ${gone.status}`);

  /* ---- Priya, the co-parent ---- */
  priyaCookie = await signIn(PRIYA.email, PRIYA.password);
  record(`${PRIYA.name} signs in`, Boolean(priyaCookie));
  if (priyaCookie) {
    const pWho = await call<WhoDTO>(priyaCookie, "GET", "/api/routine/who");
    record(`the app knows ${PRIYA.name} is a co-parent`, pWho.json?.kind === "FAMILY", `${pWho.json?.kind}`);
    const pOv = await call<RoutineOverviewDTO>(priyaCookie, "GET", "/api/routine");
    record(`${PRIYA.name} opens the same Well Being, able to edit`, pOv.status === 200 && pOv.json?.person?.id === personId && pOv.json?.role === "EDITABLE" && pOv.json?.routines.length === 1, `status ${pOv.status}, role ${pOv.json?.role}, ${pOv.json?.routines.length} routines`);
    record("…and the circle itself stays the owner's", (pOv.json?.circle ?? []).length === 0, `${pOv.json?.circle.length} shown`);
    const pTask = await call<RoutineTaskDTO>(priyaCookie, "POST", "/api/routine/tasks", { title: "Check: from Priya", dueDate: today });
    madePriyaTask = pTask.json?.id ?? null;
    const kidAgain = await call<PersonViewDTO>(arjunCookie, "GET", "/api/routine/kid");
    record(`${PRIYA.name} sets a task and ${ARJUN.name} sees it as the parent's`, pTask.status === 201 && (kidAgain.json?.tasks ?? []).some((t) => t.id === madePriyaTask && t.addedBy === "MANAGER"), `status ${pTask.status}`);
    const pInvite = await call(priyaCookie, "POST", "/api/routine/circle", { name: "Check", email: "check.circle@orbit.local", kind: "FAMILY", sendEmail: false });
    record(`${PRIYA.name} cannot invite anyone — only the owner can`, pInvite.status === 403, `status ${pInvite.status}: ${pInvite.json?.error}`);
    const walls: string[] = [];
    for (const path of ["/api/work?limit=1", "/api/users", "/api/projects", "/api/users/me"]) {
      const r = await call(priyaCookie, "GET", path);
      if (r.status !== 403) walls.push(`${path} ${r.status}`);
    }
    record(`${PRIYA.name}'s login reaches nothing of the work app`, walls.length === 0, walls.join(", ") || "tasks, People, projects, me: all 403");
  }

  /* ---- Dr Rao, the tutor ---- */
  const raoCookie = await signIn(RAO.email, RAO.password);
  record(`${RAO.name} signs in`, Boolean(raoCookie));
  let raoReport: MentorReportDTO | undefined;
  let raoStudent: MentorViewDTO["students"][number] | undefined;
  if (raoCookie) {
    const rWho = await call<WhoDTO>(raoCookie, "GET", "/api/routine/who");
    record(`the app knows ${RAO.name} is a tutor`, rWho.json?.kind === "MENTOR", `${rWho.json?.kind}`);
    const mv = await call<MentorViewDTO>(raoCookie, "GET", "/api/routine/mentor");
    raoStudent = mv.json?.students.find((s) => s.personName === ARJUN.name);
    raoReport = raoStudent?.reports[0];
    record(`${RAO.name}'s screen lists ${ARJUN.name} for Maths with his past reports, newest first`, mv.status === 200 && raoStudent?.subject === "Maths" && (raoStudent?.reports.length ?? 0) >= 2 && raoStudent!.reports.every((r, i, a) => i === 0 || a[i - 1].date >= r.date), `${raoStudent?.reports.length} reports: ${raoStudent?.reports.map((r) => r.date).join(", ")}`);
    const rOv = await call(raoCookie, "GET", "/api/routine");
    const rKid = await call(raoCookie, "GET", "/api/routine/kid");
    record(`${RAO.name} never sees the Well Being itself, from either side`, rOv.status === 403 && rKid.status === 403, `parent view ${rOv.status}, person view ${rKid.status}`);
    const rWork = await call(raoCookie, "GET", "/api/work?limit=1");
    record("…nor the work app", rWork.status === 403, `status ${rWork.status}`);
    if (raoStudent) {
      const tomorrow = await call(raoCookie, "POST", "/api/routine/mentor/reports", { collaboratorId: raoStudent.collaboratorId, date: addDays(today, 1), covered: "Check: tomorrow" });
      record("a report dated tomorrow is refused", tomorrow.status === 400, `status ${tomorrow.status}: ${tomorrow.json?.error}`);
    }
  }
  const coachCookie = await signIn(COACH.email, COACH.password);
  if (coachCookie && raoReport) {
    const steal = await call(coachCookie, "DELETE", `/api/routine/mentor/reports/${raoReport.id}`);
    record(`the coach cannot remove ${RAO.name}'s report`, steal.status === 404, `status ${steal.status}`);
  }

  /* ---- the CEO changes what Priya may do ---- */
  if (priyaRow && priyaCookie) {
    const ro = await call<CircleMemberDTO>(ceoCookie, "PATCH", `/api/routine/circle/${priyaRow.id}`, { permission: "READ_ONLY" });
    priyaChanged = true;
    record(`the CEO makes ${PRIYA.name} view-only`, ro.status === 200 && ro.json?.permission === "READ_ONLY", `status ${ro.status}, ${ro.json?.permission}`);
    const pOv2 = await call<RoutineOverviewDTO>(priyaCookie, "GET", "/api/routine");
    const pWrite = await call<RoutineTaskDTO>(priyaCookie, "POST", "/api/routine/tasks", { title: "Check: read-only", dueDate: today });
    record(`…and ${PRIYA.name} can then only look`, pOv2.json?.role === "READ_ONLY" && pWrite.status === 403, `role ${pOv2.json?.role}, task write ${pWrite.status}: ${pWrite.json?.error}`);
    if (pWrite.status === 201 && pWrite.json?.id) await call(ceoCookie, "DELETE", `/api/routine/tasks/${pWrite.json.id}`);
    const back = await call<CircleMemberDTO>(ceoCookie, "PATCH", `/api/routine/circle/${priyaRow.id}`, { permission: "EDITABLE" });
    const pOv3 = await call<RoutineOverviewDTO>(priyaCookie, "GET", "/api/routine");
    record("…and back to editing", back.json?.permission === "EDITABLE" && pOv3.json?.role === "EDITABLE", `${back.json?.permission}, role ${pOv3.json?.role}`);
    if (back.json?.permission === "EDITABLE") priyaChanged = false;
  }

  /* ---- somebody from the work app ---- */
  let outsider: string | null = null;
  for (const email of OUTSIDERS) {
    outsider = await signIn(email, "orbit123");
    if (outsider) break;
  }
  if (!outsider) info("no head of department or manager could sign in with the demo password, skipped");
  else {
    const r = await call(outsider, "GET", "/api/routine");
    record("a head of department can't open Well Being", r.status === 403, `status ${r.status}`);
    const fam = await fetchPage(outsider, "/family");
    const men = await fetchPage(outsider, "/mentor");
    const away = (p: { status: number; location: string; body: string }) => (p.status >= 300 && p.status < 400 && !/\/(family|mentor)/.test(p.location)) || (p.status === 200 && !p.body.includes("Nothing shared with you yet") && !p.body.includes("Sign out"));
    record("…and is sent away from the co-parent's and the tutor's pages", away(fam) && away(men), `/family ${fam.status} -> ${fam.location || "(page)"}, /mentor ${men.status} -> ${men.location || "(page)"}`);
  }

  // The check's own lines go back now, so the screens show only the demo.
  await cleanUp();

  /* ---- the screens, at phone size ---- */
  const browser = await chromium.launch();

  const arjunCtx = await browser.newContext(PHONE);
  const arjunPage = await arjunCtx.newPage();
  await browserSignIn(arjunPage, ARJUN.email, ARJUN.password);
  await arjunPage.waitForTimeout(2500);
  record(`${ARJUN.name} lands on his own screen`, new URL(arjunPage.url()).pathname === "/person", new URL(arjunPage.url()).pathname);
  await arjunPage.getByRole("tab", { name: "Today", exact: true }).waitFor({ state: "visible" });
  info(`${ARJUN.name}'s tabs: ${(await arjunPage.getByRole("tab").allInnerTexts()).join(" · ")}`);
  info(`${ARJUN.name}'s greeting: ${(await arjunPage.locator("h1").first().innerText()).trim()}`);
  record("his Today shows his own extra and his tutors' homework", (await seen(arjunPage, "Call grandma")) && (await seen(arjunPage, "Worksheet 3")));
  await photograph(arjunPage, "arjun-1-today.png", `${ARJUN.name}'s Today`, "[role=tablist], main", true);
  await openTab(arjunPage, "Habits");
  await photograph(arjunPage, "arjun-2-habits.png", `${ARJUN.name}'s Habits`, "[role=tablist], main", false);
  await arjunCtx.close();

  const ceoCtx = await browser.newContext(PHONE);
  const ceoPage = await ceoCtx.newPage();
  await browserSignIn(ceoPage, CEO.email, CEO.password);
  await ceoPage.goto(`${BASE}/routine`);
  await ceoPage.waitForTimeout(2500);
  await ceoPage.getByRole("tab", { name: "Summary", exact: true }).waitFor({ state: "visible" });
  const ceoTabs = await ceoPage.getByRole("tablist", { name: "Well Being view" }).getByRole("tab").allInnerTexts();
  info(`the CEO's tabs: ${ceoTabs.join(" · ")}`);
  record("the CEO is offered Summary, Tracker, Calendar, Map, Tutors and Circle", ceoTabs.join("|") === "Summary|Tracker|Calendar|Map|Tutors|Circle", ceoTabs.join(", "));
  record("his Summary shows today's list and only today's tutor report", (await seen(ceoPage, "Physics assignment")) && (await seen(ceoPage, "From tutors today")) && (await seen(ceoPage, "Word problems on quadratics")));
  const SCOPE = "[role=tablist], section, .rounded-sheet";
  await photograph(ceoPage, "ceo-1-summary.png", "the CEO's Summary", SCOPE, true);
  await openTab(ceoPage, "Circle");
  record(`his Circle names the people around ${ARJUN.name}`, (await seen(ceoPage, `People around ${ARJUN.name}`)) && (await seen(ceoPage, PRIYA.name)) && (await seen(ceoPage, `Tutor or coach · Maths`)));
  await photograph(ceoPage, "ceo-2-circle.png", "the CEO's Circle", SCOPE, true);
  await openTab(ceoPage, "Tracker");
  await photograph(ceoPage, "ceo-3-tracker.png", "the CEO's Tracker", SCOPE, false);
  await ceoCtx.close();

  const priyaCtx = await browser.newContext(PHONE);
  const priyaPage = await priyaCtx.newPage();
  await browserSignIn(priyaPage, PRIYA.email, PRIYA.password);
  await priyaPage.goto(`${BASE}/family`);
  await priyaPage.waitForTimeout(2500);
  record(`${PRIYA.name} stays on the co-parent's page`, new URL(priyaPage.url()).pathname === "/family", new URL(priyaPage.url()).pathname);
  await priyaPage.getByRole("tab", { name: "Summary", exact: true }).waitFor({ state: "visible" });
  const priyaTabs = await priyaPage.getByRole("tablist", { name: "Well Being view" }).getByRole("tab").allInnerTexts();
  info(`${PRIYA.name}'s tabs: ${priyaTabs.join(" · ")}`);
  record(`${PRIYA.name} sees Well Being for ${ARJUN.name} with Summary, Tracker, Calendar, Map and Tutors — no Circle`, priyaTabs.join("|") === "Summary|Tracker|Calendar|Map|Tutors" && (await seen(priyaPage, "Well Being")) && (await seen(priyaPage, ARJUN.name)), priyaTabs.join(", "));
  await photograph(priyaPage, "priya-1-family.png", `${PRIYA.name}'s Well Being`, SCOPE, true);
  await priyaCtx.close();

  const raoCtx = await browser.newContext(PHONE);
  const raoPage = await raoCtx.newPage();
  await browserSignIn(raoPage, RAO.email, RAO.password);
  await raoPage.goto(`${BASE}/mentor`);
  await raoPage.waitForTimeout(2500);
  record(`${RAO.name} stays on the tutor's page`, new URL(raoPage.url()).pathname === "/mentor", new URL(raoPage.url()).pathname);
  record(`${RAO.name}'s screen shows ${ARJUN.name} · Maths, today's report form and his past reports`, (await seen(raoPage, `${ARJUN.name} · Maths`)) && (await seen(raoPage, "Past reports")) && (await seen(raoPage, "Quadratic equations — factorising")));
  await photograph(raoPage, "rao-1-mentor.png", `${RAO.name}'s screen`, "", true);
  await raoCtx.close();

  await browser.close();
  info("screens: arjun-1-today, arjun-2-habits, ceo-1-summary, ceo-2-circle, ceo-3-tracker, priya-1-family, rao-1-mentor");
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    await cleanUp();
    writeFileSync(`${DIR}/check-circle.txt`, lines.join("\n") + `\n\n${pass} passed, ${fail} failed\n`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma?.$disconnect();
    process.exit(fail ? 1 : 0);
  });
