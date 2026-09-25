import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), sendEmail: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));
vi.mock("@/lib/email/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/mailer")>()),
  sendTransactionalEmail: mocks.sendEmail,
}));

import { POST } from "./route";

describe("POST /api/contact", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
    mocks.insert.mockResolvedValue({ error: null });
    mocks.sendEmail.mockResolvedValue({ sent: true });
  });

  it("persists the message and safely emails the owner", async () => {
    const response = await POST(
      new Request("http://localhost/api/contact", {
        method: "POST",
        body: JSON.stringify({
          name: "Ada <script>",
          email: "ada@example.com",
          subject: "Wedding <cake>",
          message: "Please call me.\n<script>alert(1)</script>",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        replyTo: "ada@example.com",
        subject: "New customer message",
      }),
    );
    const email = mocks.sendEmail.mock.calls[0]?.[0];
    expect(email.html).toContain("Ada &lt;script&gt;");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).not.toContain("<script>");
  });

  it("does not email when persistence fails", async () => {
    mocks.insert.mockResolvedValue({ error: new Error("database unavailable") });
    const response = await POST(
      new Request("http://localhost/api/contact", {
        method: "POST",
        body: JSON.stringify({
          name: "Ada Lovelace",
          email: "ada@example.com",
          subject: "Wedding cake",
          message: "Please call me about a cake.",
        }),
      }),
    );

    expect(response.status).toBe(500);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
