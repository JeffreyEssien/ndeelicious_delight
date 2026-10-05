import type { Instrumentation } from "next";
import { logError, logInfo } from "@/lib/observability/log";

export function register() {
  logInfo("application.runtime_started", { runtime: process.env.NEXT_RUNTIME ?? "unknown" });
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  logError("request.unhandled_error", error, {
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    router: context.routerKind,
  });
};
