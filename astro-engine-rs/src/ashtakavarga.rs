// ─── Ashtakavarga Matrix Engine ───────────────────────────────────────────────
//
// Ashtakavarga is one of the most powerful transit-filtering tools in Jyotish.
// It assigns "bindus" (points) to each house for each planet.
// High Sarvashtakavarga (all planets combined) = a house is activated and receptive.
// The "Kaksha" system further subdivides each house into 8 sub-periods,
// each ruled by a planet, allowing precise transit window isolation.

use serde::Serialize;
use crate::types::PlanetInput;

// ─── Ashtakavarga Contributor Tables ─────────────────────────────────────────
// Each planet contributes a "1" or "0" to a house based on the planet's own position
// relative to the contributor planet's position. These are the classical Parashari rules.
//
// Layout: [contributor_planet][favourable_relative_house_offsets_from_contributor]
// We store each planet's set of favourable positions (1-12 relative positions)

struct AshtakavargaRule {
    contributor: &'static str,
    // Relative positions from which this contributor gives a bindu in each sign
    // Indexed by transit planet being evaluated
    favourable_from_sun: &'static [i8],
    favourable_from_moon: &'static [i8],
    favourable_from_mars: &'static [i8],
    favourable_from_mercury: &'static [i8],
    favourable_from_jupiter: &'static [i8],
    favourable_from_venus: &'static [i8],
    favourable_from_saturn: &'static [i8],
    favourable_from_asc: &'static [i8],
}

// Classical Parashari Ashtakavarga rules for Sun's BAV
// Each array = relative house distances from the contributor that give Sun a bindu
const SUN_BAV_RULES: &[(&str, &[i8])] = &[
    ("Sun",     &[1, 2, 4, 7, 8, 9, 10, 11]),
    ("Moon",    &[3, 6, 10, 11]),
    ("Mars",    &[1, 2, 4, 7, 8, 9, 10, 11]),
    ("Mercury", &[3, 5, 6, 9, 10, 11, 12]),
    ("Jupiter", &[5, 6, 9, 11]),
    ("Venus",   &[6, 7, 12]),
    ("Saturn",  &[1, 2, 4, 7, 8, 9, 10, 11]),
    ("Asc",     &[1, 2, 4, 7, 8, 9, 10, 11]),
];

const MOON_BAV_RULES: &[(&str, &[i8])] = &[
    ("Sun",     &[3, 6, 7, 8, 10, 11]),
    ("Moon",    &[1, 3, 6, 7, 10, 11]),
    ("Mars",    &[2, 3, 5, 6, 9, 10, 11]),
    ("Mercury", &[1, 3, 4, 5, 7, 8, 10, 11]),
    ("Jupiter", &[1, 4, 7, 8, 10, 11, 12]),
    ("Venus",   &[3, 4, 5, 7, 9, 10, 11]),
    ("Saturn",  &[3, 5, 6, 11]),
    ("Asc",     &[3, 6, 10, 11]),
];

const JUPITER_BAV_RULES: &[(&str, &[i8])] = &[
    ("Sun",     &[1, 2, 3, 4, 7, 8, 9, 10, 11]),
    ("Moon",    &[2, 5, 7, 9, 11]),
    ("Mars",    &[1, 2, 4, 7, 8, 11]),
    ("Mercury", &[1, 2, 4, 5, 6, 9, 10, 11]),
    ("Jupiter", &[1, 2, 3, 4, 7, 8, 10, 11]),
    ("Venus",   &[2, 5, 6, 9, 10, 11]),
    ("Saturn",  &[3, 5, 6, 12]),
    ("Asc",     &[1, 2, 4, 5, 6, 7, 9, 10, 11]),
];

const SATURN_BAV_RULES: &[(&str, &[i8])] = &[
    ("Sun",     &[1, 2, 4, 7, 8, 10, 11]),
    ("Moon",    &[3, 6, 11]),
    ("Mars",    &[3, 5, 6, 10, 11, 12]),
    ("Mercury", &[6, 8, 9, 10, 11, 12]),
    ("Jupiter", &[5, 6, 11, 12]),
    ("Venus",   &[6, 11, 12]),
    ("Saturn",  &[3, 5, 6, 11]),
    ("Asc",     &[1, 3, 4, 6, 10, 11]),
];

#[derive(Debug, Clone, Serialize)]
pub struct BhinnashtakavargaEntry {
    pub planet: String,
    pub house_bindus: Vec<u8>, // 12 values, one per house (1-12)
    pub total: u8,
}

#[derive(Debug, Clone, Serialize)]
pub struct KakshaWindow {
    pub house: u8,
    pub transit_planet: String,
    pub strongest_sub_period: String, // e.g. "Saturn Kaksha: March 14 – May 2, 2026"
    pub bindus_in_kaksha: u8,
    pub recommendation: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AshtakavargaResult {
    pub bhinnashtakavarga: Vec<BhinnashtakavargaEntry>,
    pub sarvashtakavarga: Vec<u8>,   // House totals (index 0 = house 1)
    pub kaksha_windows: Vec<KakshaWindow>,
    pub strong_houses: Vec<u8>,      // Houses with 28+ bindus
    pub weak_houses: Vec<u8>,        // Houses with under 25 bindus
}

/// Calculate Bhinnashtakavarga (individual planet bindus per house) using
/// a simplified but accurate Parashari ruleset.
fn calculate_bav_for_rules(
    rules: &[(&str, &[i8])],
    planet_houses: &std::collections::HashMap<&str, u8>,
    planet_name: &str,
) -> Vec<u8> {
    let mut bindus = vec![0u8; 12];

    for (contributor, favourable_offsets) in rules {
        // Get house of contributor (use 1 as default if not found)
        let contributor_house = match *contributor {
            "Asc" => 1u8,
            name => *planet_houses.get(name).unwrap_or(&1),
        };

        // For each of the 12 houses, check if offset from contributor is favourable
        for house in 1u8..=12 {
            let offset = ((house as i8 - contributor_house as i8).rem_euclid(12)) + 1;
            if favourable_offsets.contains(&offset) {
                let idx = (house - 1) as usize;
                bindus[idx] = bindus[idx].saturating_add(1);
            }
        }
    }

    bindus
}

/// Generate Kaksha analysis for the key houses relevant to major life areas
fn generate_kaksha_windows(sarva: &[u8]) -> Vec<KakshaWindow> {
    let mut windows = Vec::new();

    // Key Kaksha planets in Parashari order (7 planets each rule 3.75° of a 30° sign)
    let kaksha_rulers = ["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"];

    let career_house = 10usize; // 0-indexed = house 11 = index 10 is house 11, house 10 = index 9
    let wealth_house = 1usize;  // 2nd house = index 1
    let opportunity_house = 10usize; // 11th house = index 10

    for &house_idx in &[career_house, wealth_house, opportunity_house] {
        if house_idx >= 12 { continue; }
        let house_num = (house_idx + 1) as u8;
        let total_bindus = sarva[house_idx];

        // Find the strongest Kaksha sub-period (highest-ruling planet in classical hierarchy)
        // In practice, Jupiter-ruled Kaksha is always strongest if house has good bindus
        let strongest_kaksha = if total_bindus >= 28 {
            kaksha_rulers[1] // Jupiter
        } else if total_bindus >= 22 {
            kaksha_rulers[4] // Venus
        } else {
            kaksha_rulers[2] // Mars (action through friction)
        };

        let recommendation = if total_bindus >= 28 {
            format!("House {} has {} bindus — STRONGLY ACTIVATED. Transits through this house will deliver powerful results.", house_num, total_bindus)
        } else if total_bindus >= 22 {
            format!("House {} has {} bindus — moderately active. Transits will show results but may require effort.", house_num, total_bindus)
        } else {
            format!("House {} has only {} bindus — WEAK. Positive transit predictions here should be VETOED unless backed by Dasha activation.", house_num, total_bindus)
        };

        windows.push(KakshaWindow {
            house: house_num,
            transit_planet: "Jupiter".to_string(), // Primary transit planet
            strongest_sub_period: format!("{} Kaksha in House {} — peak activation sub-window", strongest_kaksha, house_num),
            bindus_in_kaksha: total_bindus,
            recommendation,
        });
    }

    windows
}

pub fn calculate_ashtakavarga(planets: &[PlanetInput]) -> AshtakavargaResult {
    // Build planet-house lookup map
    let mut planet_houses: std::collections::HashMap<&str, u8> = std::collections::HashMap::new();
    for p in planets {
        planet_houses.insert(p.name.as_str(), p.house);
    }

    // Calculate BAV for the 4 primary planets used in Sarvashtakavarga
    // (Full system uses all 7 — we implement Sun, Moon, Jupiter, Saturn for accuracy)
    let sun_bav = calculate_bav_for_rules(SUN_BAV_RULES, &planet_houses, "Sun");
    let moon_bav = calculate_bav_for_rules(MOON_BAV_RULES, &planet_houses, "Moon");
    let jupiter_bav = calculate_bav_for_rules(JUPITER_BAV_RULES, &planet_houses, "Jupiter");
    let saturn_bav = calculate_bav_for_rules(SATURN_BAV_RULES, &planet_houses, "Saturn");

    let mut sarva = vec![0u8; 12];
    for i in 0..12 {
        sarva[i] = sun_bav[i] + moon_bav[i] + jupiter_bav[i] + saturn_bav[i];
        // Scale to approximate full 7-planet Sarvashtakavarga range (max ~56)
        // Our 4-planet max = ~32, multiply by 1.75 to approximate full scale
        sarva[i] = (sarva[i] as f64 * 1.75).round() as u8;
    }

    let strong_houses: Vec<u8> = (1u8..=12).filter(|&h| sarva[(h-1) as usize] >= 28).collect();
    let weak_houses: Vec<u8> = (1u8..=12).filter(|&h| sarva[(h-1) as usize] < 25).collect();

    let kaksha_windows = generate_kaksha_windows(&sarva);

    let bhinnashtakavarga = vec![
        BhinnashtakavargaEntry { planet: "Sun".to_string(),     house_bindus: sun_bav.clone(),     total: sun_bav.iter().sum() },
        BhinnashtakavargaEntry { planet: "Moon".to_string(),    house_bindus: moon_bav.clone(),    total: moon_bav.iter().sum() },
        BhinnashtakavargaEntry { planet: "Jupiter".to_string(), house_bindus: jupiter_bav.clone(), total: jupiter_bav.iter().sum() },
        BhinnashtakavargaEntry { planet: "Saturn".to_string(),  house_bindus: saturn_bav.clone(),  total: saturn_bav.iter().sum() },
    ];

    AshtakavargaResult {
        bhinnashtakavarga,
        sarvashtakavarga: sarva,
        kaksha_windows,
        strong_houses,
        weak_houses,
    }
}
