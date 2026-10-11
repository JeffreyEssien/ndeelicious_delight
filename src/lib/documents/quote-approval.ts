import { createHmac, timingSafeEqual } from "node:crypto";
export type QuoteApproval = {
  requestId: string;
  quotedTotal: number;
  revision: number;
  updatedAt: string;
  expiresAt: number;
};
function signature(payload: string) {
  const secret = process.env.ADMIN_AUTH_SECRET;
  if (!secret) throw new Error("Quote approval signing is unavailable.");
  return createHmac("sha256", secret).update(payload).digest();
}
export function signQuoteApproval(approval: QuoteApproval) {
  const payload = Buffer.from(JSON.stringify(approval)).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}
export function verifyQuoteApproval(token: string, requestId: string, quotedTotal: number): QuoteApproval {
  const [payload, supplied] = token.split(".");
  const expected = signature(payload ?? "");
  const actual = Buffer.from(supplied ?? "", "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("Preview this quote again.");
  const approval = JSON.parse(Buffer.from(payload, "base64url").toString()) as QuoteApproval;
  if (approval.requestId !== requestId || approval.quotedTotal !== quotedTotal || approval.expiresAt < Date.now())
    throw new Error("Preview this quote again.");
  return approval;
}
