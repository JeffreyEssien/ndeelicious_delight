import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminAuditActor = {
  admin: { id: string };
  sessionId: string;
};

export type AdminAuditEntry = {
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
};

export class AdminAuditError extends Error {
  constructor() {
    super("The change was saved, but its required audit record could not be written.");
    this.name = "AdminAuditError";
  }
}

export async function recordAdminAudit(db: SupabaseClient, actor: AdminAuditActor, entry: AdminAuditEntry) {
  const { error } = await db.rpc("record_admin_audit", {
    p_admin_id: actor.admin.id,
    p_admin_session_id: actor.sessionId,
    p_action: entry.action,
    p_entity_type: entry.entityType,
    p_entity_id: entry.entityId ?? null,
    p_previous_value: entry.previousValue ?? null,
    p_new_value: entry.newValue ?? null,
    p_metadata: entry.metadata ?? {},
  });
  if (error) throw new AdminAuditError();
}
