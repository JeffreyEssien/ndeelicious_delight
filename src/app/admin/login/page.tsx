import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { BrandLogo } from "@/components/layout/brand-logo";
import { requireAdminPageSession } from "@/lib/auth/admin-request";
import { adminReturnPath } from "@/lib/auth/admin-session";
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const returnTo = adminReturnPath(next);
  // Already signed in (e.g. a remembered session): skip the login code.
  const session = await requireAdminPageSession().catch(() => null);
  if (session) redirect(returnTo);
  const initialError =
    error === "unauthorized"
      ? "This account is not approved for admin access."
      : error === "configuration"
        ? "Admin authentication is not configured yet. Check the server-side auth and SMTP settings."
        : "";
  return (
    <main className="admin-login">
      <section>
        <Link href="/" className="brand" aria-label="Ndeeelicious Delight home">
          <BrandLogo />
        </Link>
        <div>
          <span className="overline">Secure bakery operations</span>
          <h1>Welcome back.</h1>
          <p>Enter your approved admin email and we’ll send a one-time login code.</p>
          <LoginForm initialError={initialError} returnTo={returnTo} />
        </div>
      </section>
      <div className="login-image">
        <Image src="/custom-cake.jpg" alt="Ndeeelicious Delight custom cake" fill loading="eager" sizes="50vw" />
      </div>
    </main>
  );
}
