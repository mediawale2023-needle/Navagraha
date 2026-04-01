// ─── Yoga Detection Engine ───────────────────────────────────────────────────
//
// Detects major Vedic Yogas and validates their potency using Shadbala Rupas.
// A Yoga only "fires" when the forming planets have sufficient strength.

use crate::types::{DetectedYoga, PlanetInput, ShadbalaPlanet};

const RAJ_YOGA_THRESHOLD: f64 = 6.0;    // Minimum Rupas for a Raj Yoga to fire
const GENERAL_YOGA_THRESHOLD: f64 = 4.5;

fn planet_rupas<'a>(name: &str, shadbala: &'a [ShadbalaPlanet]) -> f64 {
    shadbala
        .iter()
        .find(|s| s.planet == name)
        .map(|s| s.total_rupas)
        .unwrap_or(0.0)
}

fn avg_rupas(names: &[&str], shadbala: &[ShadbalaPlanet]) -> f64 {
    if names.is_empty() { return 0.0; }
    names.iter().map(|n| planet_rupas(n, shadbala)).sum::<f64>() / names.len() as f64
}

pub fn detect_yogas(planets: &[PlanetInput], shadbala: &[ShadbalaPlanet]) -> Vec<DetectedYoga> {
    let mut yogas = Vec::new();

    // Helper closures
    let planet = |name: &str| -> Option<&PlanetInput> {
        planets.iter().find(|p| p.name == name)
    };
    let house_of = |name: &str| -> u8 {
        planet(name).map(|p| p.house).unwrap_or(0)
    };
    let sign_of = |name: &str| -> u8 {
        planet(name).map(|p| p.sign).unwrap_or(0)
    };

    // ─── Pancha Mahapurusha Yogas ────────────────────────────────────
    // Formed when Mars/Mercury/Jupiter/Venus/Saturn are in own sign OR exaltation,
    // AND placed in a Kendra (1,4,7,10).
    let mahapurusha_pairs = [
        ("Mars",    &[1u8, 8u8][..],  &[10u8][..], "Ruchaka Yoga"),
        ("Mercury", &[3u8, 6u8][..],  &[6u8][..],  "Bhadra Yoga"),
        ("Jupiter", &[9u8, 12u8][..], &[4u8][..],  "Hamsa Yoga"),
        ("Venus",   &[2u8, 7u8][..],  &[12u8][..], "Malavya Yoga"),
        ("Saturn",  &[10u8, 11u8][..],&[7u8][..],  "Shasha Yoga"),
    ];
    for (p_name, own_signs, exalt_signs, yoga_name) in mahapurusha_pairs.iter() {
        if let Some(p) = planet(p_name) {
            let in_kendra = [1, 4, 7, 10].contains(&p.house);
            let in_own_or_exalt = own_signs.contains(&p.sign) || exalt_signs.contains(&p.sign);
            if in_kendra && in_own_or_exalt {
                let rupas = planet_rupas(p_name, shadbala);
                yogas.push(DetectedYoga {
                    name: yoga_name.to_string(),
                    description: format!(
                        "{} is in its own/exalted sign in a Kendra (house {}). Strength: {:.2} Rupas.",
                        p_name, p.house, rupas
                    ),
                    planets_involved: vec![p_name.to_string()],
                    strength_rupas: rupas,
                    fires: rupas >= GENERAL_YOGA_THRESHOLD,
                });
            }
        }
    }

    // ─── Raj Yoga: Lord of 9th and 10th in conjunction ───────────────
    // Simplified: Check if Jupiter (natural Raj Yoga karaka) is in 9th or 10th
    // with a strong Sun (natural karaka of 10th).
    if let (Some(jup), Some(sun)) = (planet("Jupiter"), planet("Sun")) {
        if (jup.house == 9 || jup.house == 10) && (sun.house == 9 || sun.house == 10) {
            let rupas = avg_rupas(&["Jupiter", "Sun"], shadbala);
            yogas.push(DetectedYoga {
                name: "Raj Yoga (Jupiter-Sun)".to_string(),
                description: format!(
                    "Jupiter and Sun are both in the 9th/10th houses, indicating high status and authority. Avg Strength: {:.2} Rupas.",
                    rupas
                ),
                planets_involved: vec!["Jupiter".to_string(), "Sun".to_string()],
                strength_rupas: rupas,
                fires: rupas >= RAJ_YOGA_THRESHOLD,
            });
        }
    }

    // ─── Dhana Yoga: Lord of 2nd and 11th connected ──────────────────
    // Simplified: Jupiter in 2nd or 11th house (karaka for wealth)
    if let Some(jup) = planet("Jupiter") {
        if jup.house == 2 || jup.house == 11 {
            let rupas = planet_rupas("Jupiter", shadbala);
            yogas.push(DetectedYoga {
                name: "Dhana Yoga".to_string(),
                description: format!(
                    "Jupiter in the {} house strongly indicates wealth accumulation. Strength: {:.2} Rupas.",
                    jup.house, rupas
                ),
                planets_involved: vec!["Jupiter".to_string()],
                strength_rupas: rupas,
                fires: rupas >= GENERAL_YOGA_THRESHOLD,
            });
        }
    }

    // ─── Viparita Raj Yoga: Lord of 6th, 8th, or 12th in each other's houses ─
    let dusthana_houses = [6u8, 8u8, 12u8];
    let mars_house = house_of("Mars");
    let saturn_house = house_of("Saturn");
    if dusthana_houses.contains(&mars_house) && dusthana_houses.contains(&saturn_house) {
        let rupas = avg_rupas(&["Mars", "Saturn"], shadbala);
        yogas.push(DetectedYoga {
            name: "Viparita Raj Yoga".to_string(),
            description: "Malefics confined to dusthana houses protect the chart from external harm and create unexpected rise.".to_string(),
            planets_involved: vec!["Mars".to_string(), "Saturn".to_string()],
            strength_rupas: rupas,
            fires: true, // Viparita fires even with low strength
        });
    }

    // ─── Gajakesari Yoga: Jupiter in Kendra from Moon ────────────────
    if let (Some(jup), Some(moon)) = (planet("Jupiter"), planet("Moon")) {
        let diff = (jup.house as i8 - moon.house as i8).abs();
        let kendra_diff = [0i8, 3, 6, 9].contains(&diff) || [0i8, 3, 6, 9].contains(&(12 - diff));
        if kendra_diff {
            let rupas = avg_rupas(&["Jupiter", "Moon"], shadbala);
            yogas.push(DetectedYoga {
                name: "Gajakesari Yoga".to_string(),
                description: format!(
                    "Jupiter is in a Kendra (1/4/7/10) from the Moon — one of the most powerful benefic combinations for intelligence, fame, and prosperity. Avg Strength: {:.2} Rupas.",
                    rupas
                ),
                planets_involved: vec!["Jupiter".to_string(), "Moon".to_string()],
                strength_rupas: rupas,
                fires: rupas >= GENERAL_YOGA_THRESHOLD,
            });
        }
    }

    // ─── Budhaditya Yoga: Sun and Mercury conjunct ────────────────────
    let sun_sign = sign_of("Sun");
    let mercury_sign = sign_of("Mercury");
    if sun_sign == mercury_sign && sun_sign != 0 {
        let rupas = avg_rupas(&["Sun", "Mercury"], shadbala);
        yogas.push(DetectedYoga {
            name: "Budhaditya Yoga".to_string(),
            description: format!(
                "Sun and Mercury are in the same sign, bestowing sharp intellect, communication skills, and career success. Avg Strength: {:.2} Rupas.",
                rupas
            ),
            planets_involved: vec!["Sun".to_string(), "Mercury".to_string()],
            strength_rupas: rupas,
            fires: rupas >= GENERAL_YOGA_THRESHOLD,
        });
    }

    yogas
}
