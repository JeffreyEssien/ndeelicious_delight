type LogValue = string | number | boolean | null | undefined;

const allowedDetails = new Set([
  "requestId",
  "orderId",
  "orderNumber",
  "paymentAttemptId",
  "cakeOrderId",
  "documentId",
  "route",
  "method",
  "routeType",
  "router",
  "runtime",
  "scope",
  "eventType",
  "eventName",
  "errorType",
  "errorName",
  "errorCode",
]);

function safeIdentifier(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? value : undefined;
}

function safeError(error: unknown) {
  if (!(error instanceof Error)) return { errorType: typeof error };
  return {
    errorName: safeIdentifier(error.name),
    errorCode: "code" in error ? safeIdentifier(error.code) : undefined,
  };
}

function write(level: "info" | "warn" | "error", event: string, details: Record<string, LogValue>) {
  const safeDetails = Object.fromEntries(Object.entries(details).filter(([key]) => allowedDetails.has(key)));
  const entry = JSON.stringify({
    ...safeDetails,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "unknown",
    level,
    event,
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

export function logInfo(event: string, details: Record<string, LogValue> = {}) {
  write("info", event, details);
}

export function logWarning(event: string, details: Record<string, LogValue> = {}) {
  write("warn", event, details);
}

export function logError(event: string, error: unknown, details: Record<string, LogValue> = {}) {
  write("error", event, { ...details, ...safeError(error) });
}
