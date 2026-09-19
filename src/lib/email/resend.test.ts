import { afterEach, describe, expect, it, vi } from "vitest";
import { emailFrame, escapeHtml, sendTransactionalEmail } from "./resend";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("transactional email", () => {
  it("escapes customer-controlled HTML", () => {
    expect(escapeHtml(`<script>"bread" & 'butter'</script>`)).toBe(
      "&lt;script&gt;&quot;bread&quot; &amp; &#39;butter&#39;&lt;/script&gt;",
    );
    expect(emailFrame("Hello <team>", "<p>Trusted body</p>")).toContain("Hello &lt;team&gt;");
  });

  it("does not call the provider without server configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SMTP_FROM_EMAIL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendTransactionalEmail({ to: "customer@example.com", subject: "Hello", html: "<p>Hello</p>" }),
    ).resolves.toEqual({ sent: false, reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the expected Resend request when configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("SMTP_FROM_EMAIL", "orders@example.com");
    vi.stubEnv("SMTP_FROM_NAME", "Ndeeelicious Test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendTransactionalEmail({
        to: "customer@example.com",
        replyTo: "reply@example.com",
        subject: "Order received",
        html: "<p>Thank you</p>",
      }),
    ).resolves.toEqual({ sent: true, id: "email-123" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: { authorization: "Bearer test-key", "content-type": "application/json" },
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      from: "Ndeeelicious Test <orders@example.com>",
      to: ["customer@example.com"],
      subject: "Order received",
      html: "<p>Thank you</p>",
      reply_to: "reply@example.com",
    });
  });

  it("reports provider failures without throwing into the customer flow", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("SMTP_FROM_EMAIL", "orders@example.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      sendTransactionalEmail({ to: "customer@example.com", subject: "Hello", html: "<p>Hello</p>" }),
    ).resolves.toEqual({ sent: false, reason: "provider-error" });
  });
});
