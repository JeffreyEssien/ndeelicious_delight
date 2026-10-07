import { z } from "zod";
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const days = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .refine((values) => new Set(values).size === values.length, "Choose each day once.");
export const deliveryAreaSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(120),
    postalCodePrefixes: z
      .array(
        z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^B\d[ABCEGHJ-NPRSTVWXYZ]$/),
      )
      .max(200),
    fee: z.number().int().min(0).max(100000000),
    minimumOrder: z.number().int().min(0).max(100000000),
    freeDeliveryThreshold: z.number().int().min(0).max(100000000).nullable(),
    customerNote: z.string().trim().max(1000),
    estimate: z.string().trim().max(300),
    sameDayEligible: z.boolean(),
    active: z.boolean(),
    sortOrder: z.number().int().min(0),
  })
  .refine(
    (area) => !area.active || area.postalCodePrefixes.length > 0,
    "Active areas need at least one postal prefix.",
  );
export const deliveryAreasSchema = z
  .array(deliveryAreaSchema)
  .max(200)
  .superRefine((areas, ctx) => {
    const prefixes = new Set<string>();
    const ids = new Set<string>();
    areas.forEach((area, index) => {
      if (ids.has(area.id)) ctx.addIssue({ code: "custom", path: [index, "id"], message: "Duplicate delivery area." });
      ids.add(area.id);
      if (!area.active) return;
      area.postalCodePrefixes.forEach((prefix) => {
        if (prefixes.has(prefix))
          ctx.addIssue({
            code: "custom",
            path: [index, "postalCodePrefixes"],
            message: `Postal prefix ${prefix} belongs to more than one active area.`,
          });
        prefixes.add(prefix);
      });
    });
  });
export const fulfilmentScheduleSchema = z
  .object({
    timezone: z.literal("America/Halifax"),
    deliveryDays: days,
    sameDayEnabled: z.boolean(),
    sameDayCutoff: time,
    defaultEstimate: z.string().trim().max(300),
    blackouts: z
      .array(z.object({ date: z.iso.date(), reason: z.string().trim().max(300), active: z.boolean() }))
      .max(1000),
    pickupEnabled: z.boolean(),
    pickupAddress: z.string().trim().max(500),
    pickupInstructions: z.string().trim().max(1000),
    pickupDays: days,
    pickupHours: z
      .object({ start: time, end: time })
      .refine((hours) => hours.start < hours.end, "Closing time must follow opening time."),
    pickupPreparationBufferHours: z.number().min(0).max(8760),
  })
  .refine(
    (schedule) => !schedule.pickupEnabled || (schedule.pickupAddress.length > 0 && schedule.pickupDays.length > 0),
    "Pickup needs an address and open days.",
  );
