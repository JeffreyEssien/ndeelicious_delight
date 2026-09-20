import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), createTransport: vi.fn() }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: (...args: unknown[]) => {
      mocks.createTransport(...args);
      return { sendMail: mocks.sendMail };
    },
  },
}));

import { emailFrame, escapeHtml, sendTransactionalEmail } from "./mailer";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("SMTP transactional email", () => {
  it("escapes customer-controlled HTML", () => {
    expect(escapeHtml(`<script>"bread" & 'butter'</script>`)).toBe(
      "&lt;script&gt;&quot;bread&quot; &amp; &#39;butter&#39;&lt;/script&gt;",
    );
    expect(emailFrame("Hello <team>", "<p>Trusted body</p>")).toContain("Hello &lt;team&gt;");
  });

  it("does not create a transport without server configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASSWORD", "");
    vi.stubEnv("SMTP_FROM_EMAIL", "");

    await expect(
      sendTransactionalEmail({ to: "customer@example.com", subject: "Hello", html: "<p>Hello</p>" }),
    ).resolves.toEqual({ sent: false, reason: "not-configured" });
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("sends through Gmail SMTP with STARTTLS and an app password", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_USER", "bakery@gmail.com");
    vi.stubEnv("SMTP_PASSWORD", "app-password");
    vi.stubEnv("SMTP_FROM_EMAIL", "bakery@gmail.com");
    vi.stubEnv("SMTP_FROM_NAME", "Ndeeelicious Test");
    mocks.sendMail.mockResolvedValue({ messageId: "smtp-message-id" });

    await expect(
      sendTransactionalEmail({
        to: "customer@example.com",
        replyTo: "reply@example.com",
        subject: "Order received",
        html: "<p>Thank you</p>",
      }),
    ).resolves.toEqual({ sent: true, id: "smtp-message-id" });

    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.gmail.com", port: 587, secure: false, requireTLS: true }),
    );
    expect(mocks.sendMail).toHaveBeenCalledWith({
      from: { name: "Ndeeelicious Test", address: "bakery@gmail.com" },
      to: "customer@example.com",
      replyTo: "reply@example.com",
      subject: "Order received",
      html: "<p>Thank you</p>",
    });
  });

  it("reports SMTP failures without throwing into the customer flow", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_USER", "bakery@gmail.com");
    vi.stubEnv("SMTP_PASSWORD", "app-password");
    mocks.sendMail.mockRejectedValue({ code: "EAUTH" });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      sendTransactionalEmail({ to: "customer@example.com", subject: "Hello", html: "<p>Hello</p>" }),
    ).resolves.toEqual({ sent: false, reason: "provider-error" });
  });
});
