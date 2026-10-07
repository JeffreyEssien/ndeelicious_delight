import { z } from "zod";
export const cakeTypeSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(100),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().trim().max(1000),
    leadTimeValue: z.number().finite().min(0).max(8760),
    leadTimeUnit: z.enum(["hours", "days", "weeks"]),
    active: z.boolean(),
    sortOrder: z.number().int().min(0),
    image: z.string().max(2000),
    customerNotice: z.string().trim().max(1000),
  })
  .superRefine((value, ctx) => {
    if (value.active && value.leadTimeValue <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["leadTimeValue"],
        message: "Active cake types require a positive lead time.",
      });
  });
export type CakeType = z.infer<typeof cakeTypeSchema>;

export const cakeTypesSchema = z
  .array(cakeTypeSchema)
  .max(100)
  .superRefine((types, ctx) => {
    for (const key of ["id", "slug"] as const) {
      const seen = new Set<string>();
      types.forEach((type, index) => {
        if (seen.has(type[key]))
          ctx.addIssue({ code: "custom", path: [index, key], message: `Each cake type needs a unique ${key}.` });
        seen.add(type[key]);
      });
    }
  });
