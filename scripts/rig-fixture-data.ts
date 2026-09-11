/* What scripts/rig-fixture.ts makes, shared with the rigs that sign in as it
 * (2026-09-11). Plain data — importing it runs nothing. Every name here is made
 * up; the addresses are the demo addresses the older rigs were written for.
 */
export const RIG_PASSWORD = "orbit123";

export type RigAccount = {
  email: string;
  name: string;
  role: "ADMIN" | "CO_FOUNDER" | "HOD" | "MANAGER" | "TEAM_LEAD" | "RESOURCE";
  department?: string;
  /** The department this account is made head of. */
  heads?: string;
};

export const RIG_ACCOUNTS: readonly RigAccount[] = [
  { email: "admin@orbit.local", name: "Rig Admin", role: "ADMIN" },
  { email: "salyush@orbit.local", name: "Rig Co-founder", role: "CO_FOUNDER" },
  { email: "hod-dev@orbit.local", name: "Rig Development Head", role: "HOD", department: "Development", heads: "Development" },
  { email: "test-manager@orbit.local", name: "Rig Manager", role: "MANAGER", department: "Development" },
  { email: "lead@orbit.local", name: "Rig Lead", role: "TEAM_LEAD", department: "Development" },
  { email: "dev@orbit.local", name: "Rig Dev", role: "RESOURCE", department: "Development" },
  { email: "abhi@orbit.local", name: "Rig Member", role: "RESOURCE", department: "Development" },
  { email: "staff-development-lead@orbit.local", name: "Rig Development Lead", role: "TEAM_LEAD", department: "Development" },
  { email: "staff-development-member-1@orbit.local", name: "Rig Development Member One", role: "RESOURCE", department: "Development" },
  { email: "staff-development-member-2@orbit.local", name: "Rig Development Member Two", role: "RESOURCE", department: "Development" },
  { email: "staff-hr-head@orbit.local", name: "Rig HR Head", role: "HOD", department: "HR", heads: "HR" },
  { email: "staff-accounts-manager@orbit.local", name: "Rig Accounts Manager", role: "MANAGER", department: "Accounts" },
  { email: "staff-accounts-lead@orbit.local", name: "Rig Accounts Lead", role: "TEAM_LEAD", department: "Accounts" },
  { email: "staff-accounts-member-1@orbit.local", name: "Rig Accounts Member One", role: "RESOURCE", department: "Accounts" },
  { email: "staff-accounts-member-2@orbit.local", name: "Rig Accounts Member Two", role: "RESOURCE", department: "Accounts" },
  { email: "staff-erm-member-1@orbit.local", name: "Rig ERM Member", role: "RESOURCE", department: "ERM" },
];

/** A project in Development with one task, for the rigs that look for an existing one (note files, mobile). */
export const RIG_PROJECT = { name: "Rig Fixture Project", slug: "rig-fixture-project", task: "Rig fixture task" };

/** The CEO's Well Being person, with a few weeks of made-up routine. */
export const RIG_PERSON = { email: "rig-person@orbit.local", name: "Rig Person" };

/** Tasks the person had in earlier weeks, before any check ran. */
export const RIG_PERSON_BEFORE_TASKS: readonly string[] = ["Read two chapters", "Practise the times tables", "Tidy the study desk", "Write the science summary", "Finish the art project"];
