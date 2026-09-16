import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // A missing or expired session is already signed out from the app's perspective.
  }
  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}
