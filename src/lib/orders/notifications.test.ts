import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn(), maybeSingle: vi.fn() }));

vi.mock("@/lib/email/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/mailer")>()),
  sendTransactionalEmail: mocks.sendEmail,
}));

import { sendPaidOrderAdminNotification } from "./notifications";

const db = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
};

describe("order notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
    mocks.sendEmail.mockResolvedValue({ sent: true });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        customer_name: "Taylor <script>",
        order_number: "ND-12345678",
        order_items: [{ product_name: "Cake <large>", variant_name: "Standard", quantity: 1 }],
      },
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("escapes customer and product data in the paid-order admin email", async () => {
    await sendPaidOrderAdminNotification(db as never, "ND-12345678");

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        html: expect.stringContaining("Taylor &lt;script&gt;"),
      }),
    );
    expect(mocks.sendEmail.mock.calls[0][0].html).toContain("Cake &lt;large&gt;");
  });
});
