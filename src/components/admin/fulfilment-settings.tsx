"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fulfilmentScheduleSchema } from "@/features/fulfilment/validation";
import type { FulfilmentSchedule } from "@/features/fulfilment/types";
import type { BusinessSettings } from "@/types/content";
import { Button, Input, Select, Textarea } from "@/components/ui/primitives";
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Empty inactive draft is presented to the owner; it is never persisted automatically.
const emptyDraft: FulfilmentSchedule = {
  timezone: "America/Halifax",
  deliveryDays: [],
  sameDayEnabled: false,
  sameDayCutoff: "12:00",
  defaultEstimate: "",
  blackouts: [],
  pickupEnabled: false,
  pickupAddress: "",
  pickupInstructions: "",
  pickupDays: [],
  pickupHours: { start: "09:00", end: "17:00" },
  pickupPreparationBufferHours: 0,
};
export function FulfilmentSettings({ business }: { business: BusinessSettings }) {
  const router = useRouter();
  const [schedule, setSchedule] = useState({
    ...(business.fulfilmentSchedule ?? emptyDraft),
    blackouts: (business.fulfilmentSchedule?.blackouts ?? []).map((day) => ({ ...day, id: crypto.randomUUID() })),
  });
  const [deliveryTaxMode, setDeliveryTaxMode] = useState(business.deliveryTaxMode ?? "");
  const [state, setState] = useState(business.fulfilmentSchedule ? "Saved" : "Setup required");
  const [error, setError] = useState("");
  const busy = state === "Saving…";
  function update(patch: Partial<typeof schedule>) {
    setSchedule((current) => ({ ...current, ...patch }));
    setState("Unsaved changes");
    setError("");
  }
  async function save() {
    const parsed = fulfilmentScheduleSchema.safeParse(schedule);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      setState("Error");
      return;
    }
    setState("Saving…");
    setError("");
    try {
      const response = await fetch("/api/admin/mutate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "settings",
          key: "business",
          value: {
            ...business,
            fulfilmentSchedule: parsed.data,
            pickupEnabled: schedule.pickupEnabled,
            deliveryTaxMode: deliveryTaxMode || null,
          },
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Settings could not be saved.");
      setState("Saved");
      router.refresh();
    } catch (reason) {
      setState("Error");
      setError(reason instanceof Error ? reason.message : "Save failed. Retry.");
    }
  }
  return (
    <section className="admin-card form-stack">
      <h2>Delivery schedule &amp; pickup</h2>
      <p>All times use America/Halifax. Choose operating days before accepting orders.</p>
      <fieldset disabled={busy}>
        <legend>Delivery days</legend>
        {weekdays.map((day, index) => (
          <label key={day}>
            <input
              type="checkbox"
              checked={schedule.deliveryDays.includes(index)}
              onChange={(event) =>
                update({
                  deliveryDays: event.target.checked
                    ? [...schedule.deliveryDays, index]
                    : schedule.deliveryDays.filter((value) => value !== index),
                })
              }
            />
            {day}
          </label>
        ))}
      </fieldset>
      <label>
        <input
          type="checkbox"
          checked={schedule.sameDayEnabled}
          onChange={(event) => update({ sameDayEnabled: event.target.checked })}
        />
        Offer same-day delivery in eligible areas
      </label>
      <Input
        label="Same-day cutoff"
        type="time"
        value={schedule.sameDayCutoff}
        onChange={(event) => update({ sameDayCutoff: event.target.value })}
      />
      <Input
        label="Default delivery estimate"
        value={schedule.defaultEstimate}
        onChange={(event) => update({ defaultEstimate: event.target.value })}
      />
      <fieldset disabled={busy}>
        <legend>Blackout dates</legend>
        {schedule.blackouts.map((blackout, index) => (
          <div className="field-row" key={blackout.id}>
            <Input
              label="Date"
              type="date"
              value={blackout.date}
              onChange={(event) =>
                update({
                  blackouts: schedule.blackouts.map((day, i) =>
                    i === index ? { ...day, date: event.target.value } : day,
                  ),
                })
              }
            />
            <Input
              label="Reason"
              value={blackout.reason}
              onChange={(event) =>
                update({
                  blackouts: schedule.blackouts.map((day, i) =>
                    i === index ? { ...day, reason: event.target.value } : day,
                  ),
                })
              }
            />
            <label>
              <input
                type="checkbox"
                checked={blackout.active}
                onChange={(event) =>
                  update({
                    blackouts: schedule.blackouts.map((day, i) =>
                      i === index ? { ...day, active: event.target.checked } : day,
                    ),
                  })
                }
              />
              Active
            </label>
            <Button
              variant="secondary"
              onClick={() => update({ blackouts: schedule.blackouts.filter((_, i) => i !== index) })}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          onClick={() =>
            update({
              blackouts: [...schedule.blackouts, { id: crypto.randomUUID(), date: "", reason: "", active: true }],
            })
          }
        >
          Add blackout date
        </Button>
      </fieldset>
      <h3>Bakery pickup</h3>
      <label>
        <input
          type="checkbox"
          checked={schedule.pickupEnabled}
          onChange={(event) => update({ pickupEnabled: event.target.checked })}
        />
        Enable pickup
      </label>
      <Input
        label="Pickup address"
        value={schedule.pickupAddress}
        onChange={(event) => update({ pickupAddress: event.target.value })}
      />
      <Textarea
        label="Pickup instructions"
        value={schedule.pickupInstructions}
        onChange={(event) => update({ pickupInstructions: event.target.value })}
      />
      <fieldset disabled={busy}>
        <legend>Pickup days</legend>
        {weekdays.map((day, index) => (
          <label key={day}>
            <input
              type="checkbox"
              checked={schedule.pickupDays.includes(index)}
              onChange={(event) =>
                update({
                  pickupDays: event.target.checked
                    ? [...schedule.pickupDays, index]
                    : schedule.pickupDays.filter((value) => value !== index),
                })
              }
            />
            {day}
          </label>
        ))}
      </fieldset>
      <div className="field-row">
        <Input
          label="Pickup opens"
          type="time"
          value={schedule.pickupHours.start}
          onChange={(event) => update({ pickupHours: { ...schedule.pickupHours, start: event.target.value } })}
        />
        <Input
          label="Pickup closes"
          type="time"
          value={schedule.pickupHours.end}
          onChange={(event) => update({ pickupHours: { ...schedule.pickupHours, end: event.target.value } })}
        />
        <Input
          label="Additional pickup preparation hours"
          type="number"
          min="0"
          value={schedule.pickupPreparationBufferHours}
          onChange={(event) => update({ pickupPreparationBufferHours: Number(event.target.value) })}
        />
      </div>
      <details>
        <summary>Advanced tax settings</summary>
        <p>Confirm how delivery is supplied with your accountant before selecting a treatment.</p>
        <Select
          label="Delivery tax treatment"
          value={deliveryTaxMode}
          onChange={(event) => {
            setDeliveryTaxMode(event.target.value as typeof deliveryTaxMode);
            setState("Unsaved changes");
          }}
        >
          <option value="">Setup required</option>
          <option value="SEPARATE_TAXABLE_SERVICE">Separate taxable service</option>
          <option value="FOLLOW_ORDER_ITEMS">Follow order items proportionally</option>
        </Select>
      </details>
      <p role="status">{state}</p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Button disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save fulfilment settings"}
      </Button>
    </section>
  );
}
