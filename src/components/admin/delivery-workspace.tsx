"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import { useUnsavedChanges } from "./use-unsaved-changes";
import { useBusinessSettings, useMoney, useToast } from "@/components/providers";
import { Button, EmptyState } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { deliveryCharge, resolveDeliveryArea } from "@/features/fulfilment/resolver";
import { earliestFulfilment } from "@/features/fulfilment/schedule";
import type { DeliveryArea, FulfilmentSchedule } from "@/features/fulfilment/types";
import { deliveryAreasSchema, fulfilmentScheduleSchema } from "@/features/fulfilment/validation";
import { MIN_LEAD_TIME_HOURS } from "@/validations/product";
import type { DeliveryZone } from "@/types";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Shown Monday first, the way the bakery plans its week.
const weekOrder = [1, 2, 3, 4, 5, 6, 0];
const prefixPattern = /^B\d[ABCEGHJ-NPRSTVWXYZ]$/;
// Empty inactive draft is presented to the owner; it is never persisted automatically.
const emptySchedule: FulfilmentSchedule = {
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

type Blackout = FulfilmentSchedule["blackouts"][number] & { id: string };
type Schedule = Omit<FulfilmentSchedule, "blackouts"> & { blackouts: Blackout[] };
type Draft = { schedule: Schedule; deliveryEnabled: boolean; deliveryTaxMode: string; zones: DeliveryZone[] };

const withoutIds = (schedule: Schedule): FulfilmentSchedule => ({
  ...schedule,
  blackouts: schedule.blackouts.map(({ id: _id, ...day }) => day),
});
const asArea = (zone: DeliveryZone): DeliveryArea => ({
  ...zone,
  postalCodePrefixes: zone.postalCodePrefixes ?? [],
  freeDeliveryThreshold: zone.freeDeliveryThreshold ?? null,
  customerNote: zone.customerNote ?? "",
  sameDayEligible: zone.sameDayEligible ?? false,
  sortOrder: zone.sortOrder ?? 0,
});
function halifaxToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax" }).format(new Date());
}
function formatDay(date: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
function dayList(selected: number[]) {
  if (selected.length === 7) return "Every day";
  if (!selected.length) return "No days";
  return weekOrder
    .filter((day) => selected.includes(day))
    .map((day) => days[day])
    .join(", ");
}

export function DeliveryWorkspace({ initialZones }: { initialZones: DeliveryZone[] }) {
  const business = useBusinessSettings();
  const router = useRouter();
  const notify = useToast();
  const initial = useMemo<Draft>(
    () => ({
      schedule: {
        ...(business.fulfilmentSchedule ?? emptySchedule),
        blackouts: (business.fulfilmentSchedule?.blackouts ?? []).map((day) => ({ ...day, id: crypto.randomUUID() })),
      },
      deliveryEnabled: business.deliveryEnabled,
      deliveryTaxMode: business.deliveryTaxMode ?? "",
      zones: initialZones,
    }),
    [business, initialZones],
  );
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ schedule?: string; zones: Record<string, string> }>({ zones: {} });
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setSaved(initial);
    setDraft(initial);
  }, [initial]);

  const scheduleDirty =
    JSON.stringify(withoutIds(draft.schedule)) !== JSON.stringify(withoutIds(saved.schedule)) ||
    draft.deliveryEnabled !== saved.deliveryEnabled ||
    draft.deliveryTaxMode !== saved.deliveryTaxMode;
  const zonesDirty = JSON.stringify(draft.zones) !== JSON.stringify(saved.zones);
  const dirty = scheduleDirty || zonesDirty;
  useUnsavedChanges(dirty);

  const schedule = draft.schedule;
  const setSchedule = (patch: Partial<Schedule>) =>
    setDraft((current) => ({ ...current, schedule: { ...current.schedule, ...patch } }));
  const setZone = (id: string, patch: Partial<DeliveryZone>) =>
    setDraft((current) => ({
      ...current,
      zones: current.zones.map((zone) => (zone.id === id ? { ...zone, ...patch } : zone)),
    }));
  const toggleOpen = (id: string, force?: boolean) =>
    setOpen((current) => {
      const next = new Set(current);
      if (force ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });

  async function save() {
    const parsedSchedule = fulfilmentScheduleSchema.safeParse(withoutIds(schedule));
    const parsedZones = deliveryAreasSchema.safeParse(draft.zones.map((zone, sortOrder) => ({ ...zone, sortOrder })));
    const zoneErrors: Record<string, string> = {};
    if (!parsedZones.success)
      for (const issue of parsedZones.error.issues) {
        const zone = draft.zones[Number(issue.path[0])];
        if (zone && !zoneErrors[zone.id]) zoneErrors[zone.id] = issue.message;
      }
    const scheduleError = parsedSchedule.success ? undefined : parsedSchedule.error.issues[0]?.message;
    setErrors({ schedule: scheduleError, zones: zoneErrors });
    if (scheduleError || !parsedSchedule.success || !parsedZones.success) {
      for (const id of Object.keys(zoneErrors)) toggleOpen(id, true);
      notify(scheduleError ?? "Check the highlighted delivery areas.");
      return;
    }
    setSaving(true);
    try {
      const requests: Promise<Response>[] = [];
      if (scheduleDirty)
        requests.push(
          post({
            action: "settings",
            key: "business",
            value: {
              ...business,
              fulfilmentSchedule: parsedSchedule.data,
              deliveryEnabled: draft.deliveryEnabled,
              pickupEnabled: schedule.pickupEnabled,
              deliveryTaxMode: draft.deliveryTaxMode || null,
            },
          }),
        );
      if (zonesDirty) requests.push(post({ action: "delivery-zones", zones: parsedZones.data }));
      const responses = await Promise.all(requests);
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const payload = await failed.json().catch(() => null);
        notify(payload?.error ?? "Delivery settings could not be saved. Retry.");
        return;
      }
      setSaved(draft);
      setNewIds(new Set());
      notify("Delivery settings saved.");
      router.refresh();
    } catch {
      notify("Delivery settings could not be saved. Retry.");
    } finally {
      setSaving(false);
    }
  }

  function addZone() {
    const id = crypto.randomUUID();
    setNewIds((current) => new Set(current).add(id));
    setDraft((current) => ({
      ...current,
      zones: [
        ...current.zones,
        {
          id,
          name: "",
          fee: 0,
          minimumOrder: 0,
          estimate: "",
          active: false,
          postalCodePrefixes: [],
          freeDeliveryThreshold: null,
          customerNote: "",
          sameDayEligible: false,
          sortOrder: current.zones.length,
        },
      ],
    }));
    toggleOpen(id, true);
  }
  function duplicateZone(zone: DeliveryZone) {
    const id = crypto.randomUUID();
    setNewIds((current) => new Set(current).add(id));
    // Prefixes stay with the original: two active areas cannot share one.
    setDraft((current) => ({
      ...current,
      zones: [...current.zones, { ...zone, id, name: `${zone.name} copy`, active: false, postalCodePrefixes: [] }],
    }));
    toggleOpen(id, true);
  }
  function moveZone(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const zones = [...current.zones];
      const target = index + direction;
      if (target < 0 || target >= zones.length) return current;
      [zones[index], zones[target]] = [zones[target], zones[index]];
      return { ...current, zones };
    });
  }

  return (
    <div className="dw">
      <Overview draft={draft} />
      <div className="dw-layout">
        <div className="dw-main">
          <ScheduleCard
            schedule={schedule}
            deliveryEnabled={draft.deliveryEnabled}
            setDeliveryEnabled={(deliveryEnabled) => setDraft((current) => ({ ...current, deliveryEnabled }))}
            setSchedule={setSchedule}
          />
          <PickupCard schedule={schedule} setSchedule={setSchedule} />
          <ClosedDatesCard schedule={schedule} setSchedule={setSchedule} />
          <AreasCard
            zones={draft.zones}
            errors={errors.zones}
            newIds={newIds}
            open={open}
            toggleOpen={toggleOpen}
            setZone={setZone}
            addZone={addZone}
            duplicateZone={duplicateZone}
            moveZone={moveZone}
            discardZone={(id) =>
              setDraft((current) => ({ ...current, zones: current.zones.filter((z) => z.id !== id) }))
            }
          />
        </div>
        <aside className="dw-side">
          <NextDatesPreview draft={draft} />
          <PostalChecker zones={draft.zones} />
        </aside>
      </div>
      <div className={`dw-savebar${dirty ? " is-dirty" : ""}`}>
        <span role="status">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
          {errors.schedule && <small className="dw-error">{errors.schedule}</small>}
        </span>
        <div>
          <Button
            variant="ghost"
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(saved);
              setErrors({ zones: {} });
            }}
          >
            Discard
          </Button>
          <Button disabled={!dirty || saving} onClick={save}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function post(body: unknown) {
  return fetch("/api/admin/mutate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function Overview({ draft }: { draft: Draft }) {
  const money = useMoney();
  const active = draft.zones.filter((zone) => zone.active);
  const fees = active.map((zone) => zone.fee);
  const prefixes = new Set(active.flatMap((zone) => zone.postalCodePrefixes ?? []));
  const feeRange = !fees.length
    ? "—"
    : Math.min(...fees) === Math.max(...fees)
      ? money(fees[0])
      : `${money(Math.min(...fees))} – ${money(Math.max(...fees))}`;
  return (
    <div className="dw-stats">
      <div>
        <span>Delivery</span>
        <b className={draft.deliveryEnabled ? "is-on" : "is-off"}>{draft.deliveryEnabled ? "On" : "Paused"}</b>
        <small>{dayList(draft.schedule.deliveryDays)}</small>
      </div>
      <div>
        <span>Active areas</span>
        <b>{active.length}</b>
        <small>
          {prefixes.size} postal prefix{prefixes.size === 1 ? "" : "es"} covered
        </small>
      </div>
      <div>
        <span>Delivery fees</span>
        <b>{feeRange}</b>
        <small>
          {active.some((zone) => zone.freeDeliveryThreshold != null)
            ? "Free-delivery offers on"
            : "No free-delivery offers"}
        </small>
      </div>
      <div>
        <span>Pickup</span>
        <b className={draft.schedule.pickupEnabled ? "is-on" : "is-off"}>
          {draft.schedule.pickupEnabled ? "On" : "Off"}
        </b>
        <small>
          {draft.schedule.pickupEnabled
            ? `${dayList(draft.schedule.pickupDays)} · ${draft.schedule.pickupHours.start}–${draft.schedule.pickupHours.end}`
            : "Customers can't collect"}
        </small>
      </div>
    </div>
  );
}

function Card({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="dw-card">
      <header className="dw-card-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="dw-toggle">
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" />
      <b>{label}</b>
    </label>
  );
}

function DayPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const presets: [string, number[]][] = [
    ["Weekdays", [1, 2, 3, 4, 5]],
    ["Weekends", [0, 6]],
    ["Every day", [0, 1, 2, 3, 4, 5, 6]],
  ];
  return (
    <fieldset className="dw-days">
      <legend>{label}</legend>
      <div className="dw-day-pills">
        {weekOrder.map((day) => {
          const on = value.includes(day);
          return (
            <button
              type="button"
              key={day}
              aria-pressed={on}
              aria-label={dayNames[day]}
              onClick={() => onChange(on ? value.filter((item) => item !== day) : [...value, day].sort())}
            >
              {days[day]}
            </button>
          );
        })}
      </div>
      <div className="dw-presets">
        {presets.map(([name, preset]) => (
          <button type="button" key={name} onClick={() => onChange(preset)}>
            {name}
          </button>
        ))}
        {!!value.length && (
          <button type="button" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
    </fieldset>
  );
}

function Field({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: every caller passes the control as children.
    <label className={`dw-field${wide ? " is-wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

const formatMoneyInput = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2).replace(/\.00$/, ""));

function MoneyInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | null;
  onChange: (cents: number | null) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(formatMoneyInput(value));
  // Follow outside changes (discard, duplicate) without fighting what is being typed.
  useEffect(() => {
    setText((current) => {
      const typed = current.trim() === "" ? null : Math.round(Number(current) * 100);
      return typed === value ? current : formatMoneyInput(value);
    });
  }, [value]);
  return (
    <span className="dw-money">
      <i>$</i>
      <input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          const next = event.target.value.replace(/[^0-9.]/g, "");
          setText(next);
          if (next === "") onChange(null);
          else if (/^\d+(\.\d{0,2})?$/.test(next)) onChange(Math.round(Number(next) * 100));
        }}
        onBlur={() => setText(formatMoneyInput(value))}
      />
    </span>
  );
}

function ScheduleCard({
  schedule,
  deliveryEnabled,
  setDeliveryEnabled,
  setSchedule,
}: {
  schedule: Schedule;
  deliveryEnabled: boolean;
  setDeliveryEnabled: (value: boolean) => void;
  setSchedule: (patch: Partial<Schedule>) => void;
}) {
  return (
    <Card
      title="Delivery schedule"
      description="All times are Halifax time. Checkout only offers the days you choose here."
      action={
        <Toggle checked={deliveryEnabled} onChange={setDeliveryEnabled} label={deliveryEnabled ? "On" : "Paused"} />
      }
    >
      {!deliveryEnabled && (
        <p className="dw-note">Delivery is paused. Customers can still order for pickup if it is on.</p>
      )}
      <DayPicker
        label="Delivery days"
        value={schedule.deliveryDays}
        onChange={(deliveryDays) => setSchedule({ deliveryDays })}
      />
      <div className="dw-grid">
        <Field label="Default delivery estimate" hint="Shown where an area has no estimate of its own.">
          <input
            value={schedule.defaultEstimate}
            placeholder="For example: 1–2 days"
            onChange={(event) => setSchedule({ defaultEstimate: event.target.value })}
          />
        </Field>
      </div>
      <div className="dw-subsection">
        <div className="dw-subsection-head">
          <div>
            <b>Same-day delivery</b>
            <small>Only for areas marked as same-day eligible.</small>
          </div>
          <Toggle
            checked={schedule.sameDayEnabled}
            onChange={(sameDayEnabled) => setSchedule({ sameDayEnabled })}
            label={schedule.sameDayEnabled ? "On" : "Off"}
          />
        </div>
        {schedule.sameDayEnabled && (
          <>
            <div className="dw-grid">
              <Field label="Order cutoff" hint="Same-day orders close at this time.">
                <input
                  type="time"
                  value={schedule.sameDayCutoff}
                  onChange={(event) => setSchedule({ sameDayCutoff: event.target.value })}
                />
              </Field>
            </div>
            {MIN_LEAD_TIME_HOURS >= 24 && (
              <p className="dw-note is-warning">
                Every order needs at least {MIN_LEAD_TIME_HOURS} hours’ notice, so checkout can’t offer same-day
                delivery yet. This setting takes effect once that minimum is shortened.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function PickupCard({
  schedule,
  setSchedule,
}: {
  schedule: Schedule;
  setSchedule: (patch: Partial<Schedule>) => void;
}) {
  return (
    <Card
      title="Bakery pickup"
      description="Let customers collect their order from you."
      action={
        <Toggle
          checked={schedule.pickupEnabled}
          onChange={(pickupEnabled) => setSchedule({ pickupEnabled })}
          label={schedule.pickupEnabled ? "On" : "Off"}
        />
      }
    >
      {schedule.pickupEnabled ? (
        <>
          <div className="dw-grid">
            <Field label="Pickup address" wide>
              <input
                value={schedule.pickupAddress}
                placeholder="Street, city, province"
                onChange={(event) => setSchedule({ pickupAddress: event.target.value })}
              />
            </Field>
            <Field label="Pickup instructions" hint="Sent with pickup orders." wide>
              <textarea
                rows={2}
                value={schedule.pickupInstructions}
                placeholder="For example: ring the side door bell"
                onChange={(event) => setSchedule({ pickupInstructions: event.target.value })}
              />
            </Field>
          </div>
          <DayPicker
            label="Pickup days"
            value={schedule.pickupDays}
            onChange={(pickupDays) => setSchedule({ pickupDays })}
          />
          <div className="dw-grid is-three">
            <Field label="Opens">
              <input
                type="time"
                value={schedule.pickupHours.start}
                onChange={(event) =>
                  setSchedule({ pickupHours: { ...schedule.pickupHours, start: event.target.value } })
                }
              />
            </Field>
            <Field label="Closes">
              <input
                type="time"
                value={schedule.pickupHours.end}
                onChange={(event) => setSchedule({ pickupHours: { ...schedule.pickupHours, end: event.target.value } })}
              />
            </Field>
            <Field label="Extra packing time" hint="Minutes added before pickup.">
              <input
                type="number"
                min="0"
                step="5"
                value={Math.round(schedule.pickupPreparationBufferHours * 60)}
                onChange={(event) =>
                  setSchedule({ pickupPreparationBufferHours: Math.max(0, Number(event.target.value)) / 60 })
                }
              />
            </Field>
          </div>
        </>
      ) : (
        <p className="dw-note">Pickup is off. Turn it on to set an address, days and opening hours.</p>
      )}
    </Card>
  );
}

function ClosedDatesCard({
  schedule,
  setSchedule,
}: {
  schedule: Schedule;
  setSchedule: (patch: Partial<Schedule>) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const today = halifaxToday();
  const sorted = [...schedule.blackouts].sort((a, b) => a.date.localeCompare(b.date));
  const past = sorted.filter((day) => day.date && day.date < today);
  function add() {
    if (!from) return;
    const end = to && to > from ? to : from;
    const existing = new Set(schedule.blackouts.map((day) => day.date));
    const added: Blackout[] = [];
    // Ranges are capped at two months so a mistyped year can't add hundreds of dates.
    for (let cursor = new Date(`${from}T12:00:00Z`); added.length < 62; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10);
      if (date > end) break;
      if (!existing.has(date)) added.push({ id: crypto.randomUUID(), date, reason: reason.trim(), active: true });
    }
    setSchedule({ blackouts: [...schedule.blackouts, ...added] });
    setFrom("");
    setTo("");
    setReason("");
  }
  return (
    <Card
      title="Closed dates"
      description="Holidays and days off. No delivery or pickup is offered on these dates."
      action={
        past.length ? (
          <button
            type="button"
            className="dw-link"
            onClick={() =>
              setSchedule({ blackouts: schedule.blackouts.filter((day) => !day.date || day.date >= today) })
            }
          >
            Remove {past.length} past date{past.length === 1 ? "" : "s"}
          </button>
        ) : undefined
      }
    >
      <div className="dw-add-dates">
        <Field label="From">
          <input type="date" value={from} min={today} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="To (optional)">
          <input type="date" value={to} min={from || today} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <Field label="Reason (optional)">
          <input
            value={reason}
            placeholder="For example: Christmas"
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
        </Field>
        <Button variant="secondary" disabled={!from} onClick={add}>
          <Icon name="plus" /> Add
        </Button>
      </div>
      {sorted.length ? (
        <ul className="dw-dates">
          {sorted.map((day) => (
            <li key={day.id} className={`${day.date < today ? "is-past" : ""}${day.active ? "" : " is-off"}`}>
              <b>{day.date ? formatDay(day.date) : "No date"}</b>
              <input
                aria-label={`Reason for ${day.date}`}
                value={day.reason}
                placeholder="Closed"
                onChange={(event) =>
                  setSchedule({
                    blackouts: schedule.blackouts.map((item) =>
                      item.id === day.id ? { ...item, reason: event.target.value } : item,
                    ),
                  })
                }
              />
              {day.date < today && <em>Past</em>}
              <Toggle
                checked={day.active}
                label={day.active ? "Closed" : "Ignored"}
                onChange={(active) =>
                  setSchedule({
                    blackouts: schedule.blackouts.map((item) => (item.id === day.id ? { ...item, active } : item)),
                  })
                }
              />
              <button
                type="button"
                className="dw-icon-button"
                aria-label={`Remove ${day.date}`}
                onClick={() => setSchedule({ blackouts: schedule.blackouts.filter((item) => item.id !== day.id) })}
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dw-note">No closed dates. Orders follow your normal schedule.</p>
      )}
    </Card>
  );
}

function AreasCard({
  zones,
  errors,
  newIds,
  open,
  toggleOpen,
  setZone,
  addZone,
  duplicateZone,
  moveZone,
  discardZone,
}: {
  zones: DeliveryZone[];
  errors: Record<string, string>;
  newIds: Set<string>;
  open: Set<string>;
  toggleOpen: (id: string, force?: boolean) => void;
  setZone: (id: string, patch: Partial<DeliveryZone>) => void;
  addZone: () => void;
  duplicateZone: (zone: DeliveryZone) => void;
  moveZone: (index: number, direction: -1 | 1) => void;
  discardZone: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toUpperCase();
  const visible = zones
    .map((zone, index) => ({ zone, index }))
    .filter(
      ({ zone }) =>
        !q ||
        zone.name.toUpperCase().includes(q) ||
        (zone.postalCodePrefixes ?? []).some((prefix) => prefix.startsWith(q)),
    );
  // Every active area claiming each prefix, so clashes are flagged on both sides as they are typed.
  const owners = new Map<string, string[]>();
  for (const zone of zones)
    if (zone.active)
      for (const prefix of zone.postalCodePrefixes ?? []) owners.set(prefix, [...(owners.get(prefix) ?? []), zone.id]);
  const names = new Map(zones.map((zone) => [zone.id, zone.name || "another area"]));
  return (
    <Card
      title="Delivery areas"
      description="Each area covers postal prefixes (the first three characters, like B3H) and sets its own price. Areas are offered at checkout in this order."
      action={
        <Button variant="secondary" onClick={addZone}>
          <Icon name="plus" /> Add area
        </Button>
      }
    >
      {zones.length > 3 && (
        <label className="dw-search">
          <Icon name="search" />
          <input
            value={query}
            placeholder="Find an area by name or postal prefix"
            aria-label="Find a delivery area"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}
      {!zones.length && <EmptyState title="No delivery areas yet" body="Add the first area to offer local delivery." />}
      {!!zones.length && !visible.length && <p className="dw-note">No area matches “{query}”.</p>}
      <ol className="dw-areas">
        {visible.map(({ zone, index }) => (
          <AreaRow
            key={zone.id}
            zone={zone}
            index={index}
            count={zones.length}
            error={errors[zone.id]}
            isNew={newIds.has(zone.id)}
            open={open.has(zone.id)}
            clashes={(prefix) => {
              const other = zone.active ? owners.get(prefix)?.find((id) => id !== zone.id) : undefined;
              return other ? (names.get(other) ?? null) : null;
            }}
            toggle={() => toggleOpen(zone.id)}
            setZone={(patch) => setZone(zone.id, patch)}
            duplicate={() => duplicateZone(zone)}
            move={(direction) => moveZone(index, direction)}
            discard={() => discardZone(zone.id)}
          />
        ))}
      </ol>
    </Card>
  );
}

function AreaRow({
  zone,
  index,
  count,
  error,
  isNew,
  open,
  clashes,
  toggle,
  setZone,
  duplicate,
  move,
  discard,
}: {
  zone: DeliveryZone;
  index: number;
  count: number;
  error?: string;
  isNew: boolean;
  open: boolean;
  clashes: (prefix: string) => string | null;
  toggle: () => void;
  setZone: (patch: Partial<DeliveryZone>) => void;
  duplicate: () => void;
  move: (direction: -1 | 1) => void;
  discard: () => void;
}) {
  const money = useMoney();
  const prefixes = zone.postalCodePrefixes ?? [];
  const bodyId = `area-${zone.id}`;
  const [confirming, setConfirming] = useState(false);
  return (
    <li className={`dw-area${open ? " is-open" : ""}${zone.active ? "" : " is-inactive"}${error ? " has-error" : ""}`}>
      <div className="dw-area-summary">
        <span className="dw-area-index">{index + 1}</span>
        <button type="button" className="dw-area-toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <span className="dw-area-name">
            <b>{zone.name || "New delivery area"}</b>
            <small>
              {prefixes.length ? prefixes.slice(0, 4).join(", ") : "No postal prefixes yet"}
              {prefixes.length > 4 ? ` +${prefixes.length - 4}` : ""}
            </small>
          </span>
          <span className="dw-area-price">
            <b>{zone.fee ? money(zone.fee) : "Free"}</b>
            <small>
              {zone.minimumOrder ? `Min ${money(zone.minimumOrder)}` : "No minimum"}
              {zone.freeDeliveryThreshold != null ? ` · free over ${money(zone.freeDeliveryThreshold)}` : ""}
            </small>
          </span>
          <Icon name="chevron" />
        </button>
        <Toggle
          checked={zone.active}
          onChange={(active) => setZone({ active })}
          label={zone.active ? "Active" : "Off"}
        />
      </div>
      {error && !open && <p className="dw-error">{error}</p>}
      {open && (
        <div className="dw-area-body" id={bodyId}>
          {error && <p className="dw-error">{error}</p>}
          <div className="dw-grid">
            <Field label="Area name">
              <input
                value={zone.name}
                placeholder="For example: Halifax peninsula"
                onChange={(event) => setZone({ name: event.target.value })}
              />
            </Field>
            <Field label="Delivery estimate" hint="Shown to customers at checkout.">
              <input
                value={zone.estimate}
                placeholder="For example: Next delivery day"
                onChange={(event) => setZone({ estimate: event.target.value })}
              />
            </Field>
          </div>
          <PrefixInput
            value={prefixes}
            onChange={(postalCodePrefixes) => setZone({ postalCodePrefixes })}
            clashes={clashes}
          />
          <fieldset className="dw-pricing">
            <legend>Pricing</legend>
            <div className="dw-grid is-three">
              <Field label="Delivery fee">
                <MoneyInput value={zone.fee} placeholder="0" onChange={(fee) => setZone({ fee: fee ?? 0 })} />
              </Field>
              <Field label="Minimum order" hint="Basket subtotal needed.">
                <MoneyInput
                  value={zone.minimumOrder}
                  placeholder="0"
                  onChange={(minimumOrder) => setZone({ minimumOrder: minimumOrder ?? 0 })}
                />
              </Field>
              <Field label="Free delivery over" hint="Leave empty for no offer.">
                <MoneyInput
                  value={zone.freeDeliveryThreshold ?? null}
                  placeholder="No offer"
                  onChange={(freeDeliveryThreshold) => setZone({ freeDeliveryThreshold })}
                />
              </Field>
            </div>
            <p className="dw-sentence">
              Customers pay <b>{zone.fee ? money(zone.fee) : "nothing"}</b> for delivery
              {zone.freeDeliveryThreshold != null && (
                <>
                  , or nothing once their basket reaches <b>{money(zone.freeDeliveryThreshold)}</b>
                </>
              )}
              {zone.minimumOrder ? (
                <>
                  . Orders under <b>{money(zone.minimumOrder)}</b> can’t be delivered here
                </>
              ) : null}
              .
            </p>
          </fieldset>
          <div className="dw-grid">
            <Field label="Note for customers" hint="Optional. Shown when this area is chosen." wide>
              <input
                value={zone.customerNote ?? ""}
                placeholder="For example: we leave orders at the door if no one answers"
                onChange={(event) => setZone({ customerNote: event.target.value })}
              />
            </Field>
          </div>
          <div className="dw-area-foot">
            <Toggle
              checked={zone.sameDayEligible ?? false}
              onChange={(sameDayEligible) => setZone({ sameDayEligible })}
              label="Same-day eligible"
            />
            <div className="dw-area-actions">
              <button
                type="button"
                className="dw-icon-button"
                disabled={index === 0}
                onClick={() => move(-1)}
                aria-label="Move up"
              >
                <Icon name="chevron" className="is-up" />
              </button>
              <button
                type="button"
                className="dw-icon-button"
                disabled={index === count - 1}
                onClick={() => move(1)}
                aria-label="Move down"
              >
                <Icon name="chevron" className="is-down" />
              </button>
              <button type="button" className="dw-link" onClick={duplicate}>
                Duplicate
              </button>
              <button
                type="button"
                className="dw-link is-danger"
                onClick={() => (isNew ? discard() : setConfirming(true))}
              >
                Delete area
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title="Delete this delivery area?"
        body={`“${zone.name || "This area"}” will be deleted for good when you save, and customers in ${
          prefixes.length ? prefixes.join(", ") : "its postal codes"
        } won’t be offered delivery. Past orders keep their address and delivery fee.`}
        confirmLabel="Delete area"
        onConfirm={() => {
          setConfirming(false);
          discard();
        }}
        onCancel={() => setConfirming(false)}
      />
    </li>
  );
}

function PrefixInput({
  value,
  onChange,
  clashes,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  clashes: (prefix: string) => string | null;
}) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  function commit(raw: string) {
    const tokens = raw
      .toUpperCase()
      .split(/[\s,;]+/)
      .map((token) => token.slice(0, 3))
      .filter(Boolean);
    if (!tokens.length) return;
    const invalid = tokens.filter((token) => !prefixPattern.test(token));
    const valid = tokens.filter((token) => prefixPattern.test(token) && !value.includes(token));
    if (valid.length) onChange([...value, ...valid]);
    setProblem(
      invalid.length
        ? `${invalid.join(", ")} ${invalid.length === 1 ? "isn’t" : "aren’t"} a Nova Scotia prefix (like B3H).`
        : "",
    );
    setText("");
  }
  return (
    <div className="dw-field is-wide">
      <span>Postal prefixes</span>
      <div className="dw-chips">
        {value.map((prefix) => {
          const owner = clashes(prefix);
          return (
            <span
              key={prefix}
              className={`dw-chip${owner ? " is-clash" : ""}`}
              title={owner ? `Also in ${owner}` : undefined}
            >
              {prefix}
              {owner && <small>also in {owner}</small>}
              <button
                type="button"
                aria-label={`Remove ${prefix}`}
                onClick={() => onChange(value.filter((item) => item !== prefix))}
              >
                <Icon name="close" />
              </button>
            </span>
          );
        })}
        <input
          value={text}
          aria-label="Add postal prefixes"
          placeholder={value.length ? "Add more…" : "Type B3H, B3J… then press Enter"}
          onChange={(event) => {
            const next = event.target.value;
            if (/[\s,;]$/.test(next)) commit(next);
            else setText(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(text);
            } else if (event.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onPaste={(event) => {
            event.preventDefault();
            commit(event.clipboardData.getData("text"));
          }}
          onBlur={() => commit(text)}
        />
      </div>
      {problem ? (
        <small className="dw-error">{problem}</small>
      ) : (
        <small>Separate prefixes with commas or spaces. Paste a whole list at once.</small>
      )}
    </div>
  );
}

function NextDatesPreview({ draft }: { draft: Draft }) {
  // Worked out after mount so the server render and the browser agree on "now".
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const area = draft.zones.find((zone) => zone.active);
  const attempt = (mode: "delivery" | "pickup") => {
    if (!now) return { label: "…" };
    if (mode === "delivery" && !draft.deliveryEnabled) return { off: "Delivery is paused" };
    if (mode === "delivery" && !area) return { off: "No active delivery area" };
    if (mode === "pickup" && !draft.schedule.pickupEnabled) return { off: "Pickup is off" };
    try {
      const result = earliestFulfilment({
        mode,
        schedule: withoutIds(draft.schedule),
        area: area ? asArea(area) : undefined,
        preparationHours: 0,
        now,
      });
      return {
        label:
          mode === "pickup"
            ? new Intl.DateTimeFormat("en-CA", {
                timeZone: "America/Halifax",
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(result.earliestAt))
            : formatDay(result.date),
      };
    } catch (reason) {
      return { off: reason instanceof Error ? reason.message : "Not available" };
    }
  };
  const rows: [string, ReturnType<typeof attempt>][] = [
    ["Delivery", attempt("delivery")],
    ["Pickup", attempt("pickup")],
  ];
  return (
    <section className="dw-panel">
      <h3>
        <Icon name="clock" /> If someone orders now
      </h3>
      <p>
        Earliest dates checkout would offer, using your unsaved changes and the {MIN_LEAD_TIME_HOURS}-hour minimum
        notice.
      </p>
      <dl>
        {rows.map(([name, result]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd className={"off" in result ? "is-off" : ""}>{"off" in result ? result.off : result.label}</dd>
          </div>
        ))}
      </dl>
      <small>Items with longer preparation times push these dates later.</small>
    </section>
  );
}

function PostalChecker({ zones }: { zones: DeliveryZone[] }) {
  const money = useMoney();
  const [postal, setPostal] = useState("");
  const [basket, setBasket] = useState<number | null>(5000);
  let result: { tone: "ok" | "warn" | "off"; title: string; body: string } | null = null;
  if (postal.replace(/\s/g, "").length >= 6) {
    try {
      const { area, postalCode } = resolveDeliveryArea(postal, zones.map(asArea));
      try {
        const charge = deliveryCharge(area, basket ?? 0);
        result = {
          tone: "ok",
          title: `${postalCode} → ${area.name}`,
          body:
            charge.fee === 0
              ? `Free delivery on this basket. ${area.estimate || ""}`.trim()
              : `Delivery costs ${money(charge.fee)}.${
                  charge.freeDeliveryRemaining ? ` ${money(charge.freeDeliveryRemaining)} more for free delivery.` : ""
                } ${area.estimate || ""}`.trim(),
        };
      } catch {
        result = {
          tone: "warn",
          title: `${postalCode} → ${area.name}`,
          body: `This basket is below the ${money(area.minimumOrder)} minimum for this area.`,
        };
      }
    } catch (reason) {
      result = { tone: "off", title: "Can’t deliver here", body: reason instanceof Error ? reason.message : "" };
    }
  }
  return (
    <section className="dw-panel">
      <h3>
        <Icon name="truck" /> Check a postal code
      </h3>
      <p>See what a customer would pay, using your unsaved changes.</p>
      <div className="dw-checker">
        <Field label="Postal code">
          <input
            value={postal}
            placeholder="B3H 1A1"
            autoComplete="off"
            onChange={(event) => setPostal(event.target.value)}
          />
        </Field>
        <Field label="Basket subtotal">
          <MoneyInput value={basket} placeholder="0" onChange={setBasket} />
        </Field>
      </div>
      {result ? (
        <div className={`dw-result is-${result.tone}`} role="status">
          <b>{result.title}</b>
          <span>{result.body}</span>
        </div>
      ) : (
        <small>Enter a full postal code to check it.</small>
      )}
    </section>
  );
}
