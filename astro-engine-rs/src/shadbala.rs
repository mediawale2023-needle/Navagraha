// ─── Shadbala: The 6-Component Vedic Planetary Strength System ───────────────
//
// This is the single most important deterministic calculation in Jyotish.
// Without Shadbala Rupas, Yoga detection is unreliable.
//
// The 6 Balas:
//   1. Sthana Bala  — Sign placement (exalted, own, friend, neutral, enemy, debilitated)
//   2. Dig Bala     — Directional strength (strongest in specific house)
//   3. Kaala Bala   — Temporal strength (day/night, rising, hora etc.)
//   4. Chesta Bala  — Motional speed (fast = weak, slow = strong for outer planets)
//   5. Naisargika   — Natural hierarchy (fixed weights, Jupiter strongest)
//   6. Drik Bala    — Aspectual strength (simplified: benefic aspects boost, malefic drain)
//
// All components are in Virupas (1 Rupa = 60 Virupas). Final Rupas = Total / 60.

use crate::types::{ChartRequest, PlanetInput, ShadbalaPlanet};

// ─── Exaltation / Own / Debilitation Signs ────────────────────────────────────
// (sign numbers 1-12 = Aries-Pisces)

struct PlanetData {
    name: &'static str,
    exalt: u8,
    debilitate: u8,
    own_signs: &'static [u8],
    friend_signs: &'static [u8],
    enemy_signs: &'static [u8],
    dig_bala_house: u8, // House where planet gains maximum Dig Bala
    naisargika: f64,    // Fixed Naisargika Bala in Rupas
}

const PLANET_DATA: &[PlanetData] = &[
    PlanetData { name: "Sun",     exalt: 1,  debilitate: 7,  own_signs: &[5],     friend_signs: &[1,4,9,10,11], enemy_signs: &[7,8,12], dig_bala_house: 10, naisargika: 6.0 },
    PlanetData { name: "Moon",    exalt: 2,  debilitate: 8,  own_signs: &[4],     friend_signs: &[1,2,5],       enemy_signs: &[6,7,10], dig_bala_house: 4,  naisargika: 5.0 },
    PlanetData { name: "Mars",    exalt: 10, debilitate: 4,  own_signs: &[1,8],   friend_signs: &[5,9,10],      enemy_signs: &[2,3,4],  dig_bala_house: 10, naisargika: 2.0 },
    PlanetData { name: "Mercury", exalt: 6,  debilitate: 12, own_signs: &[3,6],   friend_signs: &[2,5,6,10],    enemy_signs: &[9,12],   dig_bala_house: 1,  naisargika: 3.0 },
    PlanetData { name: "Jupiter", exalt: 4,  debilitate: 10, own_signs: &[9,12],  friend_signs: &[1,2,5,10],    enemy_signs: &[3,6],    dig_bala_house: 1,  naisargika: 6.5 },
    PlanetData { name: "Venus",   exalt: 12, debilitate: 6,  own_signs: &[2,7],   friend_signs: &[1,4,8,12],    enemy_signs: &[5,9,10], dig_bala_house: 4,  naisargika: 4.0 },
    PlanetData { name: "Saturn",  exalt: 7,  debilitate: 1,  own_signs: &[10,11], friend_signs: &[2,3,6],       enemy_signs: &[1,4,5],  dig_bala_house: 7,  naisargika: 1.0 },
    PlanetData { name: "Rahu",    exalt: 2,  debilitate: 8,  own_signs: &[3,6],   friend_signs: &[2,7,10,11],   enemy_signs: &[1,5],    dig_bala_house: 3,  naisargika: 1.5 },
    PlanetData { name: "Ketu",    exalt: 8,  debilitate: 2,  own_signs: &[9,12],  friend_signs: &[4,5,8,12],    enemy_signs: &[1,6],    dig_bala_house: 9,  naisargika: 1.5 },
];

fn get_planet_data(name: &str) -> Option<&'static PlanetData> {
    PLANET_DATA.iter().find(|d| d.name == name)
}

// ─── 1. Sthana Bala (Sign Placement Strength) ─────────────────────────────────

fn sthana_bala(planet: &PlanetInput, data: &PlanetData) -> f64 {
    // Returns Virupas (max 60)
    if planet.sign == data.exalt {
        60.0
    } else if data.own_signs.contains(&planet.sign) {
        45.0
    } else if data.friend_signs.contains(&planet.sign) {
        30.0
    } else if data.enemy_signs.contains(&planet.sign) {
        15.0
    } else if planet.sign == data.debilitate {
        0.0
    } else {
        22.5 // Neutral sign
    }
}

// ─── 2. Dig Bala (Directional Strength) ───────────────────────────────────────

fn dig_bala(planet: &PlanetInput, data: &PlanetData) -> f64 {
    // Max in dig_bala_house, min in opposite house
    let diff = ((planet.house as i8 - data.dig_bala_house as i8 + 6).rem_euclid(12) - 6).abs();
    // 0 diff = 60, 6 diff = 0
    60.0 * (1.0 - diff as f64 / 6.0)
}

// ─── 3. Kaala Bala (Temporal Strength, simplified) ────────────────────────────

fn kaala_bala(planet: &PlanetInput, julian_day: f64) -> f64 {
    // Full Kaala Bala has many sub-components (Nathonnata, Paksha, Tribhaga, Abda, etc.)
    // Here we implement the two most impactful: Paksha Bala and day/night Bala.

    // Paksha Bala: Moon's phase. JD fractional part indicates time of day.
    // We use a simplified approximation.
    let lunar_phase = (julian_day * 13.176) % 360.0; // rough Moon phase angle
    let paksha = match planet.name.as_str() {
        "Sun" | "Mars" | "Saturn" => {
            // Malefics are stronger in Krishna Paksha (waning, 180-360)
            if lunar_phase > 180.0 { 40.0 } else { 20.0 }
        }
        _ => {
            // Benefics stronger in Shukla Paksha (waxing, 0-180)
            if lunar_phase <= 180.0 { 40.0 } else { 20.0 }
        }
    };

    // Day/night strength
    let hora = (julian_day.fract() * 24.0) as u8;
    let is_day = hora >= 6 && hora < 18;
    let diurnal = match planet.name.as_str() {
        "Sun" | "Jupiter" | "Saturn" => if is_day { 20.0 } else { 0.0 },
        "Moon" | "Venus" | "Mars" => if !is_day { 20.0 } else { 0.0 },
        _ => 10.0, // Mercury is strong in both
    };

    paksha + diurnal
}

// ─── 4. Chesta Bala (Motional Speed Strength) ─────────────────────────────────

fn chesta_bala(planet: &PlanetInput) -> f64 {
    // Retrograde outer planets are considered stronger (more active / Cheshta)
    // Fast-moving inner planets lose Chesta when too fast
    match planet.name.as_str() {
        "Saturn" | "Jupiter" | "Mars" | "Rahu" | "Ketu" => {
            if planet.is_retrograde { 60.0 } else { 30.0 }
        }
        "Sun" => 30.0, // Sun is never retrograde; fixed
        "Moon" => 40.0,
        _ => 30.0,
    }
}

// ─── 5. Naisargika Bala (Natural Hierarchy) ───────────────────────────────────

fn naisargika_bala(data: &PlanetData) -> f64 {
    // Fixed values per shastras. Already stored in Rupas, convert to Virupas.
    data.naisargika * 60.0 / 6.5 // Normalise to Jupiter's max = 60 Virupas
}

// ─── 6. Drik Bala (Aspectual Strength, simplified) ────────────────────────────

fn drik_bala(planet: &PlanetInput, all_planets: &[PlanetInput]) -> f64 {
    // Benefics (Jupiter, Venus, Mercury, Moon) aspecting = +15 per benefic
    // Malefics (Saturn, Mars, Rahu, Sun) aspecting = -10 per malefic
    let benefics = ["Jupiter", "Venus", "Mercury", "Moon"];
    let malefics = ["Saturn", "Mars", "Rahu", "Ketu"];

    let mut score = 30.0_f64; // Base neutral

    for other in all_planets {
        if other.name == planet.name { continue; }
        // Check if 'other' aspects 'planet' (7th house aspect is universal for all planets)
        let aspect_check = (other.house as i8 - planet.house as i8 + 6).rem_euclid(12);
        if aspect_check == 6 {  // 7th aspect
            if benefics.contains(&other.name.as_str()) {
                score += 15.0;
            } else if malefics.contains(&other.name.as_str()) {
                score -= 10.0;
            }
        }
    }

    score.max(0.0).min(60.0)
}

// ─── Ishta / Kashta Phala ─────────────────────────────────────────────────────

fn ishta_kashta(planet: &PlanetInput, data: &PlanetData, total_virupas: f64) -> (f64, f64) {
    // Ishta Phala = Benefic potential (good results)
    // Kashta Phala = Malefic potential (difficult results)
    let chesta_v = chesta_bala(planet); // 0-60
    let sthana_v = sthana_bala(planet, data); // 0-60

    let ishta = (sthana_v * chesta_v).sqrt();
    let kashta = ((60.0 - sthana_v) * (60.0 - chesta_v)).sqrt();

    (ishta, kashta)
}

// ─── Main Shadbala Calculation ─────────────────────────────────────────────────

pub fn calculate_shadbala(req: &ChartRequest) -> Vec<ShadbalaPlanet> {
    req.planets
        .iter()
        .filter_map(|planet| {
            let data = get_planet_data(&planet.name)?;

            let sthana  = sthana_bala(planet, data);
            let dig     = dig_bala(planet, data);
            let kaala   = kaala_bala(planet, req.julian_day);
            let chesta  = chesta_bala(planet);
            let naisarg = naisargika_bala(data);
            let drik    = drik_bala(planet, &req.planets);

            let total_virupas = sthana + dig + kaala + chesta + naisarg + drik;
            let total_rupas = total_virupas / 60.0;

            let (ishta, kashta) = ishta_kashta(planet, data, total_virupas);

            Some(ShadbalaPlanet {
                planet: planet.name.clone(),
                sthana_bala: (sthana * 100.0).round() / 100.0,
                dig_bala:    (dig    * 100.0).round() / 100.0,
                kaala_bala:  (kaala  * 100.0).round() / 100.0,
                chesta_bala: (chesta * 100.0).round() / 100.0,
                naisargika_bala: (naisarg * 100.0).round() / 100.0,
                drik_bala:   (drik   * 100.0).round() / 100.0,
                total_rupas: (total_rupas * 100.0).round() / 100.0,
                ishta_phala: (ishta  * 100.0).round() / 100.0,
                kashta_phala:(kashta * 100.0).round() / 100.0,
            })
        })
        .collect()
}
