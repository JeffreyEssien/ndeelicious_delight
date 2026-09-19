import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customerUpsert: vi.fn(),
  cakeInsert: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "customers") {
        return {
          upsert: () => ({
            select: () => ({ single: mocks.customerUpsert }),
          }),
        };
      }
      if (table === "custom_cake_orders") return { insert: mocks.cakeInsert };
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));
vi.mock("@/lib/email/resend", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/email/resend")>(),
  sendTransactionalEmail: mocks.sendEmail,
}));

import { POST } from "./route";

const validCake = {
  occasion: "Birthday",
  size: "6 inch",
  flavour: "Vanilla bean",
  filling: "Vanilla buttercream",
  design: "Soft & minimal",
  colours: "Cream",
  inscription: "Happy birthday",
  deliveryDate: "2099-09-30",
  referenceName: "",
  customerName: "Ada <baker>",
  email: "ada@example.com",
  phone: "08012345678",
  customerNote: "",
};

describe("POST /api/cakes/quote", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
    mocks.customerUpsert.mockResolvedValue({ data: { id: "customer-id" }, error: null });
    mocks.cakeInsert.mockResolvedValue({ error: null });
    mocks.sendEmail.mockResolvedValue({ sent: true });
  });

  it("rejects incomplete cake requests", async () => {
    const response = await POST(new Request("http://localhost/api/cakes/quote", {
      method: "POST",
      body: JSON.stringify({ occasion: "Birthday" }),
    }));
    expect(response.status).toBe(400);
  });

  it("persists the request and sends escaped customer and admin emails", async () => {
    const response = await POST(new Request("http://localhost/api/cakes/quote", {
      method: "POST",
      body: JSON.stringify(validCake),
    }));

    expect(response.status).toBe(201);
    expect(mocks.cakeInsert).toHaveBeenCalledOnce();
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "ada@example.com" }));
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "owner@example.com",
      replyTo: "ada@example.com",
    }));
    for (const [email] of mocks.sendEmail.mock.calls) {
      expect(email.html).toContain("Ada &lt;baker&gt;");
      expect(email.html).not.toContain("Ada <baker>");
    }
  });
});
