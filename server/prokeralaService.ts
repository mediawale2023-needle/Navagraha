/**
 * Prokerala Astrology API Service
 *
 * Authentication: OAuth 2.0 Client Credentials
 * Token URL:      https://api.prokerala.com/token
 * Base URL:       https://api.prokerala.com/v2/astrology/
 *
 * Required env vars:
 *   PROKERALA_CLIENT_ID     – Your Prokerala Client ID
 *   PROKERALA_CLIENT_SECRET – Your Prokerala Client Secret
 */

const TOKEN_URL   = 'https://api.prokerala.com/token';
const API_BASE    = 'https://api.prokerala.com/v2/astrology';
const NUMEROLOGY_BASE = 'https://api.prokerala.com/v2/numerology';
const DEFAULT_AYANAMSA = 1; // Lahiri (most common)

// ─── Token Cache ─────────────────────────────────────────────────────────────

let _cachedToken: string | null = null;
let _tokenExpiresAt: number = 0;

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) {
    return _cachedToken;
  }

  const clientId     = process.env.PROKERALA_CLIENT_ID;
  const clientSecret = process.env.PROKERALA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('PROKERALA_CLIENT_ID and PROKERALA_CLIENT_SECRET are required');
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prokerala token error ${response.status}: ${text}`);
  }

  const data = await response.json();
  _cachedToken    = data.access_token as string;
  _tokenExpiresAt = Date.now() + (data.expires_in as number) * 1000;
  return _cachedToken;
}

// ─── Core GET helper ─────────────────────────────────────────────────────────

async function apiGet(path: string, params: Record<string, string>): Promise<any> {
  const token = await getAccessToken();
  const url   = new URL(`${API_BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prokerala API error ${response.status}: ${text}`);
  }

  return response.json();
}

async function numerologyGet(path: string, params: Record<string, string>): Promise<any> {
  const token = await getAccessToken();
  const url   = new URL(`${NUMEROLOGY_BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prokerala numerology error ${response.status}: ${text}`);
  }

  return response.json();
}

// ─── Datetime helpers ─────────────────────────────────────────────────────────

/**
 * Build ISO 8601 datetime string with IST offset (+05:30)
 * dateOfBirth: JS Date or ISO string (date part used)
 * timeOfBirth: "HH:MM" or "HH:MM:SS"
 */
export function buildDatetime(dateOfBirth: Date | string, timeOfBirth: string): string {
  const d   = new Date(dateOfBirth);
  const y   = d.getUTCFullYear();
  const mo  = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const time = timeOfBirth.length === 5 ? `${timeOfBirth}:00` : timeOfBirth; // ensure HH:MM:SS
  return `${y}-${mo}-${day}T${time}+05:30`;
}

export function isProkeralaConfigured(): boolean {
  return !!(process.env.PROKERALA_CLIENT_ID && process.env.PROKERALA_CLIENT_SECRET);
}

// ─── 1. Kundli / Birth Chart ──────────────────────────────────────────────────

export interface ProkeralaKundliResult {
  zodiacSign:  string;
  moonSign:    string;
  ascendant:   string;
  nakshatra:   string;
  chartData:   {
    houses:             Array<{ house: number; sign: string; planets: string[] }>;
    planetaryPositions: Array<{ planet: string; sign: string; degree: number; house: number; isRetrograde: boolean }>;
  };
  dashas:  Array<{ planet: string; period: string; status: string; startDate: string; endDate: string }>;
  doshas:  { mangalDosha: boolean; kaalSarpDosha: boolean; pitruDosha: boolean };
  remedies: Array<{ title: string; description: string; type: string }>;
  raw: any;
}

export async function getKundli(
  dateOfBirth: Date | string,
  timeOfBirth: string,
  latitude: number,
  longitude: number,
): Promise<ProkeralaKundliResult> {
  const datetime    = buildDatetime(dateOfBirth, timeOfBirth);
  const coordinates = `${latitude},${longitude}`;

  const raw = await apiGet('kundli', {
    datetime,
    coordinates,
    ayanamsa:    String(DEFAULT_AYANAMSA),
    result_type: 'advanced',
    la:          'en',
  });

  return mapKundliResponse(raw);
}

function mapKundliResponse(raw: any): ProkeralaKundliResult {
  const data = raw?.data ?? raw;

  // Planet name normaliser
  const planetName = (p: string) => p?.charAt(0).toUpperCase() + p?.slice(1).toLowerCase();

  const planetaryPositions = (data?.planet_position ?? []).map((p: any) => ({
    planet:       planetName(p.name ?? p.planet ?? ''),
    sign:         p.rasi?.name ?? p.sign ?? '',
    degree:       parseFloat(p.degree ?? 0),
    house:        p.house ?? 0,
    isRetrograde: !!p.is_retrograde,
  }));

  // Build houses array from planetary positions
  const houses: Array<{ house: number; sign: string; planets: string[] }> = Array.from(
    { length: 12 }, (_, i) => ({ house: i + 1, sign: '', planets: [] }),
  );
  planetaryPositions.forEach((p: any) => {
    const idx = (p.house ?? 1) - 1;
    if (idx >= 0 && idx < 12) houses[idx].planets.push(p.planet);
  });

  // Dashas
  const dashaData = data?.dasha_periods ?? data?.vimshottari_dasha ?? [];
  const now = Date.now();
  const dashas = dashaData.slice(0, 10).map((d: any) => {
    const start = new Date(d.start ?? d.start_date ?? '').getTime();
    const end   = new Date(d.end   ?? d.end_date   ?? '').getTime();
    return {
      planet:    planetName(d.planet ?? d.name ?? ''),
      period:    `${d.start_year ?? d.start ?? ''}–${d.end_year ?? d.end ?? ''}`,
      startDate: d.start ?? d.start_date ?? '',
      endDate:   d.end   ?? d.end_date   ?? '',
      status:    now >= start && now <= end ? 'current' : now < start ? 'upcoming' : 'past',
    };
  });

  const doshas = {
    mangalDosha:  data?.mangal_dosha?.has_dosha ?? data?.mangal_dosha?.is_dosha_present ?? false,
    kaalSarpDosha: data?.kaal_sarp_dosha?.has_dosha ?? false,
    pitruDosha:   data?.pitra_dosha?.has_dosha ?? false,
  };

  const nakshatra = data?.nakshatra?.name ?? data?.birth_nakshatra ?? '';

  // Basic remedies from nakshatra lord
  const remedies = [
    { title: 'Gemstone', description: data?.lucky_gemstone ?? 'Consult an astrologer for your lucky gemstone', type: 'gemstone' },
    { title: 'Mantra',   description: data?.mantra ?? 'Chant your nakshatra deity mantra 108 times daily', type: 'mantra' },
    { title: 'Charity',  description: data?.charity ?? 'Donate on the day ruled by your lagna lord', type: 'charity' },
    { title: 'Fasting',  description: data?.fasting ?? 'Observe fast on your ruling planet\'s day', type: 'fasting' },
  ];

  return {
    zodiacSign: data?.sun_sign?.name ?? data?.rasi?.name ?? '',
    moonSign:   data?.moon_sign?.name ?? data?.moon_rasi?.name ?? '',
    ascendant:  data?.ascendant?.name ?? data?.lagna?.name ?? '',
    nakshatra,
    chartData:  { houses, planetaryPositions },
    dashas,
    doshas,
    remedies,
    raw,
  };
}

// ─── 2. Kundli Matching ───────────────────────────────────────────────────────

export interface ProkeralaMatchResult {
  score:      number;
  maxScore:   number;
  percentage: number;
  details:    Array<{ koot: string; score: number; maxScore: number; description: string }>;
  compatibility: string;  // "Excellent" | "Good" | "Average" | "Poor"
  recommendation: string;
  dosha:      { hasDosha: boolean; type: string; description: string };
  raw: any;
}

export async function getKundliMatching(
  person1: { dateOfBirth: Date | string; timeOfBirth: string; latitude: number; longitude: number },
  person2: { dateOfBirth: Date | string; timeOfBirth: string; latitude: number; longitude: number },
): Promise<ProkeralaMatchResult> {
  const raw = await apiGet('kundli-matching/advanced', {
    'girl_dob':         buildDatetime(person1.dateOfBirth, person1.timeOfBirth),
    'girl_coordinates': `${person1.latitude},${person1.longitude}`,
    'boy_dob':          buildDatetime(person2.dateOfBirth, person2.timeOfBirth),
    'boy_coordinates':  `${person2.latitude},${person2.longitude}`,
    ayanamsa:           String(DEFAULT_AYANAMSA),
    la:                 'en',
  });

  return mapMatchingResponse(raw);
}

function mapMatchingResponse(raw: any): ProkeralaMatchResult {
  const data = raw?.data ?? raw;
  const gunaData = data?.guna_milan ?? data?.matching_result ?? {};
  const score    = gunaData?.total_points ?? gunaData?.score ?? 0;
  const maxScore = gunaData?.maximum_points ?? 36;
  const pct      = Math.round((score / maxScore) * 100);

  const details = (gunaData?.guna_details ?? gunaData?.details ?? []).map((g: any) => ({
    koot:        g.name ?? g.koot ?? '',
    score:       g.received_points ?? g.score ?? 0,
    maxScore:    g.maximum_points ?? g.max_score ?? 0,
    description: g.description ?? '',
  }));

  const compat = pct >= 75 ? 'Excellent' : pct >= 60 ? 'Good' : pct >= 40 ? 'Average' : 'Poor';
  const doshaData = data?.papi_samyam ?? data?.dosha ?? {};

  return {
    score,
    maxScore,
    percentage: pct,
    details,
    compatibility:  compat,
    recommendation: data?.recommendation ?? '',
    dosha: {
      hasDosha:    doshaData?.has_dosha ?? false,
      type:        doshaData?.type ?? '',
      description: doshaData?.description ?? '',
    },
    raw,
  };
}

// ─── 3. Daily Horoscope ───────────────────────────────────────────────────────

export interface ProkeralaHoroscope {
  sign:       string;
  date:       string;
  prediction: string;
  lucky: {
    number: string;
    color:  string;
    time:   string;
  };
}

export async function getDailyHoroscope(
  sign: string,
  date: 'today' | 'yesterday' | 'tomorrow' = 'today',
  type: 'general' | 'career' | 'health' | 'love' = 'general',
): Promise<ProkeralaHoroscope> {
  const raw = await apiGet('daily-horoscope', {
    sign,
    date,
    type,
  });

  const data = raw?.data ?? raw;
  return {
    sign,
    date:       data?.date ?? new Date().toISOString().split('T')[0],
    prediction: data?.prediction ?? data?.horoscope ?? data?.description ?? '',
    lucky: {
      number: String(data?.lucky_number ?? ''),
      color:  data?.lucky_color ?? '',
      time:   data?.lucky_time ?? '',
    },
  };
}

// ─── 4. Numerology ────────────────────────────────────────────────────────────

export interface ProkeralaNumerology {
  lifePath:    number;
  destiny:     number;
  soul:        number;
  personality: number;
  birthday:    number;
  name:        string;
  details:     Record<string, any>;
  raw: any;
}

export async function getNumerology(
  dateOfBirth: Date | string,
  firstName:   string,
  lastName:    string = '',
  system:      'pythagorean' | 'chaldean' = 'pythagorean',
): Promise<ProkeralaNumerology> {
  const d  = new Date(dateOfBirth);
  const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

  // Pythagorean system: fetch life-path, destiny, soul-urge, personality numbers
  const fetchNumber = async (calc: string) => {
    try {
      const r = await numerologyGet(`numerology`, {
        datetime:   `${dateStr}T00:00:00+05:30`,
        first_name:  firstName,
        last_name:   lastName,
        system,
        calculator:  calc,
      });
      return r?.data?.result ?? r?.data?.number ?? r?.data?.value ?? null;
    } catch {
      return null;
    }
  };

  // Run all 4 calculations in parallel
  const [lifePathRaw, destinyRaw, soulRaw, personalityRaw, birthdayRaw] = await Promise.all([
    fetchNumber('life-path-number'),
    fetchNumber('destiny-number'),
    fetchNumber('soul-urge-number'),
    fetchNumber('personality-number'),
    fetchNumber('birthday-number'),
  ]);

  return {
    lifePath:    Number(lifePathRaw ?? 0),
    destiny:     Number(destinyRaw ?? 0),
    soul:        Number(soulRaw ?? 0),
    personality: Number(personalityRaw ?? 0),
    birthday:    Number(birthdayRaw ?? 0),
    name:        `${firstName} ${lastName}`.trim(),
    details:     { lifePathRaw, destinyRaw, soulRaw, personalityRaw, birthdayRaw },
    raw:         {},
  };
}
