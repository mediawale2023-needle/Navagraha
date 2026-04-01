// ─── Remediation Advisor ─────────────────────────────────────────────────────
//
// Transforms weak Shadbala scores into specific, actionable Vedic prescriptions.
// No LLM involved — this is a pure deterministic lookup engine.
//
// For each planet with < 5.0 Rupas, the engine prescribes:
//   1. Gemstone     (Ratna) — activates the planet's energy
//   2. Mantra       (Japa)  — specific Vedic mantra + recommended repetitions
//   3. Charity      (Daan)  — which item to donate, on which day
//   4. Fasting      (Upvas) — which day to fast, what to avoid
//   5. Yantra       (Geometry) — sacred diagram to install
//   6. Color/Diet   — colors to wear, foods to favor or avoid

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct RemediationRequest {
    pub planet: String,
    pub total_rupas: f64,
    pub is_retrograde: bool,
    pub nakshatra_pada: u8,
    pub house: u8,
}

#[derive(Debug, Serialize)]
pub struct PlanetRemediation {
    pub planet: String,
    pub rupas: f64,
    pub strength_label: String,
    pub gemstone: GemstoneRemediation,
    pub mantra: MantraRemediation,
    pub charity: CharityRemediation,
    pub yantra: String,
    pub color_therapy: Vec<String>,
    pub diet_guidance: Vec<String>,
    pub fasting: FastingRemediation,
    pub urgency: String,   // "Critical", "Recommended", "Optional"
}

#[derive(Debug, Serialize)]
pub struct GemstoneRemediation {
    pub primary: String,
    pub secondary: String,
    pub metal: String,
    pub finger: String,
    pub weight_carats: String,
    pub day_to_wear: String,
    pub activation_mantra: String,
}

#[derive(Debug, Serialize)]
pub struct MantraRemediation {
    pub beeja_mantra: String,
    pub full_mantra: String,
    pub daily_repetitions: u32,
    pub best_time: String,
    pub duration_days: u16,
}

#[derive(Debug, Serialize)]
pub struct CharityRemediation {
    pub items: Vec<String>,
    pub day: String,
    pub recipient: String,
    pub notes: String,
}

#[derive(Debug, Serialize)]
pub struct FastingRemediation {
    pub day: String,
    pub what_to_avoid: String,
    pub what_to_eat: String,
}

// ─── Planet-specific Remediation Data ────────────────────────────────────────

struct PlanetData {
    gemstone:    (&'static str, &'static str),   // (primary, secondary)
    metal:       &'static str,
    finger:      &'static str,
    wear_day:    &'static str,
    activation:  &'static str,
    beeja:       &'static str,
    full_mantra: &'static str,
    repetitions: u32,
    mantra_time: &'static str,
    charity:     &'static [&'static str],
    charity_day: &'static str,
    fasting_day: &'static str,
    avoid:       &'static str,
    eat:         &'static str,
    yantra:      &'static str,
    colors:      &'static [&'static str],
    diet:        &'static [&'static str],
}

const PLANET_REMEDIATION: &[(&str, PlanetData)] = &[
    ("Sun", PlanetData {
        gemstone:    ("Ruby (Manikya)", "Red Garnet or Red Spinel"),
        metal:       "Gold",
        finger:      "Ring finger (right hand)",
        wear_day:    "Sunday at sunrise",
        activation:  "Om Hraam Hreem Hraum Sah Suryaya Namah (108x)",
        beeja:       "Om Hraam Hreem Hraum Sah Suryaya Namah",
        full_mantra: "Om Aditya Hridayam Punyam Sarva Shatru Vinashanam",
        repetitions: 6000,
        mantra_time: "Sunrise, facing East",
        charity:     &["Wheat", "Jaggery", "Copper vessel", "Red cloth"],
        charity_day: "Sunday",
        fasting_day: "Sunday",
        avoid:       "All grains on fasting day",
        eat:         "Wheat preparations, fruits",
        yantra:      "Surya Yantra (6x6 magic square)",
        colors:      &["Orange", "Gold", "Red", "Saffron"],
        diet:        &["Wheat", "Saffron", "Pomegranate", "Orange fruits"],
    }),
    ("Moon", PlanetData {
        gemstone:    ("Natural Pearl (Moti)", "Moonstone or White Coral"),
        metal:       "Silver",
        finger:      "Little finger (right hand)",
        wear_day:    "Monday during Shukla Paksha",
        activation:  "Om Shraam Shreem Shraum Sah Chandraya Namah (108x)",
        beeja:       "Om Shraam Shreem Shraum Sah Chandraya Namah",
        full_mantra: "Om Chandraya Namah — 11,000 repetitions per Anushtan",
        repetitions: 11000,
        mantra_time: "Evening/nighttime, Monday",
        charity:     &["Rice", "White cloth", "Silver items", "Milk", "Camphor"],
        charity_day: "Monday",
        fasting_day: "Monday (Somvar Vrat)",
        avoid:       "Salt, sour foods",
        eat:         "Milk, rice, white foods",
        yantra:      "Chandra Yantra",
        colors:      &["White", "Silver", "Cream", "Pearl white"],
        diet:        &["Milk", "Rice", "Curd", "White fruits and vegetables"],
    }),
    ("Mars", PlanetData {
        gemstone:    ("Red Coral (Moonga)", "Carnelian or Red Jasper"),
        metal:       "Copper or Gold",
        finger:      "Ring finger (right hand)",
        wear_day:    "Tuesday at sunrise",
        activation:  "Om Kraam Kreem Kraum Sah Bhaumaya Namah (108x)",
        beeja:       "Om Kraam Kreem Kraum Sah Bhaumaya Namah",
        full_mantra: "Om Angarakaya Namah",
        repetitions: 7000,
        mantra_time: "Tuesday morning",
        charity:     &["Red lentils (masoor dal)", "Copper items", "Red cloth", "Wheat"],
        charity_day: "Tuesday",
        fasting_day: "Tuesday (Mangalvar Vrat)",
        avoid:       "Bitter foods, alcohol",
        eat:         "Red foods, pomegranate",
        yantra:      "Mangal Yantra",
        colors:      &["Red", "Coral", "Crimson", "Orange-red"],
        diet:        &["Red lentils","Pomegranate","Bitter gourd","Garlic (moderate)"],
    }),
    ("Mercury", PlanetData {
        gemstone:    ("Emerald (Panna)", "Green Tourmaline or Peridot"),
        metal:       "Gold or Silver",
        finger:      "Little finger (right hand)",
        wear_day:    "Wednesday morning",
        activation:  "Om Braam Breem Braum Sah Budhaya Namah (108x)",
        beeja:       "Om Braam Breem Braum Sah Budhaya Namah",
        full_mantra: "Om Budhaya Namah",
        repetitions: 9000,
        mantra_time: "Wednesday, during Budh hora",
        charity:     &["Green vegetables", "Green moong dal", "Books", "Green cloth"],
        charity_day: "Wednesday",
        fasting_day: "Wednesday (Budhavar Vrat)",
        avoid:       "Excessive communication on fasting day",
        eat:         "Green leafy vegetables, moong dal",
        yantra:      "Budh Yantra",
        colors:      &["Green", "Emerald green", "Light green", "Olive"],
        diet:        &["Green leafy vegetables","Moong dal","Spinach","Mint"],
    }),
    ("Jupiter", PlanetData {
        gemstone:    ("Yellow Sapphire (Pukhraj)", "Citrine or Yellow Topaz"),
        metal:       "Gold",
        finger:      "Index finger (right hand)",
        wear_day:    "Thursday morning",
        activation:  "Om Graam Greem Graum Sah Brihaspataye Namah (108x)",
        beeja:       "Om Graam Greem Graum Sah Brihaspataye Namah",
        full_mantra: "Om Brihaspataye Namah",
        repetitions: 16000,
        mantra_time: "Thursday sunrise",
        charity:     &["Yellow items","Turmeric","Gold (symbolic)","Books","Yellow cloth"],
        charity_day: "Thursday",
        fasting_day: "Thursday (Brihaspativar Vrat)",
        avoid:       "Salt on fasting day",
        eat:         "Yellow foods, chickpeas",
        yantra:      "Guru Yantra",
        colors:      &["Yellow","Gold","Saffron"],
        diet:        &["Chickpeas","Turmeric","Honey","Yellow fruits"],
    }),
    ("Venus", PlanetData {
        gemstone:    ("Diamond (Heera)", "White Sapphire or Zircon"),
        metal:       "Silver or Platinum",
        finger:      "Middle finger (right hand)",
        wear_day:    "Friday morning",
        activation:  "Om Draam Dreem Draum Sah Shukraya Namah (108x)",
        beeja:       "Om Draam Dreem Draum Sah Shukraya Namah",
        full_mantra: "Om Shukraya Namah",
        repetitions: 20000,
        mantra_time: "Friday morning",
        charity:     &["White rice","Curd","White cloth","Sugar","Rice"],
        charity_day: "Friday",
        fasting_day: "Friday (Shukravar Vrat)",
        avoid:       "Non-vegetarian food on Fridays",
        eat:         "White foods, milk sweets",
        yantra:      "Shukra Yantra",
        colors:      &["White","Light pink","Cream","Silver"],
        diet:        &["Dairy products","White rice","Sweet fruits"],
    }),
    ("Saturn", PlanetData {
        gemstone:    ("Blue Sapphire (Neelam)", "Amethyst or Blue Spinel"),
        metal:       "Iron or Silver",
        finger:      "Middle finger (right hand)",
        wear_day:    "Saturday at sunrise — test for 3 days first",
        activation:  "Om Praam Preem Praum Sah Shanaischaraya Namah (108x)",
        beeja:       "Om Praam Preem Praum Sah Shanaischaraya Namah",
        full_mantra: "Om Shanaischaraya Namah — Shani Ashtottara Shatanama Stotram",
        repetitions: 19000,
        mantra_time: "Saturday at sunrise",
        charity:     &["Black sesame seeds","Black cloth","Iron vessels","Mustard oil","Blue flowers"],
        charity_day: "Saturday",
        fasting_day: "Saturday (Shanivar Vrat)",
        avoid:       "Oil, salt on fasting day",
        eat:         "Black sesame (til), urad dal",
        yantra:      "Shani Yantra",
        colors:      &["Dark blue","Black","Indigo","Purple"],
        diet:        &["Urad dal","Black sesame","Mustard greens","Iron-rich foods"],
    }),
    ("Rahu", PlanetData {
        gemstone:    ("Hessonite Garnet (Gomed)", "Spessartite Garnet"),
        metal:       "Silver (with blue sapphire)",
        finger:      "Middle finger (right hand)",
        wear_day:    "Saturday at sunset",
        activation:  "Om Bhraam Bhreem Bhraum Sah Rahave Namah (108x)",
        beeja:       "Om Raam Rahave Namah",
        full_mantra: "Om Bhraam Bhreem Bhraum Sah Rahave Namah",
        repetitions: 18000,
        mantra_time: "Night, Rahu kala",
        charity:     &["Blue cloth","Coconut","Mustard oil","Black sesame"],
        charity_day: "Saturday",
        fasting_day: "Saturday",
        avoid:       "Intoxicants, non-veg",
        eat:         "Coconut, sesame",
        yantra:      "Rahu Yantra",
        colors:      &["Smoky grey","Blue","Dark brown"],
        diet:        &["Coconut","Sesame","Barley"],
    }),
    ("Ketu", PlanetData {
        gemstone:    ("Cat's Eye (Lehsunia)", "Tourmaline or Tiger's Eye"),
        metal:       "Silver",
        finger:      "Middle finger (right hand)",
        wear_day:    "Thursday at sunset",
        activation:  "Om Straam Streem Straum Sah Ketave Namah (108x)",
        beeja:       "Om Keem Ketave Namah",
        full_mantra: "Om Straam Streem Straum Sah Ketave Namah",
        repetitions: 7000,
        mantra_time: "Night, Thursday",
        charity:     &["Brown cloth","Sesame","Blankets for the poor"],
        charity_day: "Thursday",
        fasting_day: "Thursday",
        avoid:       "Conflict, arguments",
        eat:         "Sesame, turmeric foods",
        yantra:      "Ketu Yantra",
        colors:      &["Brown","Grey","Ash"],
        diet:        &["Sesame","Turmeric","Light foods"],
    }),
];

fn get_planet_data(name: &str) -> Option<&'static PlanetData> {
    PLANET_REMEDIATION.iter().find(|(n,_)| *n==name).map(|(_,d)| d)
}

pub fn generate_remediation(req: &RemediationRequest) -> Option<PlanetRemediation> {
    let data = get_planet_data(&req.planet)?;

    let strength_label = if req.total_rupas < 2.0 { "Critical (< 2 Rupas)" }
        else if req.total_rupas < 3.5 { "Weak (< 3.5 Rupas)" }
        else if req.total_rupas < 5.0 { "Below Average (< 5 Rupas)" }
        else { "Adequate — no urgent remediation needed" };

    let urgency = if req.total_rupas < 2.0 { "Critical" }
        else if req.total_rupas < 3.5 { "Recommended" }
        else { "Optional" };

    let weight_carats = if req.total_rupas < 2.0 { "3-5 carats minimum" }
        else if req.total_rupas < 4.0 { "2-3 carats" }
        else { "1-2 carats" };

    Some(PlanetRemediation {
        planet: req.planet.clone(),
        rupas: req.total_rupas,
        strength_label: strength_label.to_string(),
        gemstone: GemstoneRemediation {
            primary: data.gemstone.0.to_string(),
            secondary: data.gemstone.1.to_string(),
            metal: data.metal.to_string(),
            finger: data.finger.to_string(),
            weight_carats: weight_carats.to_string(),
            day_to_wear: data.wear_day.to_string(),
            activation_mantra: data.activation.to_string(),
        },
        mantra: MantraRemediation {
            beeja_mantra: data.beeja.to_string(),
            full_mantra: data.full_mantra.to_string(),
            daily_repetitions: data.repetitions / 40,  // 40-day Anushtan distribution
            best_time: data.mantra_time.to_string(),
            duration_days: 40,
        },
        charity: CharityRemediation {
            items: data.charity.iter().map(|s| s.to_string()).collect(),
            day: data.charity_day.to_string(),
            recipient: "Brahmin, temple priest, or underprivileged individuals".to_string(),
            notes: format!("Donate on {} morning for maximum effect. Repeat weekly for 11 weeks minimum.", data.charity_day),
        },
        yantra: format!("{} — to be installed in the puja space, energized on {}", data.yantra, data.wear_day),
        color_therapy: data.colors.iter().map(|s| s.to_string()).collect(),
        diet_guidance: data.diet.iter().map(|s| s.to_string()).collect(),
        fasting: FastingRemediation {
            day: data.fasting_day.to_string(),
            what_to_avoid: data.avoid.to_string(),
            what_to_eat: data.eat.to_string(),
        },
        urgency: urgency.to_string(),
    })
}

#[derive(Debug, Deserialize, Serialize)]
pub struct FullRemediationRequest {
    pub planets: Vec<RemediationRequest>,
}

#[derive(Debug, Serialize)]
pub struct FullRemediationResponse {
    pub remediations: Vec<PlanetRemediation>,
    pub priority_order: Vec<String>,
    pub overall_guidance: String,
}

pub fn generate_full_remediation(req: &FullRemediationRequest) -> FullRemediationResponse {
    let mut remediations: Vec<PlanetRemediation> = req.planets.iter()
        .filter(|p| p.total_rupas < 5.0)
        .filter_map(|p| generate_remediation(p))
        .collect();

    // Sort by urgency (weakest first)
    remediations.sort_by(|a, b| a.rupas.partial_cmp(&b.rupas).unwrap());

    let priority_order: Vec<String> = remediations.iter()
        .map(|r| format!("{} ({} Rupas) — {}", r.planet, r.rupas, r.urgency))
        .collect();

    let overall_guidance = if remediations.is_empty() {
        "All planets have adequate strength (5+ Rupas). No urgent remediation needed. Maintain current spiritual practice.".to_string()
    } else {
        format!(
            "{} planet(s) require attention. Start with {} as the highest priority. Begin practices on the appropriate day with consistency for 40 days minimum before expecting visible results.",
            remediations.len(),
            remediations.first().map(|r| r.planet.as_str()).unwrap_or("the weakest planet")
        )
    };

    FullRemediationResponse { remediations, priority_order, overall_guidance }
}
