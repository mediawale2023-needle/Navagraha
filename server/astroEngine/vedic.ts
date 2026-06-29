/**
 * Vedic astrology lookup data and utilities.
 *
 * Covers: zodiac signs (rashis), nakshatras, planetary lords,
 * house assignment, remedies, and sign/planet classifications.
 */

// ─── Zodiac Signs (Rashis) ────────────────────────────────────────────────────

export const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer',
  'Leo', 'Virgo', 'Libra', 'Scorpio',
  'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

export type Sign = typeof SIGNS[number];

/** Lord (ruling planet) of each sign */
export const SIGN_LORDS: Record<Sign, string> = {
  Aries: 'Mars',       Taurus: 'Venus',    Gemini: 'Mercury',  Cancer: 'Moon',
  Leo: 'Sun',          Virgo: 'Mercury',   Libra: 'Venus',     Scorpio: 'Mars',
  Sagittarius: 'Jupiter', Capricorn: 'Saturn', Aquarius: 'Saturn', Pisces: 'Jupiter',
};

/** Varna (caste) of each sign — used in Ashtakoot matching */
export const SIGN_VARNA: Record<Sign, number> = {
  // 1=Shudra (Air), 2=Vaishya (Earth), 3=Kshatriya (Fire), 4=Brahmin (Water)
  Aries: 3,       Taurus: 2,      Gemini: 1,      Cancer: 4,
  Leo: 3,         Virgo: 2,       Libra: 1,       Scorpio: 4,
  Sagittarius: 3, Capricorn: 2,   Aquarius: 1,    Pisces: 4,
};

/** Gana (temperament) of each sign */
export const SIGN_GANA: Record<Sign, string> = {
  Aries: 'Deva',      Taurus: 'Manushya', Gemini: 'Deva',     Cancer: 'Deva',
  Leo: 'Deva',        Virgo: 'Manushya',  Libra: 'Deva',      Scorpio: 'Rakshasa',
  Sagittarius: 'Deva', Capricorn: 'Rakshasa', Aquarius: 'Deva', Pisces: 'Deva',
};

/** Element of each sign */
export const SIGN_ELEMENT: Record<Sign, string> = {
  Aries: 'Fire',   Taurus: 'Earth', Gemini: 'Air',   Cancer: 'Water',
  Leo: 'Fire',     Virgo: 'Earth',  Libra: 'Air',    Scorpio: 'Water',
  Sagittarius: 'Fire', Capricorn: 'Earth', Aquarius: 'Air', Pisces: 'Water',
};

/** Get zodiac sign name from sidereal longitude */
export function signFromLon(lon: number): Sign {
  return SIGNS[Math.floor(((lon % 360) + 360) % 360 / 30)];
}

/** Get degree within the sign (0–29.99°) */
export function degreeInSign(lon: number): number {
  return ((lon % 30) + 30) % 30;
}

/**
 * Navamsa (D9) sign index (0=Aries…11=Pisces) for a sidereal longitude.
 * Parashari: a sign's 9 navamsas begin from a sign set by its element —
 * fire→Aries, earth→Capricorn, air→Libra, water→Cancer.
 */
export function navamsaSign(lon: number): number {
  const l = ((lon % 360) + 360) % 360;
  const signIdx = Math.floor(l / 30) % 12;
  const within = Math.min(8, Math.floor((l % 30) / (30 / 9))); // 0..8
  const start = [0, 9, 6, 3][signIdx % 4]; // fire, earth, air, water
  return (start + within) % 12;
}

/** Degree within the navamsa sub-division, scaled to 0–30°. */
export function navamsaDegree(lon: number): number {
  const l = ((lon % 360) + 360) % 360;
  return ((l % (30 / 9)) / (30 / 9)) * 30;
}

/**
 * Dasamsa (D10) sign index — career & profession. Each 3° amsa; odd signs count
 * from the sign itself, even signs from the 9th sign from it.
 */
export function dasamsaSign(lon: number): number {
  const l = ((lon % 360) + 360) % 360;
  const signIdx = Math.floor(l / 30) % 12;
  const k = Math.min(9, Math.floor((l % 30) / 3)); // 0..9
  const oddSign = signIdx % 2 === 0; // index 0 (Aries) = 1st sign = odd
  const start = oddSign ? signIdx : (signIdx + 8) % 12;
  return (start + k) % 12;
}

/**
 * Shashtiamsa (D60) sign index — past-life karma; the finest division and the
 * most birth-time sensitive (each amsa is 0.5° ≈ 2 minutes of birth time).
 */
export function shashtiamsaSign(lon: number): number {
  const l = ((lon % 360) + 360) % 360;
  const signIdx = Math.floor(l / 30) % 12;
  const deg = l % 30;
  return (signIdx + Math.floor(deg * 2)) % 12;
}

// ─── Nakshatras ───────────────────────────────────────────────────────────────

export interface NakshatraData {
  name: string;
  lord: string;   // Vimshottari dasha ruler
  years: number;  // Dasha duration in years
  gana: string;   // Deva / Manushya / Rakshasa
  yoni: string;   // Animal symbol
  gender: string; // M / F
  deity: string;  // Presiding (adhi-devata) deity, BPHS
  shakti: string; // The nakshatra's special power (shakti)
}

export const NAKSHATRAS: NakshatraData[] = [
  { name: 'Ashwini',              lord: 'Ketu',    years: 7,  gana: 'Deva',      yoni: 'Horse',    gender: 'M', deity: 'Ashwini Kumaras (divine physician-twins)', shakti: 'Shilpa Kriya Shakti — power to reach/heal quickly' },
  { name: 'Bharani',              lord: 'Venus',   years: 20, gana: 'Manushya',  yoni: 'Elephant', gender: 'M', deity: 'Yama (god of death/dharma)',               shakti: 'Apabharani Shakti — power to take things away, to remove' },
  { name: 'Krittika',             lord: 'Sun',     years: 6,  gana: 'Rakshasa',  yoni: 'Sheep',    gender: 'F', deity: 'Agni (fire god)',                          shakti: 'Dahana Shakti — power to burn, purify and cut through' },
  { name: 'Rohini',               lord: 'Moon',    years: 10, gana: 'Manushya',  yoni: 'Serpent',  gender: 'M', deity: 'Brahma / Prajapati (creator)',             shakti: 'Rohana Shakti — power of growth, fertility, ascent' },
  { name: 'Mrigashira',           lord: 'Mars',    years: 7,  gana: 'Deva',      yoni: 'Serpent',  gender: 'F', deity: 'Soma / Chandra (moon god)',                shakti: 'Prinana Shakti — power to fulfil desires, give satisfaction' },
  { name: 'Ardra',                lord: 'Rahu',    years: 18, gana: 'Manushya',  yoni: 'Dog',      gender: 'F', deity: 'Rudra (storm/destruction)',                shakti: 'Yatna Shakti — power to gain through effort and struggle' },
  { name: 'Punarvasu',            lord: 'Jupiter', years: 16, gana: 'Deva',      yoni: 'Cat',      gender: 'M', deity: 'Aditi (mother of the gods)',               shakti: 'Vasutva Shakti — power to gain wealth, abundance, renewal' },
  { name: 'Pushya',               lord: 'Saturn',  years: 19, gana: 'Deva',      yoni: 'Sheep',    gender: 'M', deity: 'Brihaspati (guru of the gods)',            shakti: 'Brahmavarchasya Shakti — power to create spiritual energy' },
  { name: 'Ashlesha',             lord: 'Mercury', years: 17, gana: 'Rakshasa',  yoni: 'Cat',      gender: 'F', deity: 'Nagas (serpent deities)',                  shakti: 'Visasleshana Shakti — power to poison, entwine, inject venom' },
  { name: 'Magha',                lord: 'Ketu',    years: 7,  gana: 'Rakshasa',  yoni: 'Rat',      gender: 'F', deity: 'Pitris (ancestral spirits)',               shakti: 'Tyagaya Shakti — power to leave the body for the ancestors' },
  { name: 'Purva Phalguni',       lord: 'Venus',   years: 20, gana: 'Manushya',  yoni: 'Rat',      gender: 'F', deity: 'Bhaga (god of fortune/marital bliss)',     shakti: 'Prajanana Shakti — power of procreation, pleasure' },
  { name: 'Uttara Phalguni',      lord: 'Sun',     years: 6,  gana: 'Manushya',  yoni: 'Cow',      gender: 'M', deity: 'Aryaman (god of contracts/unions)',        shakti: 'Chayani Shakti — power of prosperity through alliance' },
  { name: 'Hasta',                lord: 'Moon',    years: 10, gana: 'Deva',      yoni: 'Buffalo',  gender: 'M', deity: 'Savitar (the sun as creative force)',      shakti: 'Hasta Sthairya Shakti — power to gain what is sought by hand/skill' },
  { name: 'Chitra',               lord: 'Mars',    years: 7,  gana: 'Rakshasa',  yoni: 'Tiger',    gender: 'F', deity: 'Tvashtar / Vishwakarma (divine architect)', shakti: 'Punya Chayani Shakti — power to accumulate merit, create brilliance' },
  { name: 'Swati',                lord: 'Rahu',    years: 18, gana: 'Deva',      yoni: 'Buffalo',  gender: 'F', deity: 'Vayu (wind god)',                          shakti: 'Pradhvansa Shakti — power to scatter, move independently like wind' },
  { name: 'Vishakha',             lord: 'Jupiter', years: 16, gana: 'Rakshasa',  yoni: 'Tiger',    gender: 'F', deity: 'Indra-Agni (twin deities)',                shakti: 'Vyapani Shakti — power to achieve many fruits, to reach broadly' },
  { name: 'Anuradha',             lord: 'Saturn',  years: 19, gana: 'Deva',      yoni: 'Rabbit',   gender: 'M', deity: 'Mitra (god of friendship/contracts)',      shakti: 'Radhana Shakti — power of worship, devotion, success through cooperation' },
  { name: 'Jyeshtha',             lord: 'Mercury', years: 17, gana: 'Rakshasa',  yoni: 'Rabbit',   gender: 'F', deity: 'Indra (king of the gods)',                 shakti: 'Arohana Shakti — power of courage, seniority, rising to the top' },
  { name: 'Mula',                 lord: 'Ketu',    years: 7,  gana: 'Rakshasa',  yoni: 'Dog',      gender: 'M', deity: 'Nirriti / Alakshmi (goddess of dissolution)', shakti: 'Barhana Shakti — power to destroy, uproot, and renew' },
  { name: 'Purva Ashadha',        lord: 'Venus',   years: 20, gana: 'Manushya',  yoni: 'Monkey',   gender: 'M', deity: 'Apas (the cosmic waters)',                 shakti: 'Apyayana Shakti — power of early/invigorating victory' },
  { name: 'Uttara Ashadha',       lord: 'Sun',     years: 6,  gana: 'Manushya',  yoni: 'Mongoose', gender: 'F', deity: 'Vishvedevas (the universal gods)',         shakti: 'Apratighata Shakti — power of permanent, unobstructed victory' },
  { name: 'Shravana',             lord: 'Moon',    years: 10, gana: 'Deva',      yoni: 'Monkey',   gender: 'M', deity: 'Vishnu (the preserver)',                   shakti: 'Samhanana Shakti — power to connect, to hear and learn' },
  { name: 'Dhanishtha',           lord: 'Mars',    years: 7,  gana: 'Rakshasa',  yoni: 'Lion',     gender: 'F', deity: 'The Eight Vasus (gods of abundance)',      shakti: 'Khyapaya Shakti — power of abundance, fame, recognition' },
  { name: 'Shatabhisha',          lord: 'Rahu',    years: 18, gana: 'Rakshasa',  yoni: 'Horse',    gender: 'M', deity: 'Varuna (god of cosmic/oceanic order)',     shakti: 'Bheshaja Shakti — power of healing' },
  { name: 'Purva Bhadrapada',     lord: 'Jupiter', years: 16, gana: 'Manushya',  yoni: 'Lion',     gender: 'M', deity: 'Aja Ekapada (one-footed serpent/Rudra form)', shakti: 'Yamana Shakti — power to bring intense, transformative results' },
  { name: 'Uttara Bhadrapada',    lord: 'Saturn',  years: 19, gana: 'Manushya',  yoni: 'Cow',      gender: 'F', deity: 'Ahir Budhanya (serpent of the deep)',      shakti: 'Varshodyamana Shakti — power to bring cosmic/nourishing rain' },
  { name: 'Revati',               lord: 'Mercury', years: 17, gana: 'Deva',      yoni: 'Elephant', gender: 'F', deity: 'Pushan (nourisher, guardian of journeys)', shakti: 'Sampani Shakti — power of nourishment, safe passage' },
];

/** Each nakshatra spans 360°/27 ≈ 13.333° */
export const NAKSHATRA_SPAN = 360 / 27;

/** Get nakshatra index (0–26) from sidereal longitude */
export function nakshatraIndex(lon: number): number {
  const n = ((lon % 360) + 360) % 360;
  return Math.min(Math.floor(n / NAKSHATRA_SPAN), 26);
}

/** Get Nakshatra data from sidereal longitude */
export function nakshatraFromLon(lon: number): NakshatraData {
  return NAKSHATRAS[nakshatraIndex(lon)];
}

/** Get pada (quarter 1–4) within a nakshatra */
export function nakshatraPada(lon: number): number {
  const n = ((lon % 360) + 360) % 360;
  const posInNak = n % NAKSHATRA_SPAN;
  return Math.floor(posInNak / (NAKSHATRA_SPAN / 4)) + 1;
}

// ─── House System (Whole Sign / Sāmya Bhava) ─────────────────────────────────

/**
 * Assign a house number (1–12) to a planet given its sidereal longitude
 * and the sidereal ascendant longitude.
 *
 * Uses Whole Sign houses (most common in traditional Jyotish):
 * The sign of the ascendant is the 1st house; each subsequent sign is the next house.
 */
export function houseFromLon(planetSiderealLon: number, ascSiderealLon: number): number {
  const ascSign = Math.floor(((ascSiderealLon % 360) + 360) % 360 / 30);
  const planetSign = Math.floor(((planetSiderealLon % 360) + 360) % 360 / 30);
  return ((planetSign - ascSign + 12) % 12) + 1;
}

/** Get the sidereal sign occupying a given house number */
export function signOfHouse(house: number, ascSiderealLon: number): Sign {
  const ascSignIdx = Math.floor(((ascSiderealLon % 360) + 360) % 360 / 30);
  const signIdx = (ascSignIdx + house - 1) % 12;
  return SIGNS[signIdx];
}

// ─── Remedies ─────────────────────────────────────────────────────────────────

const NAKSHATRA_GEMSTONE: Record<string, string> = {
  Ketu:    'Cat\'s Eye',
  Venus:   'Diamond',
  Sun:     'Ruby',
  Moon:    'Pearl',
  Mars:    'Red Coral',
  Rahu:    'Hessonite (Gomed)',
  Jupiter: 'Yellow Sapphire',
  Saturn:  'Blue Sapphire',
  Mercury: 'Emerald',
};

const NAKSHATRA_MANTRA: Record<string, string> = {
  Ketu:    'Om Ketave Namah — chant 108 times daily',
  Venus:   'Om Shukraya Namah — chant 108 times on Fridays',
  Sun:     'Om Suryaya Namah — chant 108 times at sunrise',
  Moon:    'Om Chandraya Namah — chant 108 times on Mondays',
  Mars:    'Om Mangalaya Namah — chant 108 times on Tuesdays',
  Rahu:    'Om Rahave Namah — chant 108 times on Saturdays',
  Jupiter: 'Om Gurave Namah — chant 108 times on Thursdays',
  Saturn:  'Om Shanaye Namah — chant 108 times on Saturdays',
  Mercury: 'Om Budhaya Namah — chant 108 times on Wednesdays',
};

const NAKSHATRA_CHARITY: Record<string, string> = {
  Ketu:    'Donate sesame seeds, blankets, or iron items',
  Venus:   'Donate white sweets, rice, or silk to young women',
  Sun:     'Donate wheat, jaggery, or copper on Sundays',
  Moon:    'Donate white rice, milk, or silver on Mondays',
  Mars:    'Donate red lentils, copper, or coral on Tuesdays',
  Rahu:    'Donate black sesame, mustard oil, or blankets',
  Jupiter: 'Donate yellow gram, turmeric, or gold on Thursdays',
  Saturn:  'Donate black sesame, iron, or oil on Saturdays',
  Mercury: 'Donate green gram, emerald, or bronze on Wednesdays',
};

const NAKSHATRA_FASTING: Record<string, string> = {
  Ketu:    'Fast on Tuesdays and Saturdays',
  Venus:   'Fast on Fridays',
  Sun:     'Fast on Sundays',
  Moon:    'Fast on Mondays',
  Mars:    'Fast on Tuesdays',
  Rahu:    'Fast on Saturdays',
  Jupiter: 'Fast on Thursdays',
  Saturn:  'Fast on Saturdays',
  Mercury: 'Fast on Wednesdays',
};

/** Get remedies for a nakshatra lord */
export function getRemedies(nakshatraLord: string): Array<{ title: string; description: string; type: string }> {
  return [
    { title: 'Gemstone',  description: NAKSHATRA_GEMSTONE[nakshatraLord]  ?? 'Consult an astrologer for your lucky gemstone',   type: 'gemstone' },
    { title: 'Mantra',    description: NAKSHATRA_MANTRA[nakshatraLord]    ?? 'Chant your nakshatra deity mantra 108 times daily', type: 'mantra'   },
    { title: 'Charity',   description: NAKSHATRA_CHARITY[nakshatraLord]   ?? 'Donate on the day ruled by your lagna lord',        type: 'charity'  },
    { title: 'Fasting',   description: NAKSHATRA_FASTING[nakshatraLord]   ?? 'Observe fast on your ruling planet\'s day',         type: 'fasting'  },
  ];
}
