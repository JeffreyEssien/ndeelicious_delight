"use client";
import { type FormEvent, useState } from "react";
import { Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";

export function ContactForm() {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn’t send your message.");
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className="contact-success">
        <span className="success-mark">
          <Icon name="check" />
        </span>
        <h2>Your note is with us.</h2>
        <p>We’ll reply within one bakery day.</p>
        <button type="button" className="button button-secondary" onClick={() => setDone(false)}>
          Send another message
        </button>
      </div>
    );
  return (
    <form className="form-stack contact-form" onSubmit={submit}>
      <div className="field-row">
        <Input label="Your name" name="name" required />
        <Input label="Email address" name="email" type="email" required />
      </div>
      <Input label="Phone number (optional)" name="phone" type="tel" />
      <Select label="What can we help with?" name="subject">
        <option>General question</option>
        <option>Existing order</option>
        <option>Custom cake</option>
        <option>Corporate order</option>
      </Select>
      <Textarea label="Your message" name="message" rows={6} minLength={10} required />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button button-primary" disabled={busy}>
        {busy ? "Sending…" : "Send message"}
        <Icon name="arrow" />
      </button>
    </form>
  );
}
