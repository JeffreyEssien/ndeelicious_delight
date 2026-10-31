import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn(), maybeSingle: vi.fn() }));

vi.mock("@/lib/email/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/mailer")>()),
  sendTransactionalEmail: mocks.sendEmail,
}));

import { emailFailureReason, retryFailedOrderEmails, sendPaidOrderAdminNotification } from "./notifications";

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

describe("scheduled retry of order emails", () => {
  it("picks up failed or stuck emails from the last three days, five tries at most", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    // A chainable stand-in that records every filter and returns two due emails, then
    // lets each delivery attempt find nothing to claim.
    const chain = (result: unknown) => {
      const proxy: Record<string, unknown> = new Proxy(
        {},
        {
          get: (_, name: string) =>
            name === "then"
              ? (resolve: (value: unknown) => void) => resolve(result)
              : (...args: unknown[]) => {
                  calls.push([name, ...args]);
                  return proxy;
                },
        },
      );
      return proxy;
    };
    let first = true;
    const fakeDb = {
      from: () => {
        const result = first ? { data: [{ id: "a" }, { id: "b" }] } : { data: null };
        first = false;
        return chain(result);
      },
    };
    const now = new Date("2026-10-31T12:00:00Z");
    await expect(retryFailedOrderEmails(fakeDb as never, now)).resolves.toEqual({ tried: 2, sent: 0 });
    expect(calls).toContainEqual(["in", "status", ["PENDING", "FAILED", "SENDING"]]);
    expect(calls).toContainEqual(["lte", "next_attempt_at", now.toISOString()]);
    expect(calls).toContainEqual(["lt", "attempts", 5]);
    expect(calls).toContainEqual(["gte", "created_at", "2026-10-28T12:00:00.000Z"]);
    expect(calls.filter(([name]) => name === "update")).toHaveLength(2);
  });
});
