import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify an inbound Agent Manager webhook. The sender computes
 *   HMAC-SHA256(secret, rawBody)  -> hex
 * and sends it in the `x-arkagent-signature` header (optionally "sha256=" prefixed).
 * Returns true only on a constant-time match.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.AGENT_MANAGER_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const provided = signature.replace(/^sha256=/, "").trim();
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Helper for tests / the mock to sign a payload. */
export function signWebhook(rawBody: string): string {
  const secret = process.env.AGENT_MANAGER_WEBHOOK_SECRET ?? "";
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}
