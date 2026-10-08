/**
 * Astro Engine Client
 * Bridges the Node.js Express server to the Rust astro-engine-rs microservice.
 * All Shadbala, Yoga, and Varga calculations happen in deterministic Rust — no LLM involved.
 */

const ASTRO_ENGINE_URL = process.env.ASTRO_ENGINE_URL || 'http://localhost:3001';

export interface PlanetInput {
  name: string;
  longitude: number;
  house: number;
  is_retrograde: boolean;
  sign: number;
  nakshatra_pada: number;
}

export interface ChartRequest {
  planets: PlanetInput[];
  ascendant_longitude: number;
  latitude: number;
  julian_day: number;
}

export interface ShadbalaPlanet {
  planet: string;
  sthana_bala: number;
  dig_bala: number;
  kaala_bala: number;
  chesta_bala: number;
  naisargika_bala: number;
  drik_bala: number;
  total_rupas: number;
  ishta_phala: number;
  kashta_phala: number;
}

export interface DetectedYoga {
  name: string;
  description: string;
  planets_involved: string[];
  strength_rupas: number;
  fires: boolean;
}

export interface VargaStrength {
  planet: string;
  is_vargottama: boolean;
  pushkar_navamsa: boolean;
  d1_sign: number;
  d9_sign: number;
  strength_score: number;
}

export interface AstroEngineResponse {
  shadbala: ShadbalaPlanet[];
  yogas: DetectedYoga[];
  varga_strengths: VargaStrength[];
  global_strength_score: number;
}

/** P0 fail-safe: /calculate has no coherent longitude convention today.
 * d9_sign consumes tropical longitude, but compares against sidereal D1 signs;
 * Pushkar instead subtracts a fixed 24°. No single payload frame fixes both.
 * Keep this disabled until the Rust contract is reconciled in a reviewed change.
 * No environment switch may bypass this guard.
 */
export const RUST_CHART_UNAVAILABLE_REASON =
  'Rust /calculate skipped: inconsistent tropical/sidereal Varga coordinate frames';

/** Retain the typed boundary, but never send a knowingly inconsistent chart. */
export async function callAstroEngine(_request: ChartRequest): Promise<AstroEngineResponse | null> {
  console.warn('[AstroEngine]', RUST_CHART_UNAVAILABLE_REASON);
  return null;
}

/**
 * Health check — returns true if the Rust engine is reachable
 */
export async function isAstroEngineHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${ASTRO_ENGINE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Build a Shadbala-aware summary string for the LLM Jyotishi synthesizer.
 * This function formats the raw deterministic Rust output into a prompt-ready block.
 */
export function formatShadbalaSummary(data: AstroEngineResponse): string {
  const lines: string[] = [
    `## Deterministic Vedic Math Analysis (Shadbala Engine v1)\n`,
    `Global Strength Score: ${data.global_strength_score.toFixed(2)} Rupas\n`,
    `\n### Planetary Shadbala (6-Component Strength):`,
  ];

  for (const p of data.shadbala) {
    const status = p.total_rupas >= 6.0 ? '🟢 Strong' : p.total_rupas >= 4.0 ? '🟡 Moderate' : '🔴 Weak';
    lines.push(
      `- **${p.planet}**: ${p.total_rupas} Rupas ${status} | Ishta: ${p.ishta_phala} | Kashta: ${p.kashta_phala}`
    );
  }

  lines.push(`\n### Active Yogas (Shadbala-Validated):`);
  const firingYogas = data.yogas.filter(y => y.fires);
  const dormantYogas = data.yogas.filter(y => !y.fires);

  if (firingYogas.length === 0) {
    lines.push('- No major Yogas fire at current planetary strength levels.');
  } else {
    for (const y of firingYogas) {
      lines.push(`- ✅ **${y.name}** (${y.strength_rupas.toFixed(2)} Rupas): ${y.description}`);
    }
  }

  if (dormantYogas.length > 0) {
    lines.push(`\n### Dormant Yogas (planet too weak to activate):`);
    for (const y of dormantYogas) {
      lines.push(`- ⚠️ **${y.name}** (${y.strength_rupas.toFixed(2)} Rupas — below threshold)`);
    }
  }

  lines.push(`\n### Varga Strengths (D1 + D9 Consistency):`);
  for (const v of data.varga_strengths) {
    const tags = [];
    if (v.is_vargottama) tags.push('Vargottama');
    if (v.pushkar_navamsa) tags.push('Pushkar Navamsa');
    const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
    lines.push(`- **${v.planet}**: Score ${v.strength_score.toFixed(0)}/100${tagStr}`);
  }

  return lines.join('\n');
}

// ─── Sprint 3: Prashna, Synastry, Remediation ────────────────────────────────

export interface SynastryRequest {
  person_a_nakshatra: number;
  person_a_moon_sign: number;
  person_b_nakshatra: number;
  person_b_moon_sign: number;
  person_a_mars_house?: number;
  person_b_mars_house?: number;
}

export interface SynastryResponse {
  total_score: number;
  total_max: number;
  compatibility_grade: string;
  compatibility_percentage: number;
  mangal_dosha: { is_cancelled: boolean; severity: string; guidance: string };
  key_strengths: string[];
  key_challenges: string[];
  koota_scores: any[];
  relationship_windows: string[];
}

export async function callSynastryEngine(request: SynastryRequest): Promise<SynastryResponse | null> {
  try {
    const res = await fetch(`${ASTRO_ENGINE_URL}/synastry`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request), signal: AbortSignal.timeout(10000),
    });
    return res.ok ? await res.json() : null;
  } catch (err) {
    console.error('[AstroEngine] Synastry Request Failed:', err);
    return null;
  }
}

export interface RemediationRequestPlanet {
  planet: string;
  total_rupas: number;
  is_retrograde: boolean;
  nakshatra_pada: number;
  house: number;
}

export interface FullRemediationResponse {
  remediations: any[];
  priority_order: string[];
  overall_guidance: string;
}

export async function callRemediationEngine(planets: RemediationRequestPlanet[]): Promise<FullRemediationResponse | null> {
  try {
    const res = await fetch(`${ASTRO_ENGINE_URL}/remediation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planets }), signal: AbortSignal.timeout(10000),
    });
    return res.ok ? await res.json() : null;
  } catch (err) {
    console.error('[AstroEngine] Remediation Request Failed:', err);
    return null;
  }
}
