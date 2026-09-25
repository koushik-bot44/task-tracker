/* The calendar and the map (2026-09-25).
 *   npx tsx --env-file=.env.local scripts/check-circle-2.ts   (dev server on :3010; after .localdb/seed-circle-demo.ts and .localdb/seed-location-demo.ts)
 *
 * The CEO's month calendar carries today's tasks and the son's habit rollups; the
 * son's own calendar never carries a rollup. The map shows only where Arjun is NOW
 * (his latest point ever, "last seen": a check-in's place, else "near <named place>",
 * else "on the map"); the day's history is the log under it, every check-in, app
 * note and phone point with its time — for the CEO (with the sharing link), for
 * Priya (same day, no link) and for Arjun himself (no link). The sharing link refuses a wrong secret
 * and a body that is not a location; Priya cannot turn sharing on or off; Dr Rao
 * and a head of department reach neither the map nor the calendar. Arjun can check
 * in without a position. The CEO turning sharing off kills the old link; turning
 * it on again gives a new one, which stays on for the photographs. Then every
 * screen — Calendar and Map tabs included — is photographed at phone size and
 * checked for sideways overflow and small taps.
 *
 * Leaves no trace: the check's own check-in is removed before anything is
 * photographed. Evidence: records/evidence/circle-2/ (links are never printed).
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { CalendarMonthDTO, LocationDayDTO, LocationPointDTO, RoutineOverviewDTO } from "../lib/types";

const BASE = process.env.SCREEN_BASE ?? "http://localhost:3010";
const DIR = "records/evidence/circle-2";
// No route removes a location point, so the check's own check-in goes through the
// database directly — on the local clone only.
const ON_CLONE = /127\.0\.0\.1:5433|localhost:5433/.test(process.env.DATABASE_URL ?? "");
const prisma = ON_CLONE ? new PrismaClient() : null;
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

/** The demo logins (.localdb/seed-circle-demo.ts). */
const CEO = { email: "founder@orbit.local", password: "orbit123", name: "Rahul" };
const ARJUN = { email: "arjun.wb@orbit.local", password: "orbit123", name: "Arjun" };
const PRIYA = { email: "priya.wb@orbit.local", password: "orbit1234", name: "Priya" };
const RAO = { email: "rao.tutor@orbit.local", password: "orbit1234", name: "Dr Rao" };
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

type Reply<T> = { status: number; json: (T & { error?: string }) | null };
type Ok = { ok?: boolean };
type Sharing = { on: boolean; url: string | null };

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
/** A post to a sharing link the way a phone app does it: no login. The link's host is
    whatever APP_URL says, so only its secret is used, against the server under test. */
async function postToLink(secret: string, body: unknown, raw = false): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE}/api/routine/feed/${secret}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw ? (body as string) : JSON.stringify(body) });
  return { status: res.status, text: await res.text() };
}
const secretOf = (url: string | null | undefined) => (url ?? "").split("/").pop() ?? "";
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
let ceoCookie: string | null = null;
let madeCheckin: string | null = null;
let sharingLeftOff = false;

async function cleanUp() {
  if (madeCheckin && prisma) {
    await prisma.locationPoint.deleteMany({ where: { id: madeCheckin } });
    madeCheckin = null;
  }
  // The safety net: any check-in of the check's that an earlier failure left behind.
  if (prisma && personId) await prisma.locationPoint.deleteMany({ where: { personId, source: "CHECKIN", note: { startsWith: "Check:" } } });
  // Sharing stays on for the photographs, and for the owner's next look.
  if (sharingLeftOff && ceoCookie) {
    await call<Sharing>(ceoCookie, "POST", "/api/routine/location/sharing", { on: true });
    sharingLeftOff = false;
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
    for (const root of roots) for (const el of root.querySelectorAll("button, a, input, textarea, select, [role=switch]")) {
      if (seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.getAttribute("type") || "").trim().replace(/\\s+/g, " ").slice(0, 40);
      out.push({ tag: el.tagName.toLowerCase(), label, h: Math.round(r.height), leaflet: Boolean(el.closest(".leaflet-control")) });
    }
    return out;
  })()`;
}
type Control = { tag: string; label: string; h: number; leaflet: boolean };
/** Controls that were there before this pass and are not this check's concern. */
const LEGACY = new Set(["Edit person", "Remove person", "Previous week", "Next week", "Enter full screen", "Exit full screen", "Sign out"]);
/** The map's own small print — the "Leaflet" and "OpenStreetMap" credit links. A
    legal notice, not one of the app's controls; listed, never failed. */
const isCredit = (c: Control) => c.leaflet && c.tag === "a" && /leaflet|openstreetmap/i.test(c.label);

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
  const tiny = small.filter((c) => c.h < 36 && !LEGACY.has(c.label) && !isCredit(c));
  if (strict) record(`${what}: every tap on the new sections is at least 36px tall`, tiny.length === 0, tiny.length ? tiny.map((c) => `${c.tag} "${c.label}" ${c.h}px`).join(", ") : `${controls.length} controls`);
  else info(`${what}: ${controls.length} controls, ${tiny.length} under 36px (older sections, listed only)`);
}
async function openTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name, exact: true });
  await tab.waitFor({ state: "visible" });
  await tab.click();
  await page.waitForTimeout(1500);
}
async function seen(page: Page, text: string | RegExp): Promise<boolean> {
  return page.getByText(text).first().waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
}
/** The map needs a moment: its box, then its tiles. */
async function mapReady(page: Page): Promise<boolean> {
  const ok = await page.locator(".leaflet-container").first().waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false);
  await page.waitForTimeout(2000);
  return ok;
}
/** Tap today's cell in the month grid ("25 September, 3 things"). */
async function tapToday(page: Page, today: string) {
  const d = new Date(`${today}T00:00:00.000Z`);
  const label = `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })},`;
  const cell = page.getByRole("button", { name: new RegExp(`^${label}`) });
  await cell.waitFor({ state: "visible" });
  await cell.click();
  await page.waitForTimeout(1500);
  return label;
}
const bySource = (points: LocationPointDTO[]) => `${points.filter((p) => p.source === "CHECKIN").length} check-ins, ${points.filter((p) => p.source !== "CHECKIN").length} from the phone`;
/** What every screen says a point is — the app's own whereLabel (components/routine/location-log.tsx):
    a check-in's place ("Home"), else "near <named place>" when one covers it, else "on the map". */
function whereWords(p: LocationPointDTO | null): string {
  if (!p) return "";
  if (p.placeName) return p.placeName;
  if (p.source === "CHECKIN" && p.place) return p.place;
  if (p.lat === 0 && p.lng === 0) return "no position";
  return "on the map";
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The rows of the day's log under the map: the list right after its "Today’s log" / "That day’s log" heading. */
const logRows = (page: Page) => page.getByRole("heading", { name: /(Today|That day).s log/ }).first().locator("xpath=following-sibling::ol[1]/li");

async function main() {
  /* ---- the CEO: the calendar and the map ---- */
  ceoCookie = await signIn(CEO.email, CEO.password);
  record("the CEO signs in", Boolean(ceoCookie));
  if (!ceoCookie) return;
  const ov = await call<RoutineOverviewDTO>(ceoCookie, "GET", "/api/routine");
  personId = ov.json?.person?.id ?? null;
  const today = ov.json?.today ?? "";
  record(`the CEO's Well Being is ${ARJUN.name}'s`, ov.status === 200 && ov.json?.person?.name === ARJUN.name && Boolean(today), `status ${ov.status}, ${ov.json?.person?.name}, today ${today}`);
  if (!personId || !today) return;

  const cal = await call<CalendarMonthDTO>(ceoCookie, "GET", "/api/routine/calendar");
  const todayCal = cal.json?.days[today];
  const habitDays = Object.entries(cal.json?.days ?? {}).filter(([, d]) => d.habits && d.habits.total > 0);
  record("the CEO's calendar opens on this month with today's tasks", cal.status === 200 && cal.json?.month === today.slice(0, 7) && cal.json?.today === today && (todayCal?.tasks.length ?? 0) >= 2 && Boolean(todayCal?.tasks.some((t) => t.title === "Physics assignment")), `status ${cal.status}, month ${cal.json?.month}, today: ${todayCal?.tasks.map((t) => t.title).join(", ")}`);
  record(`…and ${ARJUN.name}'s habits on the days he was marked`, habitDays.length >= 3 && habitDays.every(([, d]) => d.habits!.met + d.habits!.missed <= d.habits!.total), habitDays.map(([k, d]) => `${k} ${d.habits!.met} of ${d.habits!.total}`).join(", "));
  record("…the tutors' reports and the rules on their days", Boolean(todayCal?.reports.some((r) => r.mentorName === RAO.name && r.homework === "Worksheet 3")), `today: ${todayCal?.reports.length} report, ${todayCal?.rules.length} rules scheduled`);
  const badMonth = await call<CalendarMonthDTO>(ceoCookie, "GET", "/api/routine/calendar?month=2026-13");
  record("a month that is not a month is refused", badMonth.status === 400, `status ${badMonth.status}: ${badMonth.json?.error}`);

  // The seed leaves sharing on; another check on the same clone may have switched it
  // off since. The owner turns it on here, so the checks below start from one state.
  const before = await call<LocationDayDTO>(ceoCookie, "GET", "/api/routine/location");
  if (before.json?.sharing.on === false) {
    const on = await call<Sharing>(ceoCookie, "POST", "/api/routine/location/sharing", { on: true });
    info(`sharing was off when the check began; the CEO turned it on (status ${on.status})`);
  }
  const loc = await call<LocationDayDTO>(ceoCookie, "GET", "/api/routine/location");
  const points = loc.json?.points ?? [];
  const checkins = points.filter((p) => p.source === "CHECKIN");
  const phone = points.filter((p) => p.source !== "CHECKIN");
  record(`the CEO's map for today lists ${ARJUN.name}'s check-ins and the phone's points`, loc.status === 200 && loc.json?.day === today && checkins.length >= 3 && phone.length >= 3 && ["School", "Tutor", "Home"].every((p) => checkins.some((c) => c.place === p)) && phone.some((p) => p.source === "OWNTRACKS") && phone.some((p) => p.source === "OVERLAND"), `status ${loc.status}, ${bySource(points)}: ${checkins.map((c) => c.place).join(", ")}`);
  record("…newest first, with the latest point as last seen", points.every((p, i, a) => i === 0 || a[i - 1].at >= p.at) && loc.json?.lastSeen?.id === points[0]?.id, `last seen ${loc.json?.lastSeen?.place ?? loc.json?.lastSeen?.source} at ${loc.json?.lastSeen?.at}`);
  record("…and phone sharing on, with the link for the owner", loc.json?.sharing.on === true && typeof loc.json?.sharing.url === "string" && loc.json.sharing.url.includes("/api/routine/feed/"), `on ${loc.json?.sharing.on}, link of ${secretOf(loc.json?.sharing.url).length} letters`);
  const oldSecret = secretOf(loc.json?.sharing.url);
  /** What every screen should say Arjun's latest point is — never hard-coded: the same words the app makes of lastSeen. */
  const lastSeen = loc.json?.lastSeen ?? null;
  const lastSeenWords = whereWords(lastSeen);
  const lastSeenRe = new RegExp(`^Last seen: ${escapeRe(lastSeenWords)} · `);
  const lastCheckin = points.find((p) => p.source === "CHECKIN") ?? null;
  info(`last seen: ${lastSeenWords || "nothing"} (${lastSeen?.source ?? "-"}); last check-in today: ${lastCheckin?.place ?? "none"}`);
  const phonePoint = phone.find((p) => p.source === "OVERLAND");
  record("a phone point keeps its battery and accuracy", phonePoint?.battery === 61 && phonePoint?.accuracy === 25, `battery ${phonePoint?.battery}, accuracy ${phonePoint?.accuracy}`);
  const badDay = await call<LocationDayDTO>(ceoCookie, "GET", "/api/routine/location?day=bad");
  record("a day that is not a day is refused", badDay.status === 400, `status ${badDay.status}: ${badDay.json?.error}`);

  /* ---- Priya, the co-parent: the same day, no link ---- */
  const priyaCookie = await signIn(PRIYA.email, PRIYA.password);
  record(`${PRIYA.name} signs in`, Boolean(priyaCookie));
  if (priyaCookie) {
    const pLoc = await call<LocationDayDTO>(priyaCookie, "GET", "/api/routine/location");
    record(`${PRIYA.name} sees the same day on the map`, pLoc.status === 200 && pLoc.json?.day === today && pLoc.json?.points.length === points.length && pLoc.json?.lastSeen?.id === loc.json?.lastSeen?.id, `status ${pLoc.status}, ${bySource(pLoc.json?.points ?? [])}`);
    record("…knows sharing is on, but never gets the link", pLoc.json?.sharing.on === true && pLoc.json?.sharing.url === null, `on ${pLoc.json?.sharing.on}, url ${pLoc.json?.sharing.url}`);
    const pShare = await call<Sharing>(priyaCookie, "POST", "/api/routine/location/sharing", { on: false });
    record(`${PRIYA.name} cannot turn sharing off or on — only the owner can`, pShare.status === 403, `status ${pShare.status}: ${pShare.json?.error}`);
    const pCal = await call<CalendarMonthDTO>(priyaCookie, "GET", "/api/routine/calendar");
    record(`${PRIYA.name} opens the same calendar`, pCal.status === 200 && pCal.json?.days[today]?.tasks.length === todayCal?.tasks.length, `status ${pCal.status}`);
  }

  /* ---- Arjun's side: his own calendar and map ---- */
  const arjunCookie = await signIn(ARJUN.email, ARJUN.password);
  record(`${ARJUN.name} signs in`, Boolean(arjunCookie));
  let arjunTabsWanted = "Today|Habits|Rules|Calendar|Map";
  if (arjunCookie) {
    const kView = await call<{ segments: unknown[]; nonNegotiables: unknown[] }>(arjunCookie, "GET", "/api/routine/kid");
    arjunTabsWanted = ["Today", ...(kView.json?.segments.length ? ["Habits"] : []), ...(kView.json?.nonNegotiables.length ? ["Rules"] : []), "Calendar", "Map"].join("|");
    info(`${ARJUN.name}'s side has ${kView.json?.segments.length ?? 0} habit groups and ${kView.json?.nonNegotiables.length ?? 0} rules this week, so his tabs should read ${arjunTabsWanted.replace(/\|/g, " · ")}`);
    const kCal = await call<CalendarMonthDTO>(arjunCookie, "GET", "/api/routine/kid/calendar");
    const kDays = Object.entries(kCal.json?.days ?? {});
    record(`${ARJUN.name}'s calendar has his days, and never a habit rollup`, kCal.status === 200 && kDays.length >= 5 && kDays.every(([, d]) => d.habits === null) && (kCal.json?.days[today]?.tasks.length ?? 0) >= 2, `status ${kCal.status}, ${kDays.length} days, habits ${kDays.map(([, d]) => d.habits).every((h) => h === null) ? "all null" : "NOT all null"}`);
    const kLoc = await call<LocationDayDTO>(arjunCookie, "GET", "/api/routine/kid/location");
    record(`${ARJUN.name}'s map shows his own points, with no link`, kLoc.status === 200 && kLoc.json?.day === today && kLoc.json?.points.length === points.length && kLoc.json?.sharing.on === true && kLoc.json?.sharing.url === null, `status ${kLoc.status}, ${bySource(kLoc.json?.points ?? [])}, on ${kLoc.json?.sharing.on}, url ${kLoc.json?.sharing.url}`);
    const kMap = await call<LocationDayDTO>(arjunCookie, "GET", "/api/routine/location");
    record(`…and the parent's side of the map is not his`, kMap.status === 403, `status ${kMap.status}`);
    const made = await call<LocationPointDTO>(arjunCookie, "POST", "/api/routine/kid/checkin", { place: "Other", note: "Check: no position" });
    madeCheckin = made.json?.id ?? null;
    record(`${ARJUN.name} checks in without a position`, made.status === 201 && made.json?.source === "CHECKIN" && made.json?.place === "Other" && made.json?.lat === 0 && made.json?.lng === 0 && made.json?.accuracy === null, `status ${made.status}, ${made.json?.source} ${made.json?.place} at ${made.json?.lat},${made.json?.lng}`);
    if (madeCheckin) {
      const after = await call<LocationDayDTO>(arjunCookie, "GET", "/api/routine/kid/location");
      record("…and it is now his latest point", after.json?.lastSeen?.id === madeCheckin && after.json?.points.length === points.length + 1, `${after.json?.points.length} points, last seen ${after.json?.lastSeen?.place}`);
      if (prisma) {
        await prisma.locationPoint.deleteMany({ where: { id: madeCheckin } });
        madeCheckin = null;
        const back = await call<LocationDayDTO>(arjunCookie, "GET", "/api/routine/kid/location");
        record("…and once removed the day is as it was", back.json?.points.length === points.length && back.json?.lastSeen?.id === loc.json?.lastSeen?.id, `${back.json?.points.length} points`);
      } else info("not on the clone: the check's own check-in cannot be removed (no route deletes a point)");
    }
    const noPlace = await call<LocationPointDTO>(arjunCookie, "POST", "/api/routine/kid/checkin", { place: "" });
    record("a check-in with no place is refused", noPlace.status === 400, `status ${noPlace.status}: ${noPlace.json?.error}`);
    if (noPlace.status === 201 && noPlace.json?.id && prisma) await prisma.locationPoint.deleteMany({ where: { id: noPlace.json.id } });
  }

  /* ---- the sharing link, from the phone's side ---- */
  const wrong = await postToLink("wrong-link-wrong-link-wrong-link", { _type: "location", lat: 17.4, lon: 78.4, tst: Math.floor(Date.now() / 1000) });
  record("a wrong sharing link is refused", wrong.status === 404 && wrong.text.includes("Unknown link."), `status ${wrong.status}: ${wrong.text.slice(0, 60)}`);
  if (oldSecret) {
    const notLoc = await postToLink(oldSecret, { hello: "there" });
    record("a body that is not a location is refused", notLoc.status === 400 && notLoc.text.includes("Not a location."), `status ${notLoc.status}: ${notLoc.text.slice(0, 60)}`);
    const garbage = await postToLink(oldSecret, "not json at all", true);
    record("…and so is something that is not even JSON", garbage.status === 400, `status ${garbage.status}: ${garbage.text.slice(0, 60)}`);
    const offMap = await postToLink(oldSecret, { _type: "location", lat: 91, lon: 78.4, tst: Math.floor(Date.now() / 1000) });
    const afterOffMap = await call<LocationDayDTO>(ceoCookie, "GET", "/api/routine/location");
    record("a position off the map is accepted and quietly skipped", offMap.status === 200 && offMap.text === "[]" && afterOffMap.json?.points.length === points.length, `status ${offMap.status} ${offMap.text}, still ${afterOffMap.json?.points.length} points`);
  }

  /* ---- Dr Rao and a head of department ---- */
  const raoCookie = await signIn(RAO.email, RAO.password);
  record(`${RAO.name} signs in`, Boolean(raoCookie));
  if (raoCookie) {
    const rLoc = await call<LocationDayDTO>(raoCookie, "GET", "/api/routine/location");
    const rCal = await call<CalendarMonthDTO>(raoCookie, "GET", "/api/routine/calendar");
    const rKid = await call<LocationDayDTO>(raoCookie, "GET", "/api/routine/kid/location");
    record(`${RAO.name} reaches neither the map nor the calendar, from either side`, rLoc.status === 403 && rCal.status === 403 && rKid.status === 403, `map ${rLoc.status}, calendar ${rCal.status}, person's map ${rKid.status}`);
  }
  let outsider: string | null = null;
  for (const email of OUTSIDERS) {
    outsider = await signIn(email, "orbit123");
    if (outsider) break;
  }
  if (!outsider) info("no head of department or manager could sign in with the demo password, skipped");
  else {
    const oCal = await call<CalendarMonthDTO>(outsider, "GET", "/api/routine/calendar");
    const oLoc = await call<LocationDayDTO>(outsider, "GET", "/api/routine/location");
    record("a head of department can't open the calendar or the map", oCal.status === 403 && oLoc.status === 403, `calendar ${oCal.status}, map ${oLoc.status}`);
  }

  /* ---- the CEO turns sharing off and on ---- */
  if (oldSecret) {
    const off = await call<Sharing>(ceoCookie, "POST", "/api/routine/location/sharing", { on: false });
    sharingLeftOff = off.status === 200;
    record("the CEO turns sharing off", off.status === 200 && off.json?.on === false && off.json?.url === null, `status ${off.status}, on ${off.json?.on}`);
    const dead = await postToLink(oldSecret, { _type: "location", lat: 17.4, lon: 78.4, tst: Math.floor(Date.now() / 1000) });
    const offLoc = await call<LocationDayDTO>(ceoCookie, "GET", "/api/routine/location");
    record("…and the old link stops working, the map says off", dead.status === 404 && offLoc.json?.sharing.on === false && offLoc.json?.sharing.url === null, `old link ${dead.status}, on ${offLoc.json?.sharing.on}`);
    const on = await call<Sharing>(ceoCookie, "POST", "/api/routine/location/sharing", { on: true });
    const newSecret = secretOf(on.json?.url);
    if (on.status === 200 && on.json?.on) sharingLeftOff = false;
    record("…then on again, with a NEW link", on.status === 200 && on.json?.on === true && newSecret.length >= 16 && newSecret !== oldSecret, `status ${on.status}, ${newSecret.length} letters, ${newSecret === oldSecret ? "SAME as before" : "different from before"}`);
    const onLoc = await call<LocationDayDTO>(ceoCookie, "GET", "/api/routine/location");
    record("…which the map now shows the owner, and the phone can use", secretOf(onLoc.json?.sharing.url) === newSecret && (await postToLink(newSecret, { _type: "lwt" })).status === 200, `on ${onLoc.json?.sharing.on}`);
  }

  // The check's own check-in is gone by now; sharing stays on, as the owner left it.
  await cleanUp();

  /* ---- the screens, at phone size ---- */
  const browser = await chromium.launch();
  const SCOPE = "[role=tablist], section, .rounded-sheet";

  const arjunCtx = await browser.newContext(PHONE);
  const arjunPage = await arjunCtx.newPage();
  await browserSignIn(arjunPage, ARJUN.email, ARJUN.password);
  await arjunPage.waitForTimeout(2500);
  record(`${ARJUN.name} lands on his own screen`, new URL(arjunPage.url()).pathname === "/person", new URL(arjunPage.url()).pathname);
  await arjunPage.getByRole("tab", { name: "Today", exact: true }).waitFor({ state: "visible" });
  const arjunTabs = await arjunPage.getByRole("tablist", { name: "Your day" }).getByRole("tab").allInnerTexts();
  info(`${ARJUN.name}'s tabs: ${arjunTabs.join(" · ")}`);
  record(`${ARJUN.name} is offered ${arjunTabsWanted.replace(/\|/g, ", ")} — Calendar and Map among them`, arjunTabs.join("|") === arjunTabsWanted, arjunTabs.join(", "));
  // With his phone sharing on its own, the Check in card gives way to one line (2026-09-25).
  record("his Today says his phone is sharing, and keeps his own extra", (await seen(arjunPage, "Sharing your location with your parents: on")) && !(await seen(arjunPage, "Where are you?")) && (await seen(arjunPage, "Call grandma")));
  await photograph(arjunPage, "arjun-1-today.png", `${ARJUN.name}'s Today`, SCOPE, true);

  await openTab(arjunPage, "Calendar");
  const label = await tapToday(arjunPage, today);
  const arjunPanel = (await arjunPage.locator("h3").filter({ hasText: "Today" }).first().innerText().catch(() => "")).trim();
  info(`${ARJUN.name}'s calendar, today's cell: "${await arjunPage.getByRole("button", { name: new RegExp(`^${label}`) }).getAttribute("aria-label")}", panel "${arjunPanel}"`);
  record("his Calendar opens on this month and today's panel lists his tasks and the tutor's homework", (await seen(arjunPage, /^Physics assignment/)) && (await seen(arjunPage, "Homework: Worksheet 3")) && arjunPanel.endsWith("Today"), `panel "${arjunPanel}"`);
  record("…with no habit bars on his side", (await arjunPage.locator("[role=group] .w-6 .bg-ok").count()) === 0, `${await arjunPage.locator("[role=group] .w-6 .bg-ok").count()} bars`);
  await photograph(arjunPage, "arjun-2-calendar.png", `${ARJUN.name}'s Calendar`, SCOPE, true);

  await openTab(arjunPage, "Map");
  record("his Map draws today", await mapReady(arjunPage));
  const arjunSharing = (await arjunPage.getByText("Sharing with your parents").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  record("…shows today's log and says sharing with his parents is on", (await seen(arjunPage, /Today.s log/)) && (await seen(arjunPage, "check-in")) && (await seen(arjunPage, "Maths")) && arjunSharing === "Sharing with your parents: on", `"${arjunSharing}"`);
  record("…and never shows him the link", (await arjunPage.getByText("Phone sharing").count()) === 0 && (await arjunPage.locator("code").count()) === 0);
  await photograph(arjunPage, "arjun-3-map.png", `${ARJUN.name}'s Map`, SCOPE, true);

  await openTab(arjunPage, "Habits");
  await photograph(arjunPage, "arjun-4-habits.png", `${ARJUN.name}'s Habits`, SCOPE, false);
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
  record("his Summary shows today's list and where Arjun was last seen", (await seen(ceoPage, "Physics assignment")) && (await seen(ceoPage, lastSeenRe)), `wanted "Last seen: ${lastSeenWords} · …"`);
  await photograph(ceoPage, "ceo-1-summary.png", "the CEO's Summary", SCOPE, true);

  await openTab(ceoPage, "Calendar");
  await tapToday(ceoPage, today);
  const ceoPanel = (await ceoPage.locator("h3").filter({ hasText: "Today" }).first().innerText().catch(() => "")).trim();
  const bars = await ceoPage.locator("[role=group] .w-6 .bg-ok").count();
  record("his Calendar shows today's panel and the habit bars under the marked days", (await seen(ceoPage, /^Physics assignment/)) && (await seen(ceoPage, "Homework: Worksheet 3")) && ceoPanel.endsWith("Today") && bars >= 3, `panel "${ceoPanel}", ${bars} habit bars`);
  record("…the week nav stays out of the way", (await ceoPage.getByRole("button", { name: "Previous week" }).count()) === 0);
  await photograph(ceoPage, "ceo-2-calendar.png", "the CEO's Calendar", SCOPE, true);

  await openTab(ceoPage, "Map");
  record("his Map draws today", await mapReady(ceoPage));
  const ceoPhoneRows = await logRows(ceoPage).filter({ hasText: /phone/ }).count();
  record(`…says where ${ARJUN.name} was last seen, shows today's log with the phone's points in it`, (await seen(ceoPage, lastSeenRe)) && (await seen(ceoPage, /Today.s log/)) && ceoPhoneRows >= 1, `wanted "Last seen: ${lastSeenWords} · …"; ${await logRows(ceoPage).count()} log rows, ${ceoPhoneRows} from the phone`);
  const sw = ceoPage.getByRole("switch").first();
  const swOn = (await sw.count()) ? await sw.getAttribute("aria-checked") : null;
  record("…and, for the owner, phone sharing is on with a link to copy", (await seen(ceoPage, "Phone sharing")) && swOn === "true" && (await ceoPage.locator("code").count()) === 1 && (await seen(ceoPage, "Copy")) && (await seen(ceoPage, /install OwnTracks/)), `switch aria-checked ${swOn}`);
  await photograph(ceoPage, "ceo-3-map.png", "the CEO's Map", SCOPE, true);

  await openTab(ceoPage, "Tutors");
  // The tab body renders <h2>Tutors’ reports</h2> and <h3>Today</h3>; read its text and accept either apostrophe.
  await ceoPage.locator("section h3").first().waitFor({ state: "visible", timeout: 8000 }).catch(() => undefined);
  const tutorsText = (await ceoPage.locator("section").allInnerTexts()).join(" ").replace(/\s+/g, " ");
  record("his Tutors tab lists the tutors’ reports by day, today's first, Maths among them", /Tutors['’] reports/.test(tutorsText) && /\bToday\b/.test(tutorsText) && /\bMaths\b/.test(tutorsText), `"${tutorsText.slice(tutorsText.search(/Tutors['’]/), tutorsText.search(/Tutors['’]/) + 80)}"`);
  await photograph(ceoPage, "ceo-4-tutors.png", "the CEO's Tutors", SCOPE, true);
  await openTab(ceoPage, "Circle");
  record(`his Circle names the people around ${ARJUN.name}`, (await seen(ceoPage, `People around ${ARJUN.name}`)) && (await seen(ceoPage, PRIYA.name)));
  await photograph(ceoPage, "ceo-5-circle.png", "the CEO's Circle", SCOPE, true);
  await openTab(ceoPage, "Tracker");
  await photograph(ceoPage, "ceo-6-tracker.png", "the CEO's Tracker", SCOPE, false);
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
  record(`${PRIYA.name} sees Summary, Tracker, Calendar, Map and Tutors — no Circle`, priyaTabs.join("|") === "Summary|Tracker|Calendar|Map|Tutors", priyaTabs.join(", "));
  await photograph(priyaPage, "priya-1-family.png", `${PRIYA.name}'s Well Being`, SCOPE, true);
  await openTab(priyaPage, "Map");
  record(`${PRIYA.name}'s Map draws today`, await mapReady(priyaPage));
  const priyaPhoneRows = await logRows(priyaPage).filter({ hasText: /phone/ }).count();
  record(`…shows the same day, and never the sharing switch or the link`, (await seen(priyaPage, lastSeenRe)) && (await seen(priyaPage, /Today.s log/)) && priyaPhoneRows >= 1 && (await priyaPage.getByText("Phone sharing").count()) === 0 && (await priyaPage.getByRole("switch").count()) === 0 && (await priyaPage.locator("code").count()) === 0, `wanted "Last seen: ${lastSeenWords} · …"; ${priyaPhoneRows} log rows from the phone`);
  await photograph(priyaPage, "priya-2-map.png", `${PRIYA.name}'s Map`, SCOPE, true);
  await priyaCtx.close();

  const raoCtx = await browser.newContext(PHONE);
  const raoPage = await raoCtx.newPage();
  await browserSignIn(raoPage, RAO.email, RAO.password);
  await raoPage.goto(`${BASE}/mentor`);
  await raoPage.waitForTimeout(2500);
  record(`${RAO.name} stays on the tutor's page`, new URL(raoPage.url()).pathname === "/mentor", new URL(raoPage.url()).pathname);
  record(`${RAO.name}'s screen shows ${ARJUN.name} · Maths and nothing of the map or the calendar`, (await seen(raoPage, `${ARJUN.name} · Maths`)) && (await raoPage.getByText("Last seen").count()) === 0 && (await raoPage.getByRole("tab").count()) === 0);
  await photograph(raoPage, "rao-1-mentor.png", `${RAO.name}'s screen`, "", true);
  await raoCtx.close();

  await browser.close();
  info("screens: arjun-1-today, arjun-2-calendar, arjun-3-map, arjun-4-habits, ceo-1-summary, ceo-2-calendar, ceo-3-map, ceo-4-tutors, ceo-5-circle, ceo-6-tracker, priya-1-family, priya-2-map, rao-1-mentor");
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    await cleanUp();
    writeFileSync(`${DIR}/check-circle-2.txt`, lines.join("\n") + `\n\n${pass} passed, ${fail} failed\n`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma?.$disconnect();
    process.exit(fail ? 1 : 0);
  });
