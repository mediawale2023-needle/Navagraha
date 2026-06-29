/**
 * Mahavidya mapping for the Kamakhya-Tantric (Shakta) reading.
 *
 * IMPORTANT: unlike Vimshottari dasha or the Char Karaka ranking, there is no
 * single universally-agreed classical algorithm mapping the 9 grahas + Lagna
 * to the 10 Mahavidyas — Shakta-tantric lineages differ. This module
 * implements ONE internally-consistent mapping (the 10 Mahavidyas in their
 * traditional Dasha-Mahavidya order, assigned to the 9 grahas + the Lagna)
 * so the feature has a deterministic, reproducible starting point. Treat this
 * as a documented heuristic to calibrate against your own Kamakhya/Shakta
 * lineage — not as settled scripture.
 */
import { SIGNS, signFromLon } from './vedic.js';
import type { CharKaraka } from './jaimini.js';

export interface MahavidyaMapping {
  primary: { graha: string; mahavidya: string; reasoning: string };
  lagna: { sign: string; mahavidya: string; reasoning: string };
  fullTable: Array<{ graha: string; mahavidya: string }>;
}

// Traditional Dasha-Mahavidya order: Kali, Tara, Tripura Sundari (Shodashi),
// Bhuvaneshwari, Chhinnamasta, Bhairavi, Dhumavati, Bagalamukhi, Matangi, Kamala.
const GRAHA_MAHAVIDYA: Record<string, string> = {
  Mars: 'Kali',              // fierce action, destruction, transformation
  Jupiter: 'Tara',           // wisdom, guidance, the guru-goddess who rescues
  Moon: 'Tripura Sundari (Shodashi)', // beauty, mind, the sixteen-phase moon
  Sun: 'Bhairavi',           // fierce solar power, tapas, fire
  Ketu: 'Chhinnamasta',      // self-severance, detachment, liberation
  Mercury: 'Matangi',        // intellect, speech, outcaste wisdom
  Saturn: 'Dhumavati',       // the widow goddess, asceticism, deprivation, karma
  Rahu: 'Bagalamukhi',       // paralysing (stambhana) power, obsession
  Venus: 'Kamala (Kamalatmika)', // lotus goddess of beauty, wealth, love
};
// The Lagna (ascendant sign, the body/vessel itself) takes the remaining
// Mahavidya, Bhuvaneshwari — the world-sovereign, ground of being.
const LAGNA_MAHAVIDYA = 'Bhuvaneshwari';

/**
 * Primary Mahavidya keyed off the Atmakaraka (the soul-significator is the
 * natural choice for "which Devi governs this incarnation's core sadhana").
 */
export function computeMahavidyaMapping(
  ascSiderealLon: number,
  charKarakas: CharKaraka[],
): MahavidyaMapping {
  const ak = charKarakas.find((k) => k.karaka === 'Atmakaraka')!;
  const primaryMahavidya = GRAHA_MAHAVIDYA[ak.planet] ?? 'Tripura Sundari (Shodashi)';
  const lagnaSign = signFromLon(ascSiderealLon);

  return {
    primary: {
      graha: ak.planet,
      mahavidya: primaryMahavidya,
      reasoning: `Atmakaraka (soul-significator) is ${ak.planet} — mapped to ${primaryMahavidya} in this lineage's graha-Mahavidya table.`,
    },
    lagna: {
      sign: lagnaSign,
      mahavidya: LAGNA_MAHAVIDYA,
      reasoning: `The Lagna (${lagnaSign}) — the embodying vessel itself — is mapped to ${LAGNA_MAHAVIDYA}, the ground-of-being Devi in this scheme.`,
    },
    fullTable: Object.entries(GRAHA_MAHAVIDYA).map(([graha, mahavidya]) => ({ graha, mahavidya })),
  };
}
