/**
 * Launch feature gates. Everything here defaults OFF: each gate guards a
 * non-essential capability that is not yet verified to production standard.
 * Enable only after the verification noted beside it.
 */
const on = (name: string) => process.env[name] === 'true';

export const features = {
  /** Multi-agent council for "deep" questions (7 model calls). Off: deep questions use the guarded single explainer. */
  aiCouncil: () => on('FEATURE_AI_COUNCIL'),
  /** Jaimini Chara Dasha in professional prompts. Off until the calculation is checked against a reference implementation. */
  charaDasha: () => on('FEATURE_CHARA_DASHA'),
  /** Persist recalculated legacy charts (compare-and-swap, reversible). Off: legacy charts are recalculated on read only. */
  persistLegacyUpgrades: () => on('V3_PERSIST_LEGACY_UPGRADES'),
  /**
   * Astrologer marketplace: consultations (chat, voice/video), scheduling, live streams,
   * Pooja and Astromall. Off: hidden from users and closed server-side (server/marketplace.ts);
   * records and code are kept for when it returns. On only with the billing rebuild (audit A3).
   */
  marketplace: () => on('FEATURE_MARKETPLACE'),
};
