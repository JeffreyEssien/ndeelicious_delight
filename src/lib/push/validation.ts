import { z } from "zod";

// What PushManager.subscribe() returns, serialised with toJSON().
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
