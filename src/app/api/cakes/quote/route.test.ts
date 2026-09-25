import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customerUpsert: vi.fn(),
  cakeInsert: vi.fn(),
  sendEmail: vi.fn(),
  imageUpload: vi.fn(),
  imageRemove: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    storage: {
      from: () => ({ upload: mocks.imageUpload, remove: mocks.imageRemove }),
    },
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
vi.mock("@/lib/email/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/mailer")>()),
  sendTransactionalEmail: mocks.sendEmail,
}));
vi.mock("@/lib/data/settings", () => ({
  getCakeConfiguration: () =>
    Promise.resolve({
      leadTimeHours: 72,
      options: [
        {
          id: "o",
          type: "occasion",
          name: "Birthday",
          description: "",
          priceAdjustment: 0,
          quoteRequired: false,
          active: true,
          sortOrder: 0,
        },
        {
          id: "s",
          type: "size",
          name: "6 inch",
          description: "",
          priceAdjustment: 3000000,
          quoteRequired: false,
          active: true,
          sortOrder: 0,
        },
        {
          id: "f",
          type: "flavour",
          name: "Vanilla bean",
          description: "",
          priceAdjustment: 0,
          quoteRequired: false,
          active: true,
          sortOrder: 0,
        },
        {
          id: "i",
          type: "filling",
          name: "Vanilla buttercream",
          description: "",
          priceAdjustment: 0,
          quoteRequired: false,
          active: true,
          sortOrder: 0,
        },
        {
          id: "d",
          type: "design",
          name: "Soft & minimal",
          description: "",
          priceAdjustment: 0,
          quoteRequired: false,
          active: true,
          sortOrder: 0,
        },
      ],
    }),
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
    mocks.imageUpload.mockResolvedValue({ error: null });
    mocks.imageRemove.mockResolvedValue({ error: null });
  });

  it("rejects incomplete cake requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/cakes/quote", {
        method: "POST",
        body: JSON.stringify({ occasion: "Birthday" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("persists the request and sends escaped customer and admin emails", async () => {
    const response = await POST(
      new Request("http://localhost/api/cakes/quote", {
        method: "POST",
        body: JSON.stringify(validCake),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.cakeInsert).toHaveBeenCalledOnce();
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "ada@example.com" }));
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        replyTo: "ada@example.com",
      }),
    );
    for (const [email] of mocks.sendEmail.mock.calls) {
      expect(email.html).toContain("Ada &lt;baker&gt;");
      expect(email.html).not.toContain("Ada <baker>");
    }
  });

  it("stores a validated inspiration image privately and saves its storage path", async () => {
    const form = new FormData();
    form.set("configuration", JSON.stringify({ ...validCake, referenceName: "idea.png" }));
    form.set("reference", new File([new Uint8Array([137, 80, 78, 71])], "idea.png", { type: "image/png" }));

    const response = await POST(new Request("http://localhost/api/cakes/quote", { method: "POST", body: form }));

    expect(response.status).toBe(201);
    expect(mocks.imageUpload).toHaveBeenCalledOnce();
    expect(mocks.cakeInsert).toHaveBeenCalledWith(
      expect.objectContaining({ reference_urls: [expect.stringMatching(/^customer-id\/.+\.png$/)] }),
    );
  });

  it("rejects unsupported inspiration files before writing customer data", async () => {
    const form = new FormData();
    form.set("configuration", JSON.stringify({ ...validCake, referenceName: "idea.svg" }));
    form.set("reference", new File(["<svg />"], "idea.svg", { type: "image/svg+xml" }));

    const response = await POST(new Request("http://localhost/api/cakes/quote", { method: "POST", body: form }));

    expect(response.status).toBe(400);
    expect(mocks.customerUpsert).not.toHaveBeenCalled();
    expect(mocks.imageUpload).not.toHaveBeenCalled();
  });
});
