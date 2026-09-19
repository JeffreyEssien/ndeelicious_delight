import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), sendEmail: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: () => ({ upsert: mocks.upsert }) }),
}));
vi.mock("@/lib/email/resend", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/email/resend")>(),
  sendTransactionalEmail: mocks.sendEmail,
}));

import { POST } from "./route";

describe("POST /api/newsletter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.sendEmail.mockResolvedValue({ sent: true });
  });

  it("normalizes the subscriber and sends a welcome email", async () => {
    const response = await POST(new Request("http://localhost/api/newsletter", {
      method: "POST",
      body: JSON.stringify({ email: "BAKER@example.com" }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.upsert).toHaveBeenCalledWith(
      { email: "baker@example.com", active: true, unsubscribed_at: null },
      { onConflict: "email" },
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "baker@example.com",
      subject: "Welcome to Ndeeelicious Delight",
    }));
  });
});
