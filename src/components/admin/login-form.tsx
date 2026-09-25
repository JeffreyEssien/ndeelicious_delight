"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";

type Step = "email" | "code";

export function LoginForm({ initialError = "" }: { initialError?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (!resendIn) return;
    const timer = window.setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  async function requestCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/admin/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "We couldn’t send a code.");
      setStep("code");
      setMessage(payload.message);
      setResendIn(60);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn’t send a code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/admin/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, token }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "We couldn’t verify that code.");
      router.replace("/admin");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn’t verify that code.");
      setBusy(false);
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={verifyCode} className="login-form">
        <div className="otp-heading">
          <span>Code sent to</span>
          <b>{email}</b>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setToken("");
              setError("");
              setMessage("");
            }}
          >
            Change email
          </button>
        </div>
        <Input
          label="Six-digit code"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={token}
          onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 6))}
          className="otp-field"
          placeholder="000000"
        />
        {message && <p className="login-message">{message}</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button button-primary" disabled={busy || token.length !== 6}>
          {busy ? "Verifying…" : "Verify & enter admin"}
          <Icon name="arrow" />
        </button>
        <button className="otp-resend" type="button" disabled={busy || resendIn > 0} onClick={() => requestCode()}>
          {resendIn ? `Resend code in ${resendIn}s` : "Resend code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="login-form">
      <Input
        label="Admin email address"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="owner@ndeedelicious.com"
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button button-primary" disabled={busy}>
        {busy ? "Sending secure code…" : "Email me a login code"}
        <Icon name="arrow" />
      </button>
      <p>No password needed. Access is limited to approved admin accounts.</p>
    </form>
  );
}
