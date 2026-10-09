/**
 * CanonicalChart — the single natal-chart truth for Navagraha V3.
 *
 * Every downstream consumer (Kundli UI, reports, evidence engine, AI, the
 * professional tool) reads planets, houses, vargas, dashas and strengths from
 * this object. Nothing downstream recalculates natal astronomy.
 *
 * The schema is strict and versioned: a chart that does not validate is
 * rejected rather than partially rendered.
 */
import { z } from "zod";

export const CANONICAL_SCHEMA = "navagraha.canonical-chart" as const;
export const CANONICAL_SCHEMA_VERSION = "3.0.0" as const;
export const CALCULATION_ENGINE = "navagraha-core" as const;
export const CALCULATION_VERSION = "3.0.0" as const;

export const GRAHAS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"] as const;
export const SEVEN_GRAHAS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"] as const;
export const SIGN_NAMES = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;
export const VARGA_DIVISIONS = ["D1", "D3", "D4", "D7", "D9", "D10", "D12", "D60"] as const;

export type Graha = typeof GRAHAS[number];
export type SevenGraha = typeof SEVEN_GRAHAS[number];
export type SignName = typeof SIGN_NAMES[number];
export type VargaDivision = typeof VARGA_DIVISIONS[number];

const graha = z.enum(GRAHAS);
const sevenGraha = z.enum(SEVEN_GRAHAS);
const signName = z.enum(SIGN_NAMES);
const signIndex = z.number().int().min(0).max(11);
const longitude = z.number().finite().gte(0).lt(360);
const degreeInSign = z.number().finite().gte(0).lt(30);
const houseNumber = z.number().int().min(1).max(12);
const isoInstant = z.string().datetime({ offset: true });

const nakshatra = z.object({
  index: z.number().int().min(0).max(26),
  name: z.string().min(1),
  lord: graha,
  pada: z.number().int().min(1).max(4),
}).strict();

export const planetPositionSchema = z.object({
  name: graha,
  longitude,
  latitude: z.number().finite(),
  speed: z.number().finite(),          // degrees/day, sidereal
  retrograde: z.boolean(),
  signIndex,
  sign: signName,
  degreeInSign,
  house: houseNumber,                  // whole-sign house from the Lagna
  nakshatra,
}).strict();

const vargaChart = z.object({
  division: z.enum(VARGA_DIVISIONS),
  name: z.string(),
  ascendantSignIndex: signIndex,
  placements: z.array(z.object({ planet: graha, signIndex, sign: signName, house: houseNumber }).strict()).length(9),
}).strict();

const dignity = z.object({
  planet: sevenGraha,
  sign: signName,
  degree: z.number().finite(),
  dignity: z.enum(["Exalted", "Debilitated", "Moolatrikona", "Own sign", "Friend's sign", "Enemy's sign", "Neutral sign"]),
  retrograde: z.boolean(),
  combust: z.boolean(),
  planetaryWar: z.string().optional(),
  avastha: z.string(),
  neechaBhanga: z.boolean().optional(),
}).strict();

const dashaPeriod = z.object({ lord: graha, start: isoInstant, end: isoInstant }).strict();

export const canonicalChartSchema = z.object({
  meta: z.object({
    schema: z.literal(CANONICAL_SCHEMA),
    schemaVersion: z.literal(CANONICAL_SCHEMA_VERSION),
    engine: z.literal(CALCULATION_ENGINE),
    engineVersion: z.literal(CALCULATION_VERSION),
    ephemeris: z.string().min(1),
    ephemerisVersion: z.string().min(1),
    ayanamsa: z.literal("Lahiri"),
    ayanamsaDegrees: z.number().finite().gt(19).lt(27),
    zodiac: z.literal("sidereal"),
    houseSystem: z.literal("whole-sign"),
    nodeType: z.literal("mean"),
    julianDayUT: z.number().finite(),
    calculatedAt: isoInstant,
  }).strict(),
  birth: z.object({
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    localTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
    place: z.string(),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    timezone: z.string().min(1),
    utcOffset: z.string().regex(/^[+-]\d{2}:\d{2}(:\d{2})?$/),
    utcOffsetSeconds: z.number().int(),
    birthUTC: isoInstant,
    timeAccuracy: z.enum(["exact", "approximate"]),
    coordinateSource: z.enum(["supplied", "geocoded"]),
    timezoneSource: z.enum(["supplied", "coordinates"]),
  }).strict(),
  uncertainty: z.object({
    timeAccuracy: z.enum(["exact", "approximate"]),
    /** False when the birth time is approximate: Lagna, houses and time-sensitive vargas are unreliable. */
    ascendantReliable: z.boolean(),
    ascendantDegreesFromSignBoundary: z.number().finite().min(0).max(15),
    moonSignStableAcrossBirthDate: z.boolean(),
    moonNakshatraStableAcrossBirthDate: z.boolean(),
    notes: z.array(z.string()),
  }).strict(),
  ascendant: z.object({ longitude, signIndex, sign: signName, degreeInSign, nakshatra }).strict(),
  midheaven: z.object({ longitude, signIndex, sign: signName }).strict(),
  planets: z.array(planetPositionSchema).length(9),
  houses: z.array(z.object({
    house: houseNumber, signIndex, sign: signName, lord: sevenGraha, lordHouse: houseNumber, occupants: z.array(graha),
  }).strict()).length(12),
  aspects: z.array(z.object({ planet: graha, aspectsHouses: z.array(houseNumber), aspectsPlanets: z.array(graha) }).strict()).length(9),
  vargas: z.object(Object.fromEntries(VARGA_DIVISIONS.map((d) => [d, vargaChart])) as Record<VargaDivision, typeof vargaChart>).strict(),
  strength: z.object({
    dignities: z.array(dignity).length(7),
    ashtakavarga: z.object({
      bav: z.record(sevenGraha, z.array(z.number().int().min(0).max(8)).length(12)),
      sav: z.array(z.number().int().min(0).max(56)).length(12),
      savByHouse: z.array(z.number().int().min(0).max(56)).length(12),
    }).strict(),
    shadbala: z.object({
      status: z.literal("partial"),
      unit: z.literal("virupa"),
      componentsIncluded: z.array(z.enum(["uchcha", "dig", "naisargika"])),
      componentsMissing: z.array(z.string()),
      note: z.string(),
      planets: z.array(z.object({
        planet: sevenGraha,
        uchcha: z.number().finite().min(0).max(60),
        dig: z.number().finite().min(0).max(60),
        naisargika: z.number().finite().min(0).max(60),
      }).strict()).length(7),
    }).strict(),
  }).strict(),
  yogas: z.array(z.object({
    name: z.string(), category: z.string(), planets: z.array(z.string()), cancelled: z.boolean().optional(), description: z.string(),
  }).strict()),
  doshas: z.array(z.object({
    id: z.enum(["mangal", "kaalSarp", "pitru", "vishaYoga"]),
    name: z.string(),
    present: z.boolean(),
    rule: z.string(),
    /** Cancellation conditions found; when non-empty, `present` is false. Absent on charts computed before cancellations were evaluated. */
    cancelledBy: z.array(z.string()).optional(),
  }).strict()).length(4),
  dashas: z.object({
    vimshottari: z.object({
      yearLengthDays: z.number().positive(),
      moonNakshatraIndex: z.number().int().min(0).max(26),
      birthLord: graha,
      elapsedFractionAtBirth: z.number().min(0).lt(1),
      balanceAtBirthYears: z.number().positive(),
      mahadashas: z.array(dashaPeriod.extend({ antardashas: z.array(dashaPeriod).length(9) }).strict()).min(9),
    }).strict(),
    yogini: z.object({
      birthYogini: z.string(),
      elapsedFractionAtBirth: z.number().min(0).lt(1),
      periods: z.array(dashaPeriod.extend({ yogini: z.string(), years: z.number().positive() }).strict()).min(8),
    }).strict(),
    chara: z.object({
      verified: z.literal(false),
      methodology: z.string(),
      periods: z.array(z.object({ sign: signName, years: z.number().positive(), start: isoInstant, end: isoInstant }).strict()).length(12),
    }).strict(),
  }).strict(),
  jaimini: z.object({
    charaKarakas: z.array(z.object({ karaka: z.string(), abbr: z.string(), planet: graha, rankDegree: z.number() }).strict()).length(8),
    karakamshaSign: signName,
  }).strict(),
}).strict();

export type CanonicalChart = z.infer<typeof canonicalChartSchema>;
export type CanonicalPlanet = z.infer<typeof planetPositionSchema>;

/** Parse and validate; throws a descriptive error for any malformed chart. */
export function assertCanonicalChart(value: unknown): CanonicalChart {
  const parsed = canonicalChartSchema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`Invalid CanonicalChart: ${first}`);
  }
  return parsed.data;
}

export function isCurrentCanonicalChart(value: unknown): value is CanonicalChart {
  return canonicalChartSchema.safeParse(value).success;
}
