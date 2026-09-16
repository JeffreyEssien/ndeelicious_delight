import { z } from "zod";

export const requestOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export const verifyOtpSchema = requestOtpSchema.extend({
  token: z.string().trim().regex(/^\d{6}$/),
});

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
