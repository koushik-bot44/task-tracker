import { NextResponse } from "next/server";
import { requireManager, route } from "@/lib/session";
import { sendWhatsAppToUser, whatsAppConfigured, whatsAppContentSid, whatsAppFrom } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fills a 2-variable template ({{1}},{{2}}); ignored on the freeform path.
const TEST_VARS = { "1": "Orbit test message", "2": "WhatsApp alerts are working ✅" };

/**
 * Manager-only diagnostic (GET): what the server will actually send with, without
 * sending. Visit /api/whatsapp/test in the browser while signed in as a manager to
 * see it. Confirms config is present and — the common gotcha — that the From is a
 * proper "whatsapp:+…" channel address.
 */
export const GET = route(async (req: Request) => {
  const user = await requireManager();
  const base = {
    configured: whatsAppConfigured(),
    from: whatsAppFrom(),
    contentSid: whatsAppContentSid(),
    yourPhone: user.phone,
    yourWhatsAppOptIn: user.whatsappOptIn,
  };
  // ?send=1 actually sends and returns the FULL Twilio result (code + message) as
  // browser-readable JSON — the toast truncates it. Diagnostic only.
  if (new URL(req.url).searchParams.get("send") !== "1") return NextResponse.json(base);
  if (!base.configured) return NextResponse.json({ ...base, attempted: false, note: "not configured" });
  if (!user.phone) return NextResponse.json({ ...base, attempted: false, note: "no phone on your account" });
  if (!user.whatsappOptIn) return NextResponse.json({ ...base, attempted: false, note: "whatsappOptIn is off" });
  const r = await sendWhatsAppToUser(user.id, "✅ Orbit diagnostic test", {
    kind: "test",
    refId: user.id,
    keyExtra: String(Date.now()),
    vars: TEST_VARS,
  });
  return NextResponse.json({ ...base, attempted: true, to: `whatsapp:${user.phone}`, result: r });
});

/**
 * Phase 32 — a dev/test trigger, MANAGER-only and gated on TWILIO config. It
 * sends the CALLER a WhatsApp to their OWN account number, so the WhatsApp
 * channel is verifiable immediately without scheduling a meeting. Mirrors the old
 * push/email "send test" pattern (phase 25 removed those for go-live; this one is
 * just as removable). Never sends to anyone else — only the caller.
 */
export const POST = route(async () => {
  const user = await requireManager();

  if (!whatsAppConfigured()) {
    return NextResponse.json(
      { error: "WhatsApp isn't configured on the server yet (TWILIO_* env not set)." },
      { status: 503 },
    );
  }
  if (!user.phone) {
    return NextResponse.json(
      { error: "Add a WhatsApp number to your account first, in Settings." },
      { status: 400 },
    );
  }
  if (!user.whatsappOptIn) {
    return NextResponse.json(
      { error: "WhatsApp alerts are off for your account — turn them on first." },
      { status: 400 },
    );
  }

  const message =
    "✅ *Orbit test message*\n\nWhatsApp alerts are working for your account — this is where meeting notifications will arrive.";
  // Unique keyExtra so a repeated test is never deduped away.
  const r = await sendWhatsAppToUser(user.id, message, {
    kind: "test",
    refId: user.id,
    keyExtra: String(Date.now()),
    vars: TEST_VARS,
  });

  if (r.sent) return NextResponse.json({ ok: true });
  if (r.reason === "not-joined") {
    return NextResponse.json(
      {
        error: `Your number hasn't joined the WhatsApp sandbox yet (Twilio ${r.code ?? "63015"}). Send the sandbox join code from your WhatsApp to the sandbox number, then try again.`,
      },
      { status: 409 },
    );
  }
  // 21654 "ContentSid Required" = this sender only accepts an approved template
  // (the Twilio trial + production WhatsApp both do). Set TWILIO_CONTENT_SID to the
  // template's ContentSid (HX…) and redeploy.
  if (r.code === 21654 || /ContentSid/i.test(r.detail ?? "")) {
    return NextResponse.json(
      {
        error:
          "This WhatsApp sender only accepts an approved template. Set TWILIO_CONTENT_SID to your template's ContentSid (HX…) in Vercel and redeploy, then retry.",
      },
      { status: 409 },
    );
  }
  // Surface the exact Twilio code + message so a manager can diagnose the sandbox
  // (bad credentials, a From that isn't exactly "whatsapp:+…", etc.) without the
  // server logs. Manager-only endpoint, so this detail is safe to return.
  const detail = [r.code ? `Twilio ${r.code}` : null, r.detail].filter(Boolean).join(": ");
  return NextResponse.json(
    { error: `Couldn't send the WhatsApp message${detail ? ` — ${detail}` : "."}` },
    { status: 502 },
  );
});
