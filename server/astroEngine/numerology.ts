/**
 * Numerology Calculator
 *
 * Implements the Pythagorean system (most common in Western numerology,
 * widely used in Indian apps as well).
 *
 * Numbers: Life Path, Destiny (Expression), Soul Urge, Personality, Birthday
 */

// ─── Letter-to-Number Tables ──────────────────────────────────────────────────

// Pythagorean assignment: A=1 B=2 C=3 D=4 E=5 F=6 G=7 H=8 I=9 ...
const PYTHAGOREAN: Record<string, number> = {
  a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9,
  j: 1, k: 2, l: 3, m: 4, n: 5, o: 6, p: 7, q: 8, r: 9,
  s: 1, t: 2, u: 3, v: 4, w: 5, x: 6, y: 7, z: 8,
};

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

// ─── Core Reduction ───────────────────────────────────────────────────────────

/**
 * Reduce a number to a single digit (1–9) or master numbers (11, 22, 33).
 */
export function reduce(n: number): number {
  if (n === 11 || n === 22 || n === 33) return n;
  if (n <= 9) return n;
  const sum = String(n)
    .split('')
    .reduce((acc, d) => acc + parseInt(d, 10), 0);
  return reduce(sum);
}

/** Sum all digits of a number without reducing (used to build intermediate sums) */
function digitSum(n: number): number {
  return String(Math.abs(n))
    .split('')
    .reduce((acc, d) => acc + parseInt(d, 10), 0);
}

// ─── Life Path Number ─────────────────────────────────────────────────────────

/**
 * Life Path Number — calculated from the full date of birth.
 * Each component (day, month, year) is reduced separately, then summed.
 */
export function lifePathNumber(dateOfBirth: Date): number {
  const day   = dateOfBirth.getUTCDate();
  const month = dateOfBirth.getUTCMonth() + 1;
  const year  = dateOfBirth.getUTCFullYear();

  const d = reduce(digitSum(day));
  const m = reduce(digitSum(month));
  const y = reduce(digitSum(year));

  return reduce(d + m + y);
}

// ─── Destiny (Expression) Number ─────────────────────────────────────────────

/**
 * Destiny Number — sum of all letters in the full name.
 */
export function destinyNumber(fullName: string): number {
  const sum = fullName
    .toLowerCase()
    .split('')
    .reduce((acc, ch) => acc + (PYTHAGOREAN[ch] ?? 0), 0);
  return reduce(sum);
}

// ─── Soul Urge (Heart's Desire) Number ───────────────────────────────────────

/**
 * Soul Urge Number — sum of only the vowels in the full name.
 */
export function soulUrgeNumber(fullName: string): number {
  const sum = fullName
    .toLowerCase()
    .split('')
    .filter(ch => VOWELS.has(ch))
    .reduce((acc, ch) => acc + (PYTHAGOREAN[ch] ?? 0), 0);
  return reduce(sum);
}

// ─── Personality Number ───────────────────────────────────────────────────────

/**
 * Personality Number — sum of only the consonants in the full name.
 */
export function personalityNumber(fullName: string): number {
  const sum = fullName
    .toLowerCase()
    .split('')
    .filter(ch => PYTHAGOREAN[ch] != null && !VOWELS.has(ch))
    .reduce((acc, ch) => acc + (PYTHAGOREAN[ch] ?? 0), 0);
  return reduce(sum);
}

// ─── Birthday Number ──────────────────────────────────────────────────────────

/**
 * Birthday Number — the day of birth reduced to a single digit.
 */
export function birthdayNumber(dateOfBirth: Date): number {
  return reduce(dateOfBirth.getUTCDate());
}

// ─── All Numbers Bundle ───────────────────────────────────────────────────────

export interface NumerologyResult {
  lifePath:    number;
  destiny:     number;
  soul:        number;
  personality: number;
  birthday:    number;
  name:        string;
  details: {
    lifePathMeaning:    string;
    destinyMeaning:     string;
    soulMeaning:        string;
    personalityMeaning: string;
  };
}

export function calculateNumerology(
  dateOfBirth: Date,
  firstName: string,
  lastName = '',
): NumerologyResult {
  const fullName = `${firstName} ${lastName}`.trim();

  const lp   = lifePathNumber(dateOfBirth);
  const dest = destinyNumber(fullName);
  const soul = soulUrgeNumber(fullName);
  const pers = personalityNumber(fullName);
  const bday = birthdayNumber(dateOfBirth);

  return {
    lifePath:    lp,
    destiny:     dest,
    soul,
    personality: pers,
    birthday:    bday,
    name:        fullName,
    details: {
      lifePathMeaning:    NUMBER_MEANINGS[lp]?.lifePath    ?? '',
      destinyMeaning:     NUMBER_MEANINGS[dest]?.destiny   ?? '',
      soulMeaning:        NUMBER_MEANINGS[soul]?.soul      ?? '',
      personalityMeaning: NUMBER_MEANINGS[pers]?.personality ?? '',
    },
  };
}

// ─── Number Meanings ──────────────────────────────────────────────────────────

const NUMBER_MEANINGS: Record<number, { lifePath: string; destiny: string; soul: string; personality: string }> = {
  1: {
    lifePath:    'The Leader — natural-born leader with strong willpower and ambition.',
    destiny:     'You are destined to be an independent pioneer and innovator.',
    soul:        'Your deepest desire is to achieve and lead independently.',
    personality: 'You appear confident, assertive, and self-reliant.',
  },
  2: {
    lifePath:    'The Diplomat — sensitive, cooperative, and a born peacemaker.',
    destiny:     'Your destiny is to bring harmony and cooperation to others.',
    soul:        'You yearn for love, partnership, and a peaceful environment.',
    personality: 'You appear gentle, patient, and tactful.',
  },
  3: {
    lifePath:    'The Communicator — creative, expressive, and optimistic.',
    destiny:     'You are destined to inspire others through creativity and communication.',
    soul:        'You deeply desire to express yourself and spread joy.',
    personality: 'You appear charming, enthusiastic, and socially gifted.',
  },
  4: {
    lifePath:    'The Builder — practical, disciplined, and hardworking.',
    destiny:     'You are destined to build a solid foundation through steady effort.',
    soul:        'You crave security, order, and stability.',
    personality: 'You appear reliable, organized, and trustworthy.',
  },
  5: {
    lifePath:    'The Explorer — adventurous, versatile, and freedom-loving.',
    destiny:     'You are destined to experience life through freedom and variety.',
    soul:        'You deeply desire freedom, adventure, and sensory experience.',
    personality: 'You appear dynamic, resourceful, and charismatic.',
  },
  6: {
    lifePath:    'The Nurturer — responsible, loving, and service-oriented.',
    destiny:     'You are destined to serve and heal your family and community.',
    soul:        'You yearn to love, protect, and care for others.',
    personality: 'You appear warm, nurturing, and dependable.',
  },
  7: {
    lifePath:    'The Seeker — introspective, analytical, and spiritually inclined.',
    destiny:     'You are destined to seek wisdom and uncover hidden truths.',
    soul:        'You crave solitude, knowledge, and spiritual understanding.',
    personality: 'You appear mysterious, thoughtful, and refined.',
  },
  8: {
    lifePath:    'The Achiever — ambitious, authoritative, and materially successful.',
    destiny:     'You are destined for material abundance and positions of power.',
    soul:        'You deeply desire power, achievement, and recognition.',
    personality: 'You appear strong-willed, executive, and goal-oriented.',
  },
  9: {
    lifePath:    'The Humanitarian — compassionate, generous, and idealistic.',
    destiny:     'You are destined to serve humanity on a grand, selfless scale.',
    soul:        'You yearn to make the world better and help all living beings.',
    personality: 'You appear compassionate, artistic, and universally-minded.',
  },
  11: {
    lifePath:    'The Inspirer (Master 11) — highly intuitive, visionary, and spiritually enlightened.',
    destiny:     'Your destiny is to illuminate and inspire others through spiritual insight.',
    soul:        'You desire to channel higher wisdom and uplift humanity.',
    personality: 'You appear idealistic, magnetic, and intensely sensitive.',
  },
  22: {
    lifePath:    'The Master Builder (22) — extraordinarily capable of turning dreams into reality.',
    destiny:     'You are destined to build lasting institutions that benefit humanity.',
    soul:        'You desire to create something of lasting value on a global scale.',
    personality: 'You appear confident, disciplined, and powerfully visionary.',
  },
  33: {
    lifePath:    'The Master Teacher (33) — the most evolved expression of compassion and teaching.',
    destiny:     'Your destiny is to guide, heal, and uplift at the highest spiritual level.',
    soul:        'You desire to embody unconditional love and share it universally.',
    personality: 'You appear deeply compassionate, nurturing, and spiritually radiant.',
  },
};
