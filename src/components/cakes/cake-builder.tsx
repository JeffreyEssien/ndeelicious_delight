"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import type { CakeConfiguration } from "@/types";
import type { CakeConfigurationData, CakeOptionType } from "@/types/content";
import { useMoney } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import { Input, Textarea } from "@/components/ui/primitives";
import { calculateCakeConfigurationPrice } from "@/features/cakes/pricing";
import { trackCommerceEvent } from "@/lib/analytics/client";
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
export function CakeBuilder({
  configuration,
  initialSelection,
  budgetPreset,
}: {
  configuration: CakeConfigurationData;
  initialSelection?: Partial<Pick<CakeConfiguration, "occasion" | "size" | "flavour" | "filling" | "design">>;
  budgetPreset?: { title: string; body: string };
}) {
  const t = useCustomerText("cake builder");

  const formatMoney = useMoney();
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState(initial);
  const [ready, setReady] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [requestNumber, setRequestNumber] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ndee-cake-v1");
      const stored = saved ? { ...JSON.parse(saved), referenceName: "" } : {};
      const validPreset = Object.fromEntries(
        Object.entries(initialSelection ?? {}).filter(([type, name]) =>
          configuration.options.some((option) => option.active && option.type === type && option.name === name),
        ),
      );
      setConfig({ ...initial, ...stored, ...validPreset });
    } catch {}
    setReady(true);
  }, [configuration.options, initialSelection]);
  useEffect(() => {
    trackCommerceEvent("CAKE_BUILDER_STARTED");
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem("ndee-cake-v1", JSON.stringify(config));
  }, [config, ready]);
  const options = (type: CakeOptionType) =>
    configuration.options.filter((option) => option.active && option.type === type);
  const pricing = useMemo(() => {
    try {
      return calculateCakeConfigurationPrice(config, configuration.options).total;
    } catch {
      return 0;
    }
  }, [config, configuration.options]);
  const quote = configuration.options.some(
    (option) =>
      option.quoteRequired && [config.size, config.flavour, config.filling, config.design].includes(option.name),
  );
  const selectionCount = [
    config.occasion,
    config.size,
    config.flavour,
    config.filling,
    config.design,
    config.colours,
  ].filter(Boolean).length;
  const minDate = new Date(Date.now() + configuration.leadTimeHours * 60 * 60 * 1000).toISOString().slice(0, 10);
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
      setError(t("Please choose a date at least {value1} hours from now.", { value1: configuration.leadTimeHours }));
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
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please choose a JPG, PNG or WebP image.");
      return;
    }
    setReferenceFile(file);
    choose("referenceName", file.name);
  }
  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.set("configuration", JSON.stringify(config));
      if (referenceFile) form.set("reference", referenceFile);
      const response = await fetch("/api/cakes/quote", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "We couldn’t validate your cake.");
      setRequestNumber(payload.requestNumber);
      setSubmitted(true);
      trackCommerceEvent("CAKE_BUILDER_COMPLETED", { metadata: { quoteRequired: quote } });
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
        <span className="overline">{t("Request received")}</span>
        <h2>{t("Your cake story starts here.")}</h2>
        <p>
          {t("We’ve saved your configuration as")}
          <b>{requestNumber}</b>
          {t(". A baker will review the details and reply with the next step.")}
        </p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setSubmitted(false);
            setStep(0);
            setConfig(initial);
            setReferenceFile(null);
            localStorage.removeItem("ndee-cake-v1");
          }}
        >
          {t("Build another cake")}
        </button>
      </div>
    );
  return (
    <div className="cake-builder">
      {!!initialSelection && Object.keys(initialSelection).length > 0 && (
        <div className="cake-budget-preset">
          <span>{budgetPreset?.title}</span>
          <p>{budgetPreset?.body}</p>
        </div>
      )}
      <div className="builder-progress">
        <div>
          <span>
            {t("Step")}
            {step + 1} {t("of ")}
            {steps.length}
          </span>
          <b>{t(steps[step])}</b>
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
              aria-label={i < step ? t("{stage}, completed", { stage: t(s) }) : t(s)}
            >
              {i < step ? <Icon name="check" /> : i + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="builder-layout">
        <div className="builder-stage">
          <span className="overline">{t(steps[step])}</span>
          {step === 0 && (
            <Choice
              title={t("What are we celebrating?")}
              subtitle={"Choose the occasion that feels closest."}
              values={options("occasion").map((option) => option.name)}
              selected={config.occasion}
              onChoose={(v) => choose("occasion", v)}
            />
          )}
          {step === 1 && (
            <Choice
              title={t("How many are we serving?")}
              subtitle={"Serving sizes are a guide—extra slices are never a bad idea."}
              values={options("size").map((option) => option.name)}
              details={options("size").map((option) => option.description)}
              prices={options("size").map((option) => option.priceAdjustment)}
              selected={config.size}
              onChoose={(v) => choose("size", v)}
            />
          )}
          {step === 2 && (
            <Choice
              title={t("Choose your cake flavour")}
              subtitle={"Every sponge is baked fresh for your date."}
              values={options("flavour").map((option) => option.name)}
              prices={options("flavour").map((option) => option.priceAdjustment)}
              selected={config.flavour}
              onChoose={(v) => choose("flavour", v)}
            />
          )}
          {step === 3 && (
            <Choice
              title={t("Choose a filling")}
              subtitle={"The lovely layer between every sponge."}
              values={options("filling").map((option) => option.name)}
              prices={options("filling").map((option) => option.priceAdjustment)}
              selected={config.filling}
              onChoose={(v) => choose("filling", v)}
            />
          )}
          {step === 4 && (
            <Choice
              title={t("Set the design direction")}
              subtitle={"We’ll interpret this in our signature considered style."}
              values={options("design").map((option) => option.name)}
              prices={options("design").map((option) => option.priceAdjustment)}
              selected={config.design}
              onChoose={(v) => choose("design", v)}
            />
          )}
          {step === 5 && (
            <div>
              <h2>{t("What colours are speaking to you?")}</h2>
              <p className="stage-intro">{t("Name two or three colours. We’ll balance them beautifully.")}</p>
              <Input
                label={t("Colour palette")}
                value={config.colours}
                onChange={(e) => choose("colours", e.target.value)}
                placeholder={t("e.g. soft pink, ivory and deep berry")}
              />
            </div>
          )}
          {step === 6 && (
            <div>
              <h2>{t("Add a cake inscription")}</h2>
              <p className="stage-intro">{t("Optional. Short messages fit most beautifully.")}</p>
              <Input
                label={t("Inscription")}
                maxLength={45}
                value={config.inscription}
                onChange={(e) => choose("inscription", e.target.value)}
                placeholder={t("Happy birthday, Amara")}
              />
              <small className="character-count">{config.inscription.length}/45</small>
            </div>
          )}
          {step === 7 && (
            <div>
              <h2>{t("Show us what inspired you")}</h2>
              <p className="stage-intro">
                {t("Optional. We’ll use your image as a direction, not make an exact copy.")}
              </p>
              <label className="upload-zone">
                <Icon name="upload" />
                <b>{config.referenceName || t("Upload an inspiration image")}</b>
                <span>{t("JPG, PNG or WebP · up to 5 MB")}</span>
                <input type="file" accept={"image/jpeg,image/png,image/webp"} onChange={upload} />
              </label>
            </div>
          )}
          {step === 8 && (
            <div>
              <h2>{t("When do you need your cake?")}</h2>
              <p className="stage-intro">
                {t("We need at least")}
                {configuration.leadTimeHours} {t("hours to make something wonderful.")}
              </p>
              <Input
                label={t("Collection or delivery date")}
                type="date"
                min={minDate}
                value={config.deliveryDate}
                onChange={(e) => choose("deliveryDate", e.target.value)}
              />
              <p className="info-note">
                <Icon name="clock" />
                {t("Dates remain subject to bakery capacity until confirmed.")}
              </p>
            </div>
          )}
          {step === 9 && (
            <div>
              <h2>{t("Everything look delicious?")}</h2>
              <p className="stage-intro">{t("Review your choices before sending them to the bakery.")}</p>
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
                    <dt>{t("Inspiration")}</dt>
                    <dd>{config.referenceName}</dd>
                  </div>
                )}
              </dl>
              <div className="form-stack">
                <Input
                  label={t("Your name")}
                  value={config.customerName}
                  onChange={(e) => choose("customerName", e.target.value)}
                  required
                />
                <Input
                  label={t("Email address")}
                  type="email"
                  value={config.email}
                  onChange={(e) => choose("email", e.target.value)}
                  required
                />
                <Input
                  label={t("Phone number")}
                  type="tel"
                  value={config.phone}
                  onChange={(e) => choose("phone", e.target.value)}
                  required
                />
                <Textarea
                  label={t("Anything else we should know?")}
                  value={config.customerNote}
                  onChange={(e) => choose("customerNote", e.target.value)}
                  placeholder={t("Optional notes for our bakers")}
                  rows={3}
                />
              </div>
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {t(error)}
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
                {t("Back")}
              </button>
            )}
            <button
              type="button"
              className="button button-primary"
              disabled={submitting}
              onClick={() => (step === 9 ? submit() : next())}
            >
              {submitting
                ? t("Validating…")
                : step === 9
                  ? quote
                    ? t("Request your quote")
                    : t("Send cake request")
                  : "Continue"}
              <Icon name="arrow" />
            </button>
          </div>
        </div>
        <details className="cake-summary-mobile">
          <summary>
            <span>
              <small>{quote ? t("Starting estimate") : t("Estimated total")}</small>
              <b>{pricing ? formatMoney(pricing) : t("—")}</b>
            </span>
            <span>
              {selectionCount} {t("selections · View")}
            </span>
          </summary>
          <dl>
            {config.size && (
              <div>
                <dt>{t("Size")}</dt>
                <dd>{config.size}</dd>
              </div>
            )}
            {config.flavour && (
              <div>
                <dt>{t("Flavour")}</dt>
                <dd>{config.flavour}</dd>
              </div>
            )}
            {config.design && (
              <div>
                <dt>{t("Style")}</dt>
                <dd>{config.design}</dd>
              </div>
            )}
          </dl>
        </details>
        <aside className="cake-summary">
          <span className="overline">{t("Your cake")}</span>
          <div className="summary-cake">
            <span>✦</span>
          </div>
          <dl>
            {config.size && (
              <div>
                <dt>{t("Size")}</dt>
                <dd>{config.size}</dd>
              </div>
            )}
            {config.flavour && (
              <div>
                <dt>{t("Flavour")}</dt>
                <dd>{config.flavour}</dd>
              </div>
            )}
            {config.design && (
              <div>
                <dt>{t("Style")}</dt>
                <dd>{config.design}</dd>
              </div>
            )}
          </dl>
          <div className="estimate">
            <span>{quote ? t("Starting estimate") : t("Estimated total")}</span>
            <b>{pricing ? formatMoney(pricing) : t("—")}</b>
            <small>{quote ? t("Final price follows baker review.") : t("Final price confirmed after review.")}</small>
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
  const t = useCustomerText("cake builder");

  const formatMoney = useMoney();
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
            {prices && <em>{prices[i] ? `+${formatMoney(prices[i])}` : t("Included")}</em>}
          </button>
        ))}
      </div>
    </div>
  );
}
