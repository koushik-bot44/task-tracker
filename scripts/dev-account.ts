/* The developers' own account (owner's developer, 2026-10-01): a separate login with
   its own password that sees everything the CEO sees — the CEO role, Well Being
   included (lib/routine.ts getOwnedPersons) — while the real CEO stays the oldest
   CEO-role account (reviewAttendeeIds). Its actions show under its own name.

   No address lives in this file (never commit one). Local clone by default;
   production only with --prod.
     DEV_PASSWORD='…' npx tsx --env-file=.env.local scripts/dev-account.ts --email you@x.com --name "Your name"
     DEV_PASSWORD='…' npx tsx --env-file=.env scripts/dev-account.ts --prod --email you@x.com --name "Your name"
     npx tsx --env-file=.env scripts/dev-account.ts --prod --remove --email you@x.com
   Running it again for the same address only resets that account's password. */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/password";
import { findUserIdByEmail, isEmailShaped, normalizeEmail } from "@/lib/user-emails";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const url = process.env.DATABASE_URL ?? "";
const local = /127\.0\.0\.1|localhost/.test(url);
if (!local && !flag("--prod")) throw new Error("DATABASE_URL is not the local clone; pass --prod to change production on purpose.");
const host = url.replace(/^[^@]*@/, "").replace(/[/?].*$/, "");

const prisma = new PrismaClient();

async function main() {
  const email = normalizeEmail(value("--email") ?? "");
  if (!isEmailShaped(email)) throw new Error("--email is missing or not an address");
  const ceo = await prisma.user.findFirst({ where: { role: "FOUNDER" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!ceo) throw new Error("no CEO account yet; sign up the CEO first");
  const existingId = await findUserIdByEmail(email);
  const existing = existingId ? await prisma.user.findUnique({ where: { id: existingId }, select: { id: true, role: true, email: true } }) : null;
  if (existing && (existing.id === ceo.id || existing.role !== "FOUNDER" || existing.email !== email)) {
    throw new Error("that address already belongs to another account; refusing to take it over");
  }

  if (flag("--remove")) {
    if (!existing) return console.log(`${host}: no developer account for that address`);
    await prisma.user.update({ where: { id: existing.id }, data: { disabledAt: new Date(), sessionVersion: { increment: 1 } } });
    return console.log(`${host}: developer account disabled (its sessions ended)`);
  }

  const password = process.env.DEV_PASSWORD ?? "";
  if (password.length < 8) throw new Error("set DEV_PASSWORD (8 characters or more)");
  const passwordHash = await hashPassword(password);
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, disabledAt: null, status: "ACTIVE", sessionVersion: { increment: 1 } } });
    return console.log(`${host}: developer account already there; password reset`);
  }
  const name = (value("--name") ?? "Developer").trim();
  await prisma.user.create({ data: { email, name, passwordHash, role: "FOUNDER", status: "ACTIVE" } });
  console.log(`${host}: developer account created (CEO role, sees everything)`);
}

main()
  .catch((e) => {
    console.error(String(e));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
