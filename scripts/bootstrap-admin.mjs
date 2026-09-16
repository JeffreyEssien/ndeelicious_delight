import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.ADMIN_NAME?.trim() || "Ndeeelicious Owner";

if (!url || !serviceRoleKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
}

if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  throw new Error("Set ADMIN_EMAIL in .env.local to the owner's real email address.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail() {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 100) return null;
  }
  throw new Error("Could not search all Auth users.");
}

let user = await findUserByEmail();
if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) throw error;
  user = data.user;
}

const { error: adminError } = await supabase.from("admins").upsert(
  { auth_user_id: user.id, email, name, role: "OWNER", active: true },
  { onConflict: "email" },
);
if (adminError) throw adminError;

console.log(`Admin ready: ${email}. Use the email OTP form at /admin/login.`);
