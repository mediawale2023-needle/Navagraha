// ─── Varga (Divisional Chart) Calculations ───────────────────────────────────
//
// Calculates D9 (Navamsa) sign for Vargottama detection and Pushkar Navamsa.

use crate::types::{PlanetInput, VargaStrength};

/// Return the Navamsa (D9) sign (1-12) for a given tropical longitude.
/// Each sign is split into 9 equal parts of 3°20' = 200'.
/// The first pada of Aries Navamsa starts at 0° Aries.
pub fn d9_sign(longitude: f64) -> u8 {
    let total_padas: u16 = (longitude / (30.0 / 9.0)) as u16; // total 3°20' slices
    let navamsa_sign = (total_padas % 12) as u8 + 1;
    navamsa_sign
}

/// Pushkar Navamsa padas — specific Navamsa positions considered supremely benefic.
/// These are the 22nd and 28th Navamsa of each sign (Parashari rule).
/// We use a simplified list of the most widely agreed upon Pushkar Navamsa positions.
const PUSHKAR_NAVAMSA_LONGITUDES: &[(f64, f64)] = &[
    (14.0, 17.333),   // Aries: 14°–17°20'
    (44.0, 47.333),   // Taurus: 14°–17°20'
    (74.0, 77.333),   // Gemini: 14°–17°20'
    (104.0, 107.333),
    (134.0, 137.333),
    (164.0, 167.333),
    (194.0, 197.333),
    (224.0, 227.333),
    (254.0, 257.333),
    (284.0, 287.333),
    (314.0, 317.333),
    (344.0, 347.333),
];

pub fn is_pushkar_navamsa(longitude: f64) -> bool {
    // Map into sidereal (approx Lahiri ayanamsa 24°)
    let sid_lon = (longitude - 24.0).rem_euclid(360.0);
    PUSHKAR_NAVAMSA_LONGITUDES
        .iter()
        .any(|&(start, end)| sid_lon >= start && sid_lon < end)
}

pub fn calculate_varga_strengths(planets: &[PlanetInput]) -> Vec<VargaStrength> {
    planets
        .iter()
        .map(|p| {
            let d9 = d9_sign(p.longitude);
            let is_vargottama = p.sign == d9;
            let pushkar = is_pushkar_navamsa(p.longitude);

            // Composite score: +40 for Vargottama, +30 for Pushkar, base 30
            let mut score = 30.0_f64;
            if is_vargottama { score += 40.0; }
            if pushkar { score += 30.0; }

            VargaStrength {
                planet: p.name.clone(),
                is_vargottama,
                pushkar_navamsa: pushkar,
                d1_sign: p.sign,
                d9_sign: d9,
                strength_score: score.min(100.0),
            }
        })
        .collect()
}
