import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn(), fetch: vi.fn() }));

vi.mock("@/lib/email/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/mailer")>()),
  sendTransactionalEmail: mocks.sendEmail,
}));

import { verifyResendWebhook } from "@/lib/email/inbound";
import { POST } from "./route";

const secretBytes = Buffer.from("test-webhook-secret");
const secret = `whsec_${secretBytes.toString("base64")}`;

function signedRequest(body: unknown, { timestamp = Math.floor(Date.now() / 1000), sign = secretBytes } = {}) {
  const payload = JSON.stringify(body);
  const signature = createHmac("sha256", sign).update(`msg_1.${timestamp}.${payload}`).digest("base64");
  return new Request("http://localhost/api/resend/webhook", {
    method: "POST",
    body: payload,
    headers: { "svix-id": "msg_1", "svix-timestamp": String(timestamp), "svix-signature": `v1,${signature}` },
  });
}

const receivedEvent = { type: "email.received", data: { email_id: "email-123", from: "ada@example.com" } };

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("POST /api/resend/webhook", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("INBOUND_FORWARD_TO", "owner@gmail.com");
    vi.stubEnv("SMTP_FROM_EMAIL", "orders@example.com");
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.sendEmail.mockResolvedValue({ sent: true });
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/emails/receiving/email-123?html_format=cid"))
        return jsonResponse({
          from: "ada@example.com",
          subject: "Re: Your order",
          html: "<p>Can it be <b>chocolate</b>?</p>",
          text: "Can it be chocolate?",
          headers: { from: "Ada Lovelace <ada@example.com>" },
        });
      if (url.endsWith("/emails/receiving/email-123/attachments"))
        return jsonResponse({
          data: [
            {
              filename: "design.png",
              size: 3,
              content_type: "image/png",
              content_id: "<img1>",
              download_url: "https://cdn.example/design.png",
            },
          ],
        });
      if (url === "https://cdn.example/design.png") return new Response(new Uint8Array([1, 2, 3]));
      return new Response("not found", { status: 404 });
    });
  });

  it("forwards a received email to the owner with Reply-To set to the sender", async () => {
    const response = await POST(signedRequest(receivedEvent));

    expect(response.status).toBe(200);
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    const email = mocks.sendEmail.mock.calls[0]?.[0];
    expect(email).toMatchObject({
      to: "owner@gmail.com",
      replyTo: "Ada Lovelace <ada@example.com>",
      subject: "Re: Your order",
    });
    expect(email.html).toContain("Ada Lovelace &lt;ada@example.com&gt;");
    expect(email.html).toContain("<b>chocolate</b>");
    expect(email.attachments).toEqual([
      { filename: "design.png", content: Buffer.from([1, 2, 3]), contentType: "image/png", cid: "img1" },
    ]);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails/receiving/email-123?html_format=cid",
      expect.objectContaining({ headers: { Authorization: "Bearer re_test" } }),
    );
  });

  it("rejects requests with a bad signature", async () => {
    const response = await POST(signedRequest(receivedEvent, { sign: Buffer.from("wrong-secret") }));
    expect(response.status).toBe(400);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("rejects stale signatures to prevent replays", async () => {
    const response = await POST(signedRequest(receivedEvent, { timestamp: Math.floor(Date.now() / 1000) - 3600 }));
    expect(response.status).toBe(400);
  });

  it("ignores other event types", async () => {
    const response = await POST(signedRequest({ type: "email.delivered", data: { email_id: "email-123" } }));
    expect(response.status).toBe(200);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 500 so Resend retries when forwarding fails", async () => {
    mocks.sendEmail.mockResolvedValue({ sent: false, reason: "provider-error" });
    const response = await POST(signedRequest(receivedEvent));
    expect(response.status).toBe(500);
  });

  it("does not forward mail sent from the shop's own address", async () => {
    mocks.fetch.mockImplementationOnce(async () =>
      jsonResponse({ from: "orders@example.com", subject: "Loop", html: "<p>x</p>", text: null, headers: null }),
    );
    const response = await POST(signedRequest(receivedEvent));
    expect(response.status).toBe(200);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("refuses to run without a webhook secret", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    const response = await POST(signedRequest(receivedEvent));
    expect(response.status).toBe(503);
  });
});

describe("verifyResendWebhook", () => {
  it("accepts any matching v1 signature in a space-separated list", () => {
    const payload = '{"ok":true}';
    const valid = createHmac("sha256", secretBytes).update(`msg_2.1000.${payload}`).digest("base64");
    expect(
      verifyResendWebhook(
        payload,
        { id: "msg_2", timestamp: "1000", signature: `v1,bm9wZQ== v1,${valid}` },
        secret,
        1000,
      ),
    ).toBe(true);
    expect(verifyResendWebhook(payload, { id: "msg_2", timestamp: "1000", signature: null }, secret, 1000)).toBe(false);
  });
});
