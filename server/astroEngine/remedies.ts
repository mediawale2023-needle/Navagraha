/**
 * Ascendant-specific remedies based on each planet's FUNCTIONAL nature for the
 * Lagna (trikona/kendra/dusthana lordship), not a generic symptom match.
 * Strengthen the Lagna lord, the Yogakaraka and weak functional benefics;
 * pacify functional malefics by donation rather than gemstones.
 */
import type { PlanetDignity } from './dignity.js';

const PLANETS7 = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
const GEM: Record<string, string> = { Sun: 'Ruby', Moon: 'Pearl', Mars: 'Red Coral', Mercury: 'Emerald', Jupiter: 'Yellow Sapphire', Venus: 'Diamond', Saturn: 'Blue Sapphire' };
const MANTRA: Record<string, { m: string; n: number }> = {
  Sun: { m: 'Om Hraam Hreem Hroum Sah Suryaya Namah', n: 7000 },
  Moon: { m: 'Om Shraam Shreem Shroum Sah Chandraya Namah', n: 11000 },
  Mars: { m: 'Om Kraam Kreem Kroum Sah Bhaumaya Namah', n: 10000 },
  Mercury: { m: 'Om Braam Breem Broum Sah Budhaya Namah', n: 9000 },
  Jupiter: { m: 'Om Graam Greem Groum Sah Gurave Namah', n: 19000 },
  Venus: { m: 'Om Draam Dreem Droum Sah Shukraya Namah', n: 16000 },
  Saturn: { m: 'Om Praam Preem Proum Sah Shanaischaraya Namah', n: 23000 },
};
const DAY: Record<string, string> = { Sun: 'Sunday', Moon: 'Monday', Mars: 'Tuesday', Mercury: 'Wednesday', Jupiter: 'Thursday', Venus: 'Friday', Saturn: 'Saturday' };
const DAAN: Record<string, string> = {
  Sun: 'wheat, jaggery or copper', Moon: 'rice, milk or silver', Mars: 'red lentils or copper',
  Mercury: 'green gram or green cloth', Jupiter: 'turmeric, gram dal or yellow items',
  Venus: 'white sweets, ghee or white cloth', Saturn: 'black sesame, mustard oil or black cloth',
};
const DEITY: Record<string, string> = {
  Sun: 'Surya / Shiva', Moon: 'Parvati / Shiva', Mars: 'Hanuman', Mercury: 'Vishnu / Ganesha',
  Jupiter: 'Brihaspati / Vishnu', Venus: 'Lakshmi', Saturn: 'Shani / Hanuman',
};

export interface Remedy {
  focus: string;
  action: 'Strengthen' | 'Pacify';
  gemstone?: string;
  mantra: string;
  japaCount: number;
  donation?: string;
  day: string;
  deity: string;
  reason: string;
}

export function computeRemedies(
  dignities: PlanetDignity[],
  houseLords: Array<{ house: number; lord: string; lordHouse: number }>,
  sadeSatiActive = false,
): Remedy[] {
  const lordsOwned: Record<string, number[]> = {};
  const planetHouse: Record<string, number> = {};
  for (const hl of houseLords) {
    (lordsOwned[hl.lord] ||= []).push(hl.house);
    planetHouse[hl.lord] = hl.lordHouse;
  }
  const dig: Record<string, PlanetDignity> = Object.fromEntries(dignities.map((d) => [d.planet, d]));
  const lagnaLord = houseLords.find((h) => h.house === 1)?.lord;

  const ownsAny = (p: string, hs: number[]) => (lordsOwned[p] || []).some((h) => hs.includes(h));
  const isTrikona = (p: string) => ownsAny(p, [1, 5, 9]);
  const isKendra = (p: string) => ownsAny(p, [4, 7, 10]);
  const isDusthana = (p: string) => ownsAny(p, [6, 8, 12]);
  const yogakaraka = PLANETS7.find((p) => isTrikona(p) && isKendra(p));

  const remedies: Remedy[] = [];
  const seen = new Set<string>();
  const add = (p: string, action: Remedy['action'], reason: string) => {
    if (!MANTRA[p] || seen.has(p)) return;
    seen.add(p);
    remedies.push({
      focus: p,
      action,
      gemstone: action === 'Strengthen' ? GEM[p] : undefined,
      mantra: MANTRA[p].m,
      japaCount: MANTRA[p].n,
      donation: action === 'Pacify' ? DAAN[p] : undefined,
      day: DAY[p],
      deity: DEITY[p],
      reason,
    });
  };

  if (lagnaLord) add(lagnaLord, 'Strengthen', `${lagnaLord} is your Ascendant lord — strengthening it supports overall vitality and life direction.`);
  if (yogakaraka) add(yogakaraka, 'Strengthen', `${yogakaraka} is the Yogakaraka for your ascendant (owns a kendra and a trikona) — its gemstone is especially auspicious.`);

  for (const p of PLANETS7) {
    if (isTrikona(p) && !isDusthana(p)) {
      const d = dig[p];
      const weak = d && (d.dignity === 'Debilitated' || d.combust || [6, 8, 12].includes(planetHouse[p]));
      if (weak) add(p, 'Strengthen', `${p} is a functional benefic for you but currently weak (${d.dignity}${d.combust ? ', combust' : ''}) — strengthen it.`);
    }
  }

  if (sadeSatiActive) add('Saturn', 'Pacify', 'Saturn is in Sade Sati — pacification eases hardship and delay.');

  for (const p of PLANETS7) {
    if (isDusthana(p) && !isTrikona(p)) {
      add(p, 'Pacify', `${p} rules a dusthana (6/8/12) for your ascendant — pacify by donation; avoid wearing its gemstone.`);
    }
  }

  return remedies.slice(0, 6);
}

// ─── Gemstone contraindications ──────────────────────────────────────────────
// Widely-cited classical cautions that do NOT reduce to "is this planet a
// functional malefic" (computeRemedies() above already reasons about that via
// isDusthana()). These are independent red-flags to check before recommending
// ANY gemstone — advisory caution flags, not absolute prohibitions. Always
// weigh against the rest of the chart and the client's own history with a
// stone before acting on these.
const GEM9: Record<string, string> = { ...GEM, Rahu: 'Hessonite (Gomed)', Ketu: "Cat's Eye (Lehsunia)" };

export interface GemstoneContraindication {
  planet: string;
  gemstone: string;
  severity: 'avoid' | 'caution';
  reason: string;
}

export function checkGemstoneContraindications(
  ascSignIndex: number, // 0=Aries..11=Pisces
  sidereal: Record<string, number>,
  dignities: PlanetDignity[],
): GemstoneContraindication[] {
  const flags: GemstoneContraindication[] = [];
  const dig: Record<string, PlanetDignity> = Object.fromEntries(dignities.map((d) => [d.planet, d]));
  const signOf = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30);
  const houseOf = (lon: number) => ((signOf(lon) - ascSignIndex + 12) % 12) + 1;

  // Ruby (Sun) — Capricorn/Aquarius ascendants: Sun is not a natural friend to
  // this Lagna regardless of dignity; default-prescribing Ruby here is a common
  // mistake.
  if (ascSignIndex === 9 || ascSignIndex === 10) {
    flags.push({ planet: 'Sun', gemstone: GEM9['Sun'], severity: 'caution',
      reason: 'Capricorn/Aquarius ascendant — Sun is not a natural friend to this Lagna; only prescribe Ruby after confirming Sun is genuinely the weak link, not by default.' });
  }

  // Blue Sapphire (Saturn) — famously fast-acting in either direction; a
  // test-wear period is standard practice no matter how favourably Saturn
  // otherwise reads.
  flags.push({ planet: 'Saturn', gemstone: GEM9['Saturn'], severity: 'caution',
    reason: 'Blue Sapphire acts unusually fast and strongly — always recommend a 3–7 day test-wear before committing, even when Saturn is otherwise indicated as a Strengthen focus.' });

  // Red Coral (Mars) — combustion removes Mars's stability; the stone would
  // amplify raw heat/aggression rather than restore strength.
  if (dig['Mars']?.combust) {
    flags.push({ planet: 'Mars', gemstone: GEM9['Mars'], severity: 'avoid',
      reason: 'Mars is combust — Red Coral would amplify heat/aggression without the stability combustion has stripped away; pacify by donation instead of wearing the stone.' });
  }

  // Hessonite/Gomed (Rahu) — Rahu in the 12th (loss/isolation/foreign land) is
  // widely cautioned, since the stone can intensify escapism rather than
  // ground Rahu's energy.
  const rahuLon = sidereal['Rahu'];
  if (rahuLon != null && houseOf(rahuLon) === 12) {
    flags.push({ planet: 'Rahu', gemstone: GEM9['Rahu'], severity: 'avoid',
      reason: 'Rahu in the 12th house — Gomed is widely cautioned here as it can intensify isolation/escapism instead of grounding Rahu; prefer donation-based pacification.' });
  }

  // Cat's Eye (Ketu) — Ketu conjunct Moon in a kendra can have its detachment
  // sharpened into mental instability by the stone.
  const ketuLon = sidereal['Ketu'];
  const moonLon = sidereal['Moon'];
  if (ketuLon != null && moonLon != null && [1, 4, 7, 10].includes(houseOf(ketuLon)) && signOf(ketuLon) === signOf(moonLon)) {
    flags.push({ planet: 'Ketu', gemstone: GEM9['Ketu'], severity: 'avoid',
      reason: "Ketu conjunct Moon in a kendra — Cat's Eye can sharpen Ketu's detachment into mental instability here; avoid wearing without close supervision." });
  }

  // Emerald (Mercury) — debilitated AND afflicted by Mars/Saturn: the stone
  // would over-stimulate an already unsteady nervous/communicative faculty.
  const mercLon = sidereal['Mercury'];
  if (dig['Mercury']?.dignity === 'Debilitated' && mercLon != null) {
    const mercSign = signOf(mercLon);
    const marsSign = sidereal['Mars'] != null ? signOf(sidereal['Mars']) : -1;
    const satSign = sidereal['Saturn'] != null ? signOf(sidereal['Saturn']) : -1;
    if (mercSign === marsSign || mercSign === satSign) {
      flags.push({ planet: 'Mercury', gemstone: GEM9['Mercury'], severity: 'avoid',
        reason: 'Mercury debilitated and afflicted by Mars/Saturn — Emerald can over-stimulate an already unsteady mind/nerves; pacify rather than strengthen until the affliction eases.' });
    }
  }

  return flags;
}
