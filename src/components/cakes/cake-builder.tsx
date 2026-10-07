"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import type { CakeConfiguration } from "@/types";
import type { CakeConfigurationData, CakeOptionType } from "@/types/content";
import { useMoney } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import { Input, Textarea } from "@/components/ui/primitives";
import { cakeAvailability } from "@/features/cakes/availability";
import { optionsForCakeType } from "@/features/cakes/options";
import { calculateCakeConfigurationPrice } from "@/features/cakes/pricing";
import { trackCommerceEvent } from "@/lib/analytics/client";
import { earliestCakeDate, leadTimeLabel } from "@/features/cakes/lead-time";
const initial: CakeConfiguration = {
  cakeTypeId: "",
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
  initialSelection?: Partial<
    Pick<CakeConfiguration, "cakeTypeId" | "occasion" | "size" | "flavour" | "filling" | "design" | "optionIds">
  >;
  budgetPreset?: { title: string; body: string };
}) {
  const t = useCustomerText("cake builder");

  const formatMoney = useMoney();
  const [step, setStep] = useState(-1);
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
          type === "cakeTypeId"
            ? configuration.cakeTypes.some((item) => item.active && item.id === name)
            : optionsForCakeType(configuration, String(initialSelection?.cakeTypeId ?? stored.cakeTypeId ?? "")).some(
                (option) => option.active && option.type === type && option.name === name,
              ),
        ),
      );
      const next = { ...initial, ...stored, ...validPreset };
      const compatible = optionsForCakeType(configuration, next.cakeTypeId);
      next.optionIds = Object.fromEntries(
        ["occasion", "size", "flavour", "filling", "design"].flatMap((family) => {
          const selectedId = initialSelection?.optionIds?.[family as CakeOptionType] ?? stored.optionIds?.[family];
          const matches = compatible.filter(
            (option) =>
              option.type === family && (selectedId ? option.id === selectedId : option.name === next[family]),
          );
          if (matches.length !== 1) {
            next[family] = "";
            return [];
          }
          next[family] = matches[0].name;
          return [[family, matches[0].id]];
        }),
      );
      setConfig(next);
    } catch {}
    setReady(true);
  }, [configuration, initialSelection]);
  useEffect(() => {
    trackCommerceEvent("CAKE_BUILDER_STARTED");
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem("ndee-cake-v1", JSON.stringify(config));
  }, [config, ready]);
  const allowedOptions = optionsForCakeType(configuration, config.cakeTypeId);
  const options = (type: CakeOptionType) => allowedOptions.filter((option) => option.type === type);
  const pricing = useMemo(() => {
    try {
      return calculateCakeConfigurationPrice(
        config,
        optionsForCakeType(configuration, config.cakeTypeId),
        configuration.cakeTypes.find((type) => type.id === config.cakeTypeId),
      ).total;
    } catch {
      return 0;
    }
  }, [config, configuration]);
  const quote = allowedOptions.some((option) => option.quoteRequired && config.optionIds?.[option.type] === option.id);
  const selectionCount = [
    config.occasion,
    config.size,
    config.flavour,
    config.filling,
    config.design,
    config.colours,
  ].filter(Boolean).length;
  const selectedType = configuration.cakeTypes.find((type) => type.id === config.cakeTypeId && type.active);
  const leadNotice = selectedType ? `Minimum lead time: ${leadTimeLabel(selectedType)}` : "Choose a cake type";
  let minDate = selectedType ? earliestCakeDate(selectedType, configuration.timezone) : "";
  let availabilityError = "";
  if (selectedType && configuration.fulfilment) {
    try {
      minDate = cakeAvailability({ ...configuration.fulfilment, cakeType: selectedType }).date;
    } catch (reason) {
      availabilityError = reason instanceof Error ? reason.message : "Schedule setup is required.";
    }
  }
  function choose(key: keyof CakeConfiguration, value: string) {
    setConfig((v) => {
      const next = { ...v, [key]: value };
      if (key === "cakeTypeId") {
        const compatible = optionsForCakeType(configuration, value);
        const retained: NonNullable<CakeConfiguration["optionIds"]> = {};
        for (const family of ["occasion", "size", "flavour", "filling", "design"] as const) {
          const id = v.optionIds?.[family];
          const matches = compatible.filter(
            (option) => option.type === family && (id ? option.id === id : option.name === next[family]),
          );
          if (matches.length === 1) {
            next[family] = matches[0].name;
            retained[family] = matches[0].id;
          } else next[family] = "";
        }
        next.optionIds = retained;
        const type = configuration.cakeTypes.find((item) => item.id === value);
        if (type && next.deliveryDate) {
          try {
            const earliest = configuration.fulfilment
              ? cakeAvailability({ ...configuration.fulfilment, cakeType: type, requestedDate: next.deliveryDate }).date
              : earliestCakeDate(type, configuration.timezone);
            if (next.deliveryDate < earliest) next.deliveryDate = "";
          } catch {
            next.deliveryDate = "";
          }
        }
      }
      return next;
    });
    setError("");
  }
  function valid() {
    if (!selectedType) {
      setError("Choose an available cake type to continue.");
      return false;
    }
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
    if (step === 8 && availabilityError) {
      setError(availabilityError);
      return false;
    }
    if (step === 8 && config.deliveryDate < minDate) {
      setError(`${leadNotice}. Earliest date: ${minDate}.`);
      return false;
    }
    if (step === 8 && selectedType && configuration.fulfilment) {
      try {
        cakeAvailability({ ...configuration.fulfilment, cakeType: selectedType, requestedDate: config.deliveryDate });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Choose an available date.");
        return false;
      }
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
            setStep(-1);
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
            {step + 2} {t("of ")}
            {steps.length + 1}
          </span>
          <b>{step === -1 ? "Cake type" : t(steps[step])}</b>
        </div>
        <div className="progress-track">
          <span style={{ width: `${((step + 2) / (steps.length + 1)) * 100}%` }} />
        </div>
        <div className="step-dots">
          {["Cake type", ...steps].map((s, i) => (
            <button
              type="button"
              key={s}
              className={i - 1 === step ? "active" : i - 1 < step ? "done" : ""}
              onClick={() => i - 1 < step && setStep(i - 1)}
              aria-label={i - 1 < step ? t("{stage}, completed", { stage: t(s) }) : t(s)}
            >
              {i - 1 < step ? <Icon name="check" /> : i + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="builder-layout">
        <div className="builder-stage">
          <span className="overline">{step === -1 ? "Cake type" : t(steps[step])}</span>
          {step === -1 && (
            <div>
              <h2>Choose your cake type</h2>
              <p className="stage-intro">Preparation time depends on the cake you choose.</p>
              <div className="choice-grid">
                {configuration.cakeTypes
                  .filter((type) => type.active)
                  .map((type) => (
                    <button
                      type="button"
                      key={type.id}
                      aria-pressed={config.cakeTypeId === type.id}
                      className={config.cakeTypeId === type.id ? "selected" : ""}
                      onClick={() => choose("cakeTypeId", type.id)}
                    >
                      <b>{type.name}</b>
                      <small>{type.description}</small>
                      <strong>Minimum lead time: {leadTimeLabel(type)}</strong>
                      <small>{type.customerNotice}</small>
                    </button>
                  ))}
              </div>
              {!configuration.cakeTypes.some((type) => type.active) && (
                <p>Custom cake types are being prepared. Please contact the bakery.</p>
              )}
            </div>
          )}
          {step === 0 && (
            <Choice
              title={t("What are we celebrating?")}
              subtitle={"Choose the occasion that feels closest."}
              values={options("occasion").map((option) => option.id)}
              labels={options("occasion").map((option) => option.name)}
              selected={config.optionIds?.occasion ?? ""}
              onChoose={(id) => {
                const option = options("occasion").find((item) => item.id === id);
                if (option)
                  setConfig((current) => ({
                    ...current,
                    occasion: option.name,
                    optionIds: { ...current.optionIds, occasion: id },
                  }));
                setError("");
              }}
            />
          )}
          {step === 1 && (
            <Choice
              title={t("How many are we serving?")}
              subtitle={"Serving sizes are a guide—extra slices are never a bad idea."}
              values={options("size").map((option) => option.id)}
              labels={options("size").map((option) => option.name)}
              details={options("size").map((option) => option.description)}
              prices={options("size").map((option) => option.priceAdjustment)}
              selected={config.optionIds?.size ?? ""}
              onChoose={(id) => {
                const option = options("size").find((item) => item.id === id);
                if (option)
                  setConfig((current) => ({
                    ...current,
                    size: option.name,
                    optionIds: { ...current.optionIds, size: id },
                  }));
                setError("");
              }}
            />
          )}
          {step === 2 && (
            <Choice
              title={t("Choose your cake flavour")}
              subtitle={"Every sponge is baked fresh for your date."}
              values={options("flavour").map((option) => option.id)}
              labels={options("flavour").map((option) => option.name)}
              prices={options("flavour").map((option) => option.priceAdjustment)}
              selected={config.optionIds?.flavour ?? ""}
              onChoose={(id) => {
                const option = options("flavour").find((item) => item.id === id);
                if (option)
                  setConfig((current) => ({
                    ...current,
                    flavour: option.name,
                    optionIds: { ...current.optionIds, flavour: id },
                  }));
                setError("");
              }}
            />
          )}
          {step === 3 && (
            <Choice
              title={t("Choose a filling")}
              subtitle={"The lovely layer between every sponge."}
              values={options("filling").map((option) => option.id)}
              labels={options("filling").map((option) => option.name)}
              prices={options("filling").map((option) => option.priceAdjustment)}
              selected={config.optionIds?.filling ?? ""}
              onChoose={(id) => {
                const option = options("filling").find((item) => item.id === id);
                if (option)
                  setConfig((current) => ({
                    ...current,
                    filling: option.name,
                    optionIds: { ...current.optionIds, filling: id },
                  }));
                setError("");
              }}
            />
          )}
          {step === 4 && (
            <Choice
              title={t("Set the design direction")}
              subtitle={"We’ll interpret this in our signature considered style."}
              values={options("design").map((option) => option.id)}
              labels={options("design").map((option) => option.name)}
              prices={options("design").map((option) => option.priceAdjustment)}
              selected={config.optionIds?.design ?? ""}
              onChoose={(id) => {
                const option = options("design").find((item) => item.id === id);
                if (option)
                  setConfig((current) => ({
                    ...current,
                    design: option.name,
                    optionIds: { ...current.optionIds, design: id },
                  }));
                setError("");
              }}
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
                {leadNotice}. Earliest date: {minDate} ({configuration.timezone}).
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
              <p>
                {selectedType?.name} · {leadNotice}
              </p>
              <dl className="review-list">
                {Object.entries(config)
                  .filter(([k, v]) => v && k !== "referenceName" && k !== "cakeTypeId" && k !== "optionIds")
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k.replace(/([A-Z])/g, " $1")}</dt>
                      <dd>{typeof v === "string" ? v : ""}</dd>
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
            {step >= 0 && (
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
              <small>{leadNotice}</small>
            </span>
            <span>
              {selectionCount} {t("selections · View")}
            </span>
          </summary>
          <p>
            {selectedType?.name} · {leadNotice}
          </p>
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
          <p>
            {selectedType?.name} · {leadNotice}
          </p>
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
  labels,
  details,
  prices,
  selected,
  onChoose,
}: {
  title: string;
  subtitle: string;
  values: string[];
  labels?: string[];
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
            <b>{labels?.[i] ?? value}</b>
            {details?.[i] && <small>{details[i]}</small>}
            {prices && <em>{prices[i] ? `+${formatMoney(prices[i])}` : t("Included")}</em>}
          </button>
        ))}
      </div>
    </div>
  );
}
