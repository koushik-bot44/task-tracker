import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;
const RETENTION_MS = 10 * 60_000;

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

/**
 * The address is never stored in the clear. Keying the hash with AUTH_SECRET
 * means the table is useless to anyone who obtains it without the secret.
 */
export function hashIp(ip: string): string {
  return createHash("sha256")
    .update(`${ip}${process.env.AUTH_SECRET ?? ""}`)
    .digest("hex");
}

/**
 * Counted in the database, not in process memory, so the limit holds no matter
 * which serverless instance answers. Shared by sign-in and bootstrap: both are
 * password guesses against the same door.
 */
export async function isRateLimited(ipHash: string): Promise<boolean> {
  const recent = await prisma.loginAttempt.count({
    where: { ipHash, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
  });
  return recent >= MAX_ATTEMPTS;
}

export async function recordFailure(ipHash: string): Promise<void> {
  try {
    await prisma.loginAttempt.create({ data: { ipHash } });
    // Housekeeping, best-effort: the window is a minute, so anything older
    // than ten cannot influence a decision.
    void prisma.loginAttempt
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } })
      .catch(() => {});
  } catch (error) {
    console.error("[auth] could not record a failed attempt:", error);
  }
}

export function clearFailures(ipHash: string): void {
  void prisma.loginAttempt.deleteMany({ where: { ipHash } }).catch(() => {});
}
