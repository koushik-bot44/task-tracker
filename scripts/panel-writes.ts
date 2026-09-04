/**
 * Counts the PATCHes the detail panel actually sends while someone types.
 *
 * The owner reported the panel "lagging" and the date "not updating when
 * typing". The date input was fully controlled and patched on every `input`
 * event; a native date input reports "" until all three segments are filled,
 * so each keystroke sent dueDate:null and triggered three query invalidations,
 * then the refetch reset the field under the cursor.
 *
 * This types a date segment by segment and asserts the panel sends ONE write,
 * with the right value, and that the field still holds what was typed.
 *
 * Mutating, so it is confined to a task it creates and deletes.
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const EMAIL = process.env.SHOT_MANAGER_EMAIL ?? process.env.SCREEN_EMAIL;
const PASSWORD = process.env.SHOT_MANAGER_PASSWORD ?? process.env.SCREEN_PASSWORD;
const TITLE = "PW- panel write probe";

let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(46)} got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error("need SHOT_MANAGER_* or SCREEN_* in .env");

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const res = await page.request.post(`${BASE}/api/auth`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok()) throw new Error(`sign-in failed: ${res.status()}`);

  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const project = projects[0];

  const created = await page.request.post(`${BASE}/api/tasks`, {
    data: {
      projectId: project.id,
      title: TITLE,
      dueDate: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  const task = await created.json();

  // Count only the PATCHes to this task.
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().includes(`/api/tasks/${task.id}`)) {
      writes.push(r.postData() ?? "");
    }
  });

  await page.goto(`${BASE}/t/${project.slug}?task=${task.id}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  const date = page.getByLabel("Estimated completion date");
  await date.click();
  writes.length = 0;

  // Type a full date segment by segment, the way a person does.
  await page.keyboard.type("12");
  await page.waitForTimeout(250);
  const afterDay = writes.length;
  await page.keyboard.type("08");
  await page.waitForTimeout(250);
  const afterMonth = writes.length;
  await page.keyboard.type("2026");
  await page.waitForTimeout(1200);
  const afterYear = writes.length;

  check("writes after typing the day only", afterDay, 0);
  check("writes after day + month", afterMonth, 0);
  check("writes once the date is complete", afterYear, 1);

  const sent = writes[0] ? JSON.parse(writes[0]) : {};
  check("the write carries a real date, not null", sent.dueDate !== null && sent.dueDate !== undefined, true);
  /* Compare the LOCAL calendar day, not the UTC slice of the ISO string. The
     field stores local midnight, so in IST 2026-08-12 is 2026-08-11T18:30Z —
     slicing the ISO reads the 11th and would fail a correct implementation.
     lib/dates also reads days locally, so this is the comparison that matches
     how the value is actually used. */
  const localDay = sent.dueDate
    ? new Date(sent.dueDate).toLocaleDateString("sv-SE")
    : "";
  check("the date it sends is the one typed (local day)", localDay, "2026-08-12");

  await page.waitForTimeout(600);
  check("field still shows what was typed", await date.inputValue(), "2026-08-12");

  // Blur must not produce a second identical write.
  await page.getByLabel("Task title").first().click().catch(() => {});
  await page.waitForTimeout(600);
  check("no duplicate write on blur", writes.length, 1);

  await browser.close();

  const gone = await prisma.task.deleteMany({ where: { title: TITLE } });
  const left = await prisma.task.count({ where: { title: TITLE } });
  console.log(`\ncleanup: deleted ${gone.count}, remaining ${left}`);
  console.log(fail === 0 ? "all panel-write checks passed" : `${fail} FAILED`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
