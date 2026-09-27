import type { SupabaseClient } from "@supabase/supabase-js";
import { type EmailInput, sendTransactionalEmail } from "./mailer";

export async function getActiveAdminEmails(db: SupabaseClient) {
  const configured = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  try {
    const { data, error } = await db.from("admins").select("email").eq("active", true);
    if (error) throw error;
    const active = [...new Set((data ?? []).map((admin) => admin.email.trim().toLowerCase()).filter(Boolean))];
    return active.length ? active : configured ? [configured] : [];
  } catch {
    return configured ? [configured] : [];
  }
}

export async function sendEmailToActiveAdmins(db: SupabaseClient, input: Omit<EmailInput, "to">) {
  const recipients = await getActiveAdminEmails(db);
  const deliveries = await Promise.all(
    recipients.map(async (recipient) => ({
      recipient,
      result: await sendTransactionalEmail({ ...input, to: recipient }),
    })),
  );
  return deliveries;
}
