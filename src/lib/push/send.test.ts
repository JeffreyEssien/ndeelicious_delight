import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), setVapid: vi.fn() }));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send, setVapidDetails: mocks.setVapid } }));

import { isPushConfigured, pushToAdmins, pushToOrder } from "./send";

// Records every write so the cleanup rules can be asserted.
function fakeDb(rows: Record<string, unknown>[]) {
  const writes: { op: string; id?: unknown; values?: unknown }[] = [];
  const read: Promise<{ data: unknown[] }> & { eq?: () => unknown } = Promise.resolve({ data: rows });
  read.eq = () => read;
  return {
    writes,
    from: () => ({
      select: () => read,
      update: (values: unknown) => ({ eq: (_: string, id: unknown) => writes.push({ op: "update", id, values }) }),
      delete: () => ({ eq: (_: string, id: unknown) => writes.push({ op: "delete", id }) }),
    }),
  };
}
const row = (id: string, failure_count = 0) => ({
  id,
  endpoint: `https://push.example/${id}`,
  p256dh: "key",
  auth: "auth",
  failure_count,
});
const message = { title: "Your order is ready", body: "ND-1", url: "/track-order?order=ND-1" };

describe("web push sender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private");
    vi.stubEnv("VAPID_SUBJECT", "mailto:owner@example.com");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("does nothing until the VAPID keys are set", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const db = fakeDb([row("a")]);
    expect(isPushConfigured()).toBe(false);
    expect(await pushToOrder(db as never, "order", message)).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sends the message to every subscription and records success", async () => {
    mocks.send.mockResolvedValue({ statusCode: 201 });
    const db = fakeDb([row("a"), row("b")]);
    expect(await pushToOrder(db as never, "order", message)).toBe(2);
    expect(mocks.send).toHaveBeenCalledWith(
      { endpoint: "https://push.example/a", keys: { p256dh: "key", auth: "auth" } },
      JSON.stringify(message),
      expect.objectContaining({ urgency: "high" }),
    );
    expect(db.writes.filter((write) => write.op === "update")).toHaveLength(2);
  });

  it("deletes subscriptions the browser revoked and counts other failures", async () => {
    mocks.send.mockImplementation(async ({ endpoint }: { endpoint: string }) => {
      if (endpoint.endsWith("/gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      throw Object.assign(new Error("busy"), { statusCode: 503 });
    });
    const db = fakeDb([row("gone"), row("busy", 1), row("dead", 4)]);
    expect(await pushToAdmins(db as never, message)).toBe(0);
    expect(db.writes).toEqual(
      expect.arrayContaining([
        { op: "delete", id: "gone" },
        { op: "update", id: "busy", values: { failure_count: 2 } },
        { op: "delete", id: "dead" },
      ]),
    );
  });

  it("never throws, so a push problem can't break an order", async () => {
    const failing: Promise<never> & { eq?: () => unknown } = Promise.reject(new Error("db down"));
    failing.catch(() => {});
    failing.eq = () => failing;
    const db = { from: () => ({ select: () => failing }) };
    await expect(pushToOrder(db as never, "order", message)).resolves.toBe(0);
  });
});
