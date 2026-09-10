/* Well Being demo data (2026-09-10) — Rahul's routine, ready for a review.
 *   npx tsx --env-file=.env.local scripts/dev-seed-wellbeing.ts           (local clone; dev server up)
 *   npx tsx --env-file=.env.local scripts/dev-seed-wellbeing.ts --undo
 *   production (only on purpose):
 *   SCREEN_BASE=https://orbittasktracker.vercel.app npx tsx --env-file=.env scripts/dev-seed-wellbeing.ts --production
 *
 * Well Being is the CEO's alone, and an owner has exactly one person. The one
 * person already in the data — Arjun, with the habits, marks, weights and tasks
 * he had before — belonged to a manager, so since Well Being became the CEO's
 * nobody could open him. This gives him to the CEO, then fills in the weeks
 * around today from both sides, the way it would really happen: the CEO marks
 * the past weeks, schedules rules, sets tasks and logs weight; Arjun marks this
 * week's habits and ticks his own tasks and rules, signed in as himself.
 *
 * Nothing that was there before is changed or removed — only empty days are
 * filled. Everything added is recorded under .localdb/ so --undo takes back
 * exactly that, and hands Arjun back to his previous owner if this moved him.
 */
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_PASSWORD ?? "orbit123";
/** Invisible, so a task reads normally, but it tells this script's tasks apart. */
const MARK = "\u200B";

const dbUrl = process.env.DATABASE_URL ?? "";
const LOCAL = /127\.0\.0\.1|localhost/.test(dbUrl);
const HOST = LOCAL ? "local" : (dbUrl.match(/@([^/:?]+)/)?.[1] ?? "remote");
const MANIFEST = `.localdb/seed-wellbeing-${HOST}.json`;

type Manifest = {
  personId: string;
  adoptedFrom: string | null;
  tasks: string[];
  weights: string[];
  rules: string[];
  habitMarks: { habitId: string; date: string }[];
  /** The person's login before it was given a demo address, put back on --undo. */
  login?: { from: string; to: string };
};

/* ---- days, as the app counts them (India time) ---- */
const IST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const todayKey = () => IST.format(new Date());
const keyToUtc = (k: string) => new Date(`${k}T00:00:00Z`);
function addDays(k: string, n: number): string {
  const d = keyToUtc(k);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(k: string): string {
  return addDays(k, -((keyToUtc(k).getUTCDay() + 6) % 7));
}
function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}
/** The same answer every run for the same seed, so a re-seed looks the same. */
function chance(seed: string): number {
  let h = 2166136261;
  for (const c of seed) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
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

function save(m: Manifest) {
  mkdirSync(".localdb", { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

async function undoSeed() {
  if (!existsSync(MANIFEST)) {
    console.log("nothing recorded for this database — nothing to undo");
    return;
  }
  const m: Manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const tasks = await prisma.routineTask.deleteMany({ where: { id: { in: m.tasks } } });
  const weights = await prisma.weightEntry.deleteMany({ where: { id: { in: m.weights } } });
  const rules = await prisma.nonNegotiable.deleteMany({ where: { id: { in: m.rules } } });
  let marks = 0;
  for (const x of m.habitMarks) marks += (await prisma.habitMark.deleteMany({ where: { habitId: x.habitId, date: keyToUtc(x.date) } })).count;
  if (m.login) {
    const owner = await prisma.person.findUnique({ where: { id: m.personId }, select: { userId: true } });
    const back = owner ? await prisma.user.updateMany({ where: { id: owner.userId, email: m.login.to }, data: { email: m.login.from } }) : { count: 0 };
    if (back.count) console.log("the person signs in with their old address again");
  }
  if (m.adoptedFrom) {
    const previous = await prisma.user.findUnique({ where: { id: m.adoptedFrom }, select: { id: true } });
    if (previous) {
      await prisma.person.update({ where: { id: m.personId }, data: { managerId: previous.id } });
      console.log("the person is back with their previous owner");
    }
  }
  unlinkSync(MANIFEST);
  console.log(`removed ${tasks.count} tasks, ${weights.count} weights, ${rules.count} rules (with their days), ${marks} habit marks`);
}

async function main() {
  if (!LOCAL && !process.argv.includes("--production")) {
    console.error(`This is not the local clone (${HOST}). Re-run with --production only if you mean to change that database.`);
    process.exit(1);
  }
  console.log(`database: ${LOCAL ? "local clone" : HOST} · app: ${BASE}`);
  if (process.argv.includes("--undo")) return undoSeed();

  const ceo = await prisma.user.findFirst({ where: { role: "FOUNDER" }, select: { id: true, email: true } });
  if (!ceo) throw new Error("there is no CEO account");

  /* 1. The CEO's person: his own, or the one person nobody can open any more. */
  let person = await prisma.person.findUnique({ where: { managerId: ceo.id }, select: { id: true, name: true, userId: true } });
  let adoptedFrom: string | null = null;
  if (!person) {
    const orphans = await prisma.person.findMany({ where: { manager: { role: { not: "FOUNDER" } } }, select: { id: true, name: true, userId: true, managerId: true } });
    if (orphans.length !== 1) throw new Error(`expected exactly one person that nobody can open, found ${orphans.length} — not guessing`);
    adoptedFrom = orphans[0].managerId;
    await prisma.person.update({ where: { id: orphans[0].id }, data: { managerId: ceo.id } });
    person = { id: orphans[0].id, name: orphans[0].name, userId: orphans[0].userId };
    console.log(`${person.name} is now in the CEO's Well Being, with everything from before`);
  } else {
    console.log(`the CEO's Well Being person: ${person.name}`);
  }

  if (await prisma.routineTask.count({ where: { personId: person.id, title: { endsWith: MARK } } })) {
    if (adoptedFrom && existsSync(MANIFEST)) {
      const old: Manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
      old.adoptedFrom = old.adoptedFrom ?? adoptedFrom;
      save(old);
    }
    console.log("already seeded — nothing added (run --undo first to seed again)");
    return;
  }

  const m: Manifest = { personId: person.id, adoptedFrom, tasks: [], weights: [], rules: [], habitMarks: [] };
  save(m);

  const ceoCookie = await signIn(ceo.email);
  if (!ceoCookie) throw new Error("the CEO could not sign in with the seed password");
  // A login a reviewer can type, like every other demo account: <first name>@orbit.local.
  // Changed through the CEO's own edit screen; --undo puts the old one back.
  let loginEmail = (await prisma.user.findUnique({ where: { id: person.userId }, select: { email: true } }))?.email ?? null;
  const demoLogin = `${person.name.trim().split(/\s+/)[0].toLowerCase()}@orbit.local`;
  if (loginEmail && !loginEmail.endsWith("@orbit.local")) {
    const res = await call(ceoCookie, "PATCH", "/api/routine/person", { email: demoLogin });
    if (res.status === 200) {
      m.login = { from: loginEmail, to: demoLogin };
      save(m);
      loginEmail = demoLogin;
      console.log(`${person.name} now signs in as ${demoLogin}`);
    } else {
      console.log(`  giving ${person.name} a demo login -> ${res.status}`);
    }
  }
  const personCookie = loginEmail ? await signIn(loginEmail) : null;
  console.log(personCookie ? `${person.name} signs in, so his side is done as him` : `${person.name} can't sign in with the seed password — his side is written directly`);

  const today = todayKey();
  const thisMonday = mondayOf(today);

  /* 2. Habits: three past weeks marked by the CEO, this week by Arjun. Empty days only. */
  const habits = await prisma.habit.findMany({ where: { segment: { personId: person.id }, active: true }, select: { id: true, targetPerWeek: true } });
  const filled = new Set(
    (await prisma.habitMark.findMany({ where: { habitId: { in: habits.map((h) => h.id) } }, select: { habitId: true, date: true } })).map(
      (x) => `${x.habitId}|${x.date.toISOString().slice(0, 10)}`,
    ),
  );
  let byCeo = 0;
  let byPerson = 0;
  for (const day of dayRange(addDays(thisMonday, -21), today)) {
    for (const h of habits) {
      if (filled.has(`${h.id}|${day}`)) continue;
      // Today is half done, the way a real Thursday afternoon looks.
      if (day === today && chance(`${h.id}|today`) < 0.5) continue;
      const r = chance(`${h.id}|${day}`);
      // A little under each habit's target, like a real week — never a perfect score.
      const met = Math.min(0.88, (h.targetPerWeek / 7) * 0.8 + 0.04);
      const value = r < 0.05 ? "NA" : r < 0.05 + met ? "MET" : "MISSED";
      if (day >= thisMonday) {
        if (personCookie) {
          const res = await call(personCookie, "POST", "/api/routine/kid/habit-mark", { habitId: h.id, date: day, value });
          if (res.status !== 200) { console.log(`  ${person.name}'s mark ${day} -> ${res.status}`); continue; }
        } else {
          await prisma.habitMark.create({ data: { habitId: h.id, date: keyToUtc(day), value } });
        }
        byPerson++;
      } else {
        const res = await call(ceoCookie, "PATCH", "/api/routine/habit-mark", { habitId: h.id, date: day, value });
        if (res.status !== 200) { console.log(`  CEO's mark ${day} -> ${res.status}`); continue; }
        byCeo++;
      }
      m.habitMarks.push({ habitId: h.id, date: day });
    }
  }
  save(m);
  console.log(`habit days filled: ${byCeo} by the CEO (past weeks), ${byPerson} by ${person.name} (this week)`);

  /* 3. Rules: the CEO schedules them for last week and this; Arjun marks what he did. */
  const RULES = [
    { name: "Phone handed in by 10:30 PM on school nights", days: [0, 1, 2, 3, 4] },
    { name: "No gaming until homework is done", days: [0, 2, 4] },
  ];
  let scheduled = 0;
  let marked = 0;
  for (const rule of RULES) {
    const made = await call(ceoCookie, "POST", "/api/routine/non-negotiables", { name: rule.name });
    const id: string | undefined =
      made.json?.id ??
      (await prisma.nonNegotiable.findFirst({ where: { personId: person.id, name: rule.name }, orderBy: { orderKey: "desc" }, select: { id: true } }))?.id;
    if (!id) { console.log(`  rule "${rule.name}" -> ${made.status}`); continue; }
    m.rules.push(id);
    save(m);
    for (const monday of [addDays(thisMonday, -7), thisMonday]) {
      for (const offset of rule.days) {
        const day = addDays(monday, offset);
        const req = await call(ceoCookie, "PATCH", "/api/routine/non-negotiable-mark", { nonNegotiableId: id, date: day, required: true });
        if (req.status !== 200) { console.log(`  scheduling ${day} -> ${req.status}`); continue; }
        scheduled++;
        const due = day < today || (day === today && chance(`${id}|${day}`) < 0.5);
        if (!due) continue;
        const done = chance(`${id}|${day}|done`) < 0.8;
        if (personCookie) {
          const res = await call(personCookie, "POST", "/api/routine/kid/non-negotiable-mark", { nonNegotiableId: id, date: day, done });
          if (res.status !== 200) { console.log(`  ${person.name}'s rule mark ${day} -> ${res.status}`); continue; }
        } else {
          await prisma.nonNegotiableMark.update({ where: { nonNegotiableId_date: { nonNegotiableId: id, date: keyToUtc(day) } }, data: { done } });
        }
        marked++;
      }
    }
  }
  console.log(`rules: ${m.rules.length} added, ${scheduled} days scheduled by the CEO, ${marked} marked by ${person.name}`);

  /* 4. Tasks around today: late, due today, coming up, undated; some ticked by Arjun. */
  const TASKS: { title: string; due: number | null; doneByPerson?: boolean }[] = [
    { title: "Get the field-trip form signed", due: -5, doneByPerson: true },
    { title: "Finish the chemistry lab write-up", due: -2 },
    { title: "Return the library books", due: -1 },
    { title: "Revise algebra chapter 4 for Friday's test", due: 0 },
    { title: "30-minute run after school", due: 0, doneByPerson: true },
    { title: "Pack the gym kit for tomorrow", due: 0 },
    { title: "Driving practice with Dad", due: 2 },
    { title: "Submit the history essay draft", due: 4 },
    { title: "Tidy the desk and study area", due: null, doneByPerson: true },
  ];
  let ticked = 0;
  for (const t of TASKS) {
    const made = await call(ceoCookie, "POST", "/api/routine/tasks", { title: `${t.title}${MARK}`, dueDate: t.due === null ? null : addDays(today, t.due) });
    const id: string | undefined = made.json?.id;
    if (!id) { console.log(`  task "${t.title}" -> ${made.status}`); continue; }
    m.tasks.push(id);
    save(m);
    if (!t.doneByPerson) continue;
    if (personCookie) {
      const res = await call(personCookie, "PATCH", `/api/routine/kid/tasks/${id}`, { done: true });
      if (res.status !== 200) { console.log(`  ${person.name} ticking "${t.title}" -> ${res.status}`); continue; }
    } else {
      await prisma.routineTask.update({ where: { id }, data: { done: true, doneAt: new Date() } });
    }
    ticked++;
  }
  console.log(`tasks: ${m.tasks.length} set by the CEO, ${ticked} ticked done by ${person.name}`);

  /* 5. Weight, once a month, so the trend has a shape. Days that already have one are left alone. */
  const WEIGHTS: [monthsBack: number, day: number, kg: number][] = [
    [-4, 15, 38.9],
    [-3, 14, 39.2],
    [-2, 15, 39.6],
    [-1, 12, 39.8],
    [0, 8, 40.3],
  ];
  for (const [back, dom, kg] of WEIGHTS) {
    const d = keyToUtc(today);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + back);
    d.setUTCDate(dom);
    const day = d.toISOString().slice(0, 10);
    if (day > today) continue;
    if (await prisma.weightEntry.findFirst({ where: { personId: person.id, date: keyToUtc(day) }, select: { id: true } })) continue;
    const made = await call(ceoCookie, "POST", "/api/routine/weight", { date: day, weightKg: kg });
    const id: string | undefined =
      made.json?.id ?? (await prisma.weightEntry.findFirst({ where: { personId: person.id, date: keyToUtc(day), weightKg: kg }, select: { id: true } }))?.id;
    if (!id) { console.log(`  weight ${day} -> ${made.status}`); continue; }
    m.weights.push(id);
    save(m);
  }
  console.log(`weights: ${m.weights.length} logged by the CEO`);
  console.log(`\nrecorded in ${MANIFEST} — "--undo" takes back exactly this`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
