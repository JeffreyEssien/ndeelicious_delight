"use client";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { cakeOptions } from "@/lib/mock-data";
import type { CakeConfiguration } from "@/types";
import { formatMoney } from "@/lib/format";
import { Icon } from "@/components/ui/icons";
import { Input, Textarea } from "@/components/ui/primitives";
const initial: CakeConfiguration = {
  occasion: "",
  size: "",
  flavour: "",
  filling: "",
  design: "",
  colours: "",
  inscription: "",
  deliveryDate: "",
  referenceName: "",
  customerName: "",
  email: "",
  phone: "",
  customerNote: "",
};
const steps = [
  "Occasion",
  "Size",
  "Flavour",
  "Filling",
  "Design",
  "Colours",
  "Inscription",
  "Inspiration",
  "Date",
  "Review",
];
export function CakeBuilder() {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState(initial);
  const [ready, setReady] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [requestNumber, setRequestNumber] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ndee-cake-v1");
      if (saved) setConfig(JSON.parse(saved));
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem("ndee-cake-v1", JSON.stringify(config));
  }, [config, ready]);
  const pricing = useMemo(() => {
    const size = cakeOptions.sizes.find((x) => x.name === config.size)?.price ?? 0;
    const flavour = cakeOptions.flavours.find((x) => x.name === config.flavour)?.price ?? 0;
    const filling = cakeOptions.fillings.find((x) => x.name === config.filling)?.price ?? 0;
    const design = cakeOptions.designs.find((x) => x.name === config.design)?.price ?? 0;
    return size + flavour + filling + design;
  }, [config]);
  const quote = config.size === "Two tier" || config.design === "Floral garden";
  const minDate = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString().slice(0, 10);
  function choose(key: keyof CakeConfiguration, value: string) {
    setConfig((v) => ({ ...v, [key]: value }));
    setError("");
  }
  function valid() {
    const keys: (keyof CakeConfiguration)[] = [
      "occasion",
      "size",
      "flavour",
      "filling",
      "design",
      "colours",
      "inscription",
      "referenceName",
      "deliveryDate",
    ];
    if (step === 7) return true;
    if (step === 8 && config.deliveryDate < minDate) {
      setError("Please choose a date at least 72 hours from now.");
      return false;
    }
    const key = keys[step];
    if (key && !config[key] && ![6, 7].includes(step)) {
      setError("Choose an option to continue.");
      return false;
    }
    return true;
  }
  function next() {
    if (valid()) setStep((v) => Math.min(9, v + 1));
  }
  function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Please choose an image smaller than 5 MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose a JPG, PNG or WebP image.");
      return;
    }
    choose("referenceName", file.name);
  }
  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/cakes/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "We couldn’t validate your cake.");
      setRequestNumber(payload.requestNumber);
      setSubmitted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn’t validate your cake.");
    } finally {
      setSubmitting(false);
    }
  }
  if (submitted)
    return (
      <div className="builder-success">
        <span className="success-mark">
          <Icon name="check" />
        </span>
        <span className="overline">Request received</span>
        <h2>Your cake story starts here.</h2>
        <p>
          We’ve saved your configuration as <b>{requestNumber}</b>. A baker will review the details and reply with the
          next step.
        </p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setSubmitted(false);
            setStep(0);
            setConfig(initial);
            localStorage.removeItem("ndee-cake-v1");
          }}
        >
          Build another cake
        </button>
      </div>
    );
  return (
    <div className="cake-builder">
      <div className="builder-progress">
        <div>
          <span>
            Step {step + 1} of {steps.length}
          </span>
          <b>{steps[step]}</b>
        </div>
        <div className="progress-track">
          <span style={{ width: `${(step + 1) * 10}%` }} />
        </div>
        <div className="step-dots">
          {steps.map((s, i) => (
            <button
              type="button"
              key={s}
              className={i === step ? "active" : i < step ? "done" : ""}
              onClick={() => i < step && setStep(i)}
              aria-label={`${s}${i < step ? ", completed" : ""}`}
            >
              {i < step ? <Icon name="check" /> : i + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="builder-layout">
        <div className="builder-stage">
          <span className="overline">{steps[step]}</span>
          {step === 0 && (
            <Choice
              title="What are we celebrating?"
              subtitle="Choose the occasion that feels closest."
              values={cakeOptions.occasions}
              selected={config.occasion}
              onChoose={(v) => choose("occasion", v)}
            />
          )}
          {step === 1 && (
            <Choice
              title="How many are we serving?"
              subtitle="Serving sizes are a guide—extra slices are never a bad idea."
              values={cakeOptions.sizes.map((x) => x.name)}
              details={cakeOptions.sizes.map((x) => x.detail)}
              prices={cakeOptions.sizes.map((x) => x.price)}
              selected={config.size}
              onChoose={(v) => choose("size", v)}
            />
          )}
          {step === 2 && (
            <Choice
              title="Choose your cake flavour"
              subtitle="Every sponge is baked fresh for your date."
              values={cakeOptions.flavours.map((x) => x.name)}
              prices={cakeOptions.flavours.map((x) => x.price)}
              selected={config.flavour}
              onChoose={(v) => choose("flavour", v)}
            />
          )}
          {step === 3 && (
            <Choice
              title="Choose a filling"
              subtitle="The lovely layer between every sponge."
              values={cakeOptions.fillings.map((x) => x.name)}
              prices={cakeOptions.fillings.map((x) => x.price)}
              selected={config.filling}
              onChoose={(v) => choose("filling", v)}
            />
          )}
          {step === 4 && (
            <Choice
              title="Set the design direction"
              subtitle="We’ll interpret this in our signature considered style."
              values={cakeOptions.designs.map((x) => x.name)}
              prices={cakeOptions.designs.map((x) => x.price)}
              selected={config.design}
              onChoose={(v) => choose("design", v)}
            />
          )}
          {step === 5 && (
            <div>
              <h2>What colours are speaking to you?</h2>
              <p className="stage-intro">Name two or three colours. We’ll balance them beautifully.</p>
              <Input
                label="Colour palette"
                value={config.colours}
                onChange={(e) => choose("colours", e.target.value)}
                placeholder="e.g. soft pink, ivory and deep berry"
              />
            </div>
          )}
          {step === 6 && (
            <div>
              <h2>Add a cake inscription</h2>
              <p className="stage-intro">Optional. Short messages fit most beautifully.</p>
              <Input
                label="Inscription"
                maxLength={45}
                value={config.inscription}
                onChange={(e) => choose("inscription", e.target.value)}
                placeholder="Happy birthday, Amara"
              />
              <small className="character-count">{config.inscription.length}/45</small>
            </div>
          )}
          {step === 7 && (
            <div>
              <h2>Show us what inspired you</h2>
              <p className="stage-intro">Optional. We’ll use your image as a direction, not make an exact copy.</p>
              <label className="upload-zone">
                <Icon name="upload" />
                <b>{config.referenceName || "Upload an inspiration image"}</b>
                <span>JPG, PNG or WebP · up to 5 MB</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} />
              </label>
            </div>
          )}
          {step === 8 && (
            <div>
              <h2>When do you need your cake?</h2>
              <p className="stage-intro">We need at least 72 hours to make something wonderful.</p>
              <Input
                label="Collection or delivery date"
                type="date"
                min={minDate}
                value={config.deliveryDate}
                onChange={(e) => choose("deliveryDate", e.target.value)}
              />
              <p className="info-note">
                <Icon name="clock" />
                Dates remain subject to bakery capacity until confirmed.
              </p>
            </div>
          )}
          {step === 9 && (
            <div>
              <h2>Everything look delicious?</h2>
              <p className="stage-intro">Review your choices before sending them to the bakery.</p>
              <dl className="review-list">
                {Object.entries(config)
                  .filter(([k, v]) => v && k !== "referenceName")
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k.replace(/([A-Z])/g, " $1")}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                {config.referenceName && (
                  <div>
                    <dt>Inspiration</dt>
                    <dd>{config.referenceName}</dd>
                  </div>
                )}
              </dl>
              <div className="form-stack">
                <Input
                  label="Your name"
                  value={config.customerName}
                  onChange={(e) => choose("customerName", e.target.value)}
                  required
                />
                <Input
                  label="Email address"
                  type="email"
                  value={config.email}
                  onChange={(e) => choose("email", e.target.value)}
                  required
                />
                <Input
                  label="Phone number"
                  type="tel"
                  value={config.phone}
                  onChange={(e) => choose("phone", e.target.value)}
                  required
                />
                <Textarea
                  label="Anything else we should know?"
                  value={config.customerNote}
                  onChange={(e) => choose("customerNote", e.target.value)}
                  placeholder="Optional notes for our bakers"
                  rows={3}
                />
              </div>
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="builder-nav">
            {step > 0 && (
              <button
                type="button"
                className="button button-ghost"
                onClick={() => {
                  setStep((v) => v - 1);
                  setError("");
                }}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="button button-primary"
              disabled={submitting}
              onClick={() => (step === 9 ? submit() : next())}
            >
              {submitting
                ? "Validating…"
                : step === 9
                  ? quote
                    ? "Request your quote"
                    : "Send cake request"
                  : "Continue"}
              <Icon name="arrow" />
            </button>
          </div>
        </div>
        <aside className="cake-summary">
          <span className="overline">Your cake</span>
          <div className="summary-cake">
            <span>✦</span>
          </div>
          <dl>
            {config.size && (
              <div>
                <dt>Size</dt>
                <dd>{config.size}</dd>
              </div>
            )}
            {config.flavour && (
              <div>
                <dt>Flavour</dt>
                <dd>{config.flavour}</dd>
              </div>
            )}
            {config.design && (
              <div>
                <dt>Style</dt>
                <dd>{config.design}</dd>
              </div>
            )}
          </dl>
          <div className="estimate">
            <span>{quote ? "Starting estimate" : "Estimated total"}</span>
            <b>{pricing ? formatMoney(pricing) : "—"}</b>
            <small>{quote ? "Final price follows baker review." : "Final price confirmed after review."}</small>
          </div>
        </aside>
      </div>
    </div>
  );
}
function Choice({
  title,
  subtitle,
  values,
  details,
  prices,
  selected,
  onChoose,
}: {
  title: string;
  subtitle: string;
  values: string[];
  details?: string[];
  prices?: number[];
  selected: string;
  onChoose: (v: string) => void;
}) {
  return (
    <div>
      <h2>{title}</h2>
      <p className="stage-intro">{subtitle}</p>
      <div className="choice-grid">
        {values.map((value, i) => (
          <button
            type="button"
            key={value}
            className={selected === value ? "selected" : ""}
            onClick={() => onChoose(value)}
          >
            <span className="choice-check">{selected === value && <Icon name="check" />}</span>
            <b>{value}</b>
            {details?.[i] && <small>{details[i]}</small>}
            {prices && <em>{prices[i] ? `+${formatMoney(prices[i])}` : "Included"}</em>}
          </button>
        ))}
      </div>
    </div>
  );
}
