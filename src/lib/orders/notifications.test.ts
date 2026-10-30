import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn(), maybeSingle: vi.fn() }));

vi.mock("@/lib/email/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/mailer")>()),
  sendTransactionalEmail: mocks.sendEmail,
}));

import { emailFailureReason, sendPaidOrderAdminNotification } from "./notifications";

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

describe("why an email was not sent", () => {
  it("turns mail server replies into plain words for the admin", () => {
    expect(emailFailureReason("not-configured")).toMatch(/isn't set up/);
    expect(emailFailureReason("provider-error: EAUTH 535-5.7.8 Username and Password not accepted")).toMatch(
      /refused the login/,
    );
    expect(emailFailureReason("provider-error: EENVELOPE 550 5.4.5 Daily user sending limit exceeded")).toMatch(
      /daily sending limit/,
    );
    expect(emailFailureReason("provider-error: ETIMEDOUT")).toBe("The mail server said: ETIMEDOUT");
    expect(emailFailureReason(null)).toBe("No reason was given.");
  });
});
