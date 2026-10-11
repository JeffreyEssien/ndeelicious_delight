import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const historyCategories = {
  orders: {
    ATTENTION: "Needs attention",
    AWAITING_PAYMENT: "Awaiting payment",
    TO_PREPARE: "To prepare",
    PREPARING: "Preparing",
    READY: "Ready",
    OUT: "Out for delivery / pickup",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    ALL: "All orders",
  },
  cakes: {
    NEEDS_QUOTE: "Needs quote",
    AWAITING_APPROVAL: "Awaiting approval",
    TO_PREPARE: "Approved / to prepare",
    PREPARING: "Preparing",
    READY: "Ready",
    COMPLETED: "Completed",
    ALL: "All requests",
  },
} as const;
export type HistoryKind = keyof typeof historyCategories;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });
const querySchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    category: z.string().default("ALL"),
    stage: z
      .enum([
        "",
        "DRAFT",
        "QUOTE_REQUIRED",
        "QUOTE_SENT",
        "CUSTOMER_APPROVED",
        "PENDING_PAYMENT",
        "PAID",
        "CONFIRMED",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED",
        "REFUNDED",
        "FAILED",
      ])
      .default(""),
    payment: z.enum(["", "UNPAID", "PENDING", "SUCCEEDED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]).default(""),
    fulfilment: z.enum(["", "pickup", "delivery"]).default(""),
    from: date.optional(),
    to: date.optional(),
    sort: z.enum(["newest", "oldest", "total-asc", "total-desc", "deadline"]).default("newest"),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    size: z.coerce
      .number()
      .refine((v) => [25, 50, 100].includes(v))
      .default(25),
    asOf: z.string().datetime({ offset: true }).optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, "The end date must follow the start date.");
export type HistoryQuery = z.infer<typeof querySchema>;
export function parseHistoryQuery(kind: HistoryKind, params: URLSearchParams) {
  const values = Object.fromEntries([...params].filter(([, value]) => value !== ""));
  const parsed = querySchema.parse(values);
  if (!(parsed.category in historyCategories[kind])) throw new Error("Unknown history category.");
  if (parsed.asOf && new Date(parsed.asOf).getTime() > Date.now() + 60_000)
    throw new Error("Invalid history snapshot.");
  return parsed;
}
export type HistoryRow = {
  id: string;
  number: string;
  customer: string;
  status: string;
  createdAt: string;
  total: number | null;
  currency: string | null;
  fulfilment: string | null;
  paymentStatus: string | null;
  deadline: string | null;
  occasion: string | null;
  items: number | null;
  referencePath?: string | null;
  thumbnailUrl?: string;
};
export type HistoryPage = {
  rows: HistoryRow[];
  total: number;
  counts: Record<string, number>;
  page: number;
  size: number;
  asOf: string;
};
export async function getHistoryPage(db: SupabaseClient, kind: HistoryKind, query: HistoryQuery): Promise<HistoryPage> {
  const { data, error } = await db.rpc("admin_history_page", { p_kind: kind, p_filters: query });
  if (error) throw error;
  if (
    !data ||
    !Array.isArray(data.rows) ||
    typeof data.total !== "number" ||
    !data.counts ||
    typeof data.asOf !== "string"
  )
    throw new Error("History is unavailable.");
  return data as HistoryPage;
}
