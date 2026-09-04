/**
 * One-off VAPID key generator for Web Push. The OWNER runs this, then sets the
 * keys as environment variables — they are NOT committed and never printed
 * anywhere but here.
 *
 *   npx tsx scripts/gen-vapid.ts
 *
 * Then set (Vercel: all environments; .env locally):
 *   VAPID_PUBLIC_KEY=<public>
 *   VAPID_PRIVATE_KEY=<private>
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public>   # public only, exposed to the client
 *   VAPID_SUBJECT=mailto:you@example.com
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("VAPID keys generated. Set these as env vars (do NOT commit):\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_SUBJECT=mailto:CHANGE_ME@example.com`);
console.log(
  "\nThe two public lines carry the SAME key: the server signs with it, the client subscribes with it.",
);
