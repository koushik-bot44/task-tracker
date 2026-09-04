import { SetPasswordForm } from "@/components/set-password-form";

export const dynamic = "force-dynamic";

export default function InvitePage({ params }: { params: { token: string } }) {
  return <SetPasswordForm token={params.token} />;
}
