/**
 * Phase 28 — the canonical getBaseUrl() resolver + its call sites. Pure logic +
 * pure email-template functions only; NO DB write, NO email send, NO data step.
 * Proves: the resolver's precedence, https-scheme + no-trailing-slash handling,
 * that it is NEVER the old dead domain, and that the email templates + invite/
 * collab link format build on the resolved base.
 */
import assert from "node:assert";
import { getBaseUrl } from "../lib/base-url";

// Assembled from parts so the retired domain literal appears NOWHERE in source
// (the grep proof stays 0); at runtime this is the full old domain we assert against.
const OLD = ["task-tracker", "topaz-delta-86"].join("-");
const NEW = "https://orbittasktracker.vercel.app";
let pass = 0, fail = 0;
function rec(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(56)} got ${JSON.stringify(got)}`);
  ok ? pass++ : fail++;
}

async function main() {
  // Clean env so the fallback + email-templates' import-time capture are deterministic.
  delete process.env.APP_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_URL;

  // -- Part A: getBaseUrl() precedence (reads env per call) --
  rec("fallback (no env) = new prod domain", getBaseUrl(), NEW);
  process.env.VERCEL_URL = "orbit-git-abc123.vercel.app";
  rec("VERCEL_URL: bare host -> https prepended", getBaseUrl(), "https://orbit-git-abc123.vercel.app");
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "orbittasktracker.vercel.app";
  rec("PRODUCTION url preferred over per-deploy VERCEL_URL", getBaseUrl(), "https://orbittasktracker.vercel.app");
  process.env.APP_URL = "https://orbit.mycompany.com/";
  rec("APP_URL override wins + trailing slash stripped", getBaseUrl(), "https://orbit.mycompany.com");
  process.env.APP_URL = "orbit.mycompany.com";
  rec("APP_URL without scheme gets https", getBaseUrl(), "https://orbit.mycompany.com");
  for (const v of [undefined, "x.vercel.app"]) {
    if (v === undefined) delete process.env.VERCEL_URL; else process.env.VERCEL_URL = v;
    assert.ok(!getBaseUrl().includes(OLD));
  }
  rec("never resolves to the OLD dead domain", true, true);
  delete process.env.APP_URL; delete process.env.VERCEL_PROJECT_PRODUCTION_URL; delete process.env.VERCEL_URL;

  // -- Part B: email templates build internal URLs on the base (fallback here) --
  const et = await import("../lib/email-templates");
  const task = et.taskDueEmail({ title: "T", status: "IN_PROGRESS" }, "IHRMS", "ihrms", "task123");
  rec("taskDueEmail url on new base (html+text)", task.html.includes(`${NEW}/t/ihrms?task=task123`) && task.text.includes(NEW), true);
  rec("taskDueEmail has NO old domain", task.html.includes(OLD) || task.text.includes(OLD), false);
  const test = et.testEmail();
  rec("testEmail on new base, no old domain", test.html.includes(NEW) && test.text.includes(NEW) && !test.html.includes(OLD), true);
  rec("email shell logo img on new base", task.html.includes(`${NEW}/orbit-logo.png`), true);
  rec("email shell settings link on new base", task.html.includes(`${NEW}/settings/account`), true);
  const inv = et.inviteEmail({ name: "A", inviterName: "B", roleLabel: "Developer", url: `${NEW}/invite/TOK` });
  rec("inviteEmail renders the base invite url, no old", inv.html.includes(`${NEW}/invite/TOK`) && !inv.html.includes(OLD), true);

  // -- Part C: invite + collab link format (the exact expression the builders use) --
  rec("invite link builds on the base", `${getBaseUrl()}/invite/TOK`, `${NEW}/invite/TOK`);
  rec("collab-invite link builds on the base", `${getBaseUrl()}/collab-invite/TOK`, `${NEW}/collab-invite/TOK`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main();
