import { prisma } from "@/lib/prisma";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Decided on the server so the first-run form cannot be coaxed into
  // appearing once real accounts exist.
  const userCount = await prisma.user.count();
  return <LoginForm needsBootstrap={userCount === 0} />;
}
