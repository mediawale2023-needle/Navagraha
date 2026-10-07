import { z } from "zod";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const BIRTH_TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

// Reject dates such as 2023-02-30 that JS Date would roll into another day.
function isCalendarDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const coordinate = z.union([z.number(), z.string()]).nullish();

/** Birth details explicitly entered for an unsaved, in-memory chart. */
export const explicitBirthDetailsSchema = z.object({
  name: z.string().max(200).nullish(),
  gender: z.string().max(32).nullish(),
  dateOfBirth: z
    .string({ required_error: "Birth date is required", invalid_type_error: "Birth date must be a YYYY-MM-DD string" })
    .trim()
    .refine(isCalendarDate, "Birth date must be a valid YYYY-MM-DD date"),
  timeOfBirth: z
    .string({ required_error: "Birth time is required", invalid_type_error: "Birth time must be an HH:MM or HH:MM:SS string" })
    .trim()
    .regex(BIRTH_TIME, "Birth time must be HH:MM or HH:MM:SS between 00:00 and 23:59:59"),
  placeOfBirth: z.string().max(300).nullish(),
  latitude: coordinate,
  longitude: coordinate,
  isBirthTimeApproximate: z.boolean().optional(),
}, { invalid_type_error: "birthDetails must be an object" });

export type ExplicitBirthDetails = z.infer<typeof explicitBirthDetailsSchema>;

export type ChartSelection =
  | { kind: "saved"; kundliId: string }
  | { kind: "birthDetails"; details: ExplicitBirthDetails }
  | { kind: "default" }
  | { kind: "invalid"; message: string };

/**
 * Decide which chart a report/chat request refers to. Only a request that
 * omits both `kundliId` and `birthDetails` may fall back to the user's latest
 * saved chart; anything explicitly supplied must be valid, so bad input is
 * rejected instead of silently switching to a different chart.
 */
export function selectChart(body: unknown): ChartSelection {
  const { kundliId, birthDetails } = (body ?? {}) as Record<string, unknown>;
  const hasKundliId = kundliId !== undefined;
  const hasBirthDetails = birthDetails !== undefined;

  if (hasKundliId && hasBirthDetails) {
    return { kind: "invalid", message: "Provide either a saved chart or birth details, not both." };
  }
  if (hasKundliId) {
    if (typeof kundliId !== "string" || kundliId.trim() === "") {
      return { kind: "invalid", message: "kundliId must be a non-empty string" };
    }
    return { kind: "saved", kundliId };
  }
  if (hasBirthDetails) {
    const parsed = explicitBirthDetailsSchema.safeParse(birthDetails);
    if (!parsed.success) return { kind: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid birth details" };
    return { kind: "birthDetails", details: parsed.data };
  }
  return { kind: "default" };
}
