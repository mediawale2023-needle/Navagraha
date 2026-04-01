// ─── Prashna Engine (Horary Astrology) ───────────────────────────────────────
//
// Prashna = "Question Chart" — a horary chart cast for the exact moment
// a question is asked. No birth data required. Opens a massive user segment:
// anyone who doesn't know their birth time, or wants a quick specific answer.
//
// Unique Prashna rules (different from natal chart):
//   - Arudha Lagna (AL) = the actual manifested position (not the body/soul)
//   - Hora lord = planet ruling the hour of the question
//   - Specific Nakshatra-based interpretations for yes/no answers
//   - Panchang (5 limbs): Tithi, Vara, Nakshatra, Karana, Yoga

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct PrashnaRequest {
    pub julian_day: f64,   // JD of the exact moment the question is asked
    pub latitude: f64,     // Location of the questioner
    pub longitude: f64,
    pub question_category: String, // "career", "marriage", "health", "finance", "travel", "general"
}

#[derive(Debug, Serialize)]
pub struct PanchangResult {
    pub tithi: String,           // Lunar day (1-30)
    pub vara: String,            // Day of week lord
    pub nakshatra: String,       // Moon's Nakshatra at the moment
    pub nakshatra_deity: String, // Nakshatra deity
    pub karana: String,          // Half-tithi
    pub yoga: String,            // Nakshatra + Sun+Moon combination
    pub hora_lord: String,       // Planetary hour ruler
}

#[derive(Debug, Serialize)]
pub struct PrashnaResponse {
    pub panchang: PanchangResult,
    pub prashna_ascendant_sign: u8,         // Lagna at question time
    pub arudha_lagna_sign: u8,              // Lord of Lagna placed in X houses ahead = AL
    pub answer_indicator: String,           // "YES", "NO", "NOT_NOW", "CONDITIONAL"
    pub timing_window: String,              // When the answer manifests
    pub key_significator: String,           // Planet ruling the question category
    pub prashna_analysis: Vec<String>,      // Bullet points of Prashna rules applied
}

// ─── Nakshatra Names ────────────────────────────────────────────────────────

const NAKSHATRAS: &[(&str, &str)] = &[
    ("Ashwini", "Ashwini Kumaras"), ("Bharani", "Yama"), ("Krittika", "Agni"),
    ("Rohini", "Brahma"), ("Mrigashira", "Soma"), ("Ardra", "Rudra"),
    ("Punarvasu", "Aditi"), ("Pushya", "Brihaspati"), ("Ashlesha", "Sarpa"),
    ("Magha", "Pitri"), ("Purva Phalguni", "Bhaga"), ("Uttara Phalguni", "Aryama"),
    ("Hasta", "Savitar"), ("Chitra", "Tvashtar"), ("Swati", "Vayu"),
    ("Vishakha", "Indra-Agni"), ("Anuradha", "Mitra"), ("Jyeshtha", "Indra"),
    ("Mula", "Nirrti"), ("Purva Ashadha", "Apas"), ("Uttara Ashadha", "Vishvedevas"),
    ("Shravana", "Vishnu"), ("Dhanishtha", "Vasus"), ("Shatabhisha", "Varuna"),
    ("Purva Bhadrapada", "Ajaikapad"), ("Uttara Bhadrapada", "Ahirbhudhanya"), ("Revati", "Pushan"),
];

const TITHIS: &[&str] = &[
    "Pratipada", "Dvitiya", "Tritiya", "Chaturthi", "Panchami",
    "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami",
    "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi", "Purnima/Amavasya",
];

const VARAS: &[&str] = &["Sunday (Sun)", "Monday (Moon)", "Tuesday (Mars)", "Wednesday (Mercury)",
                          "Thursday (Jupiter)", "Friday (Venus)", "Saturday (Saturn)"];

const HORA_ORDER: &[&str] = &["Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars"];

const YOGAS: &[&str] = &[
    "Vishkambha","Priti","Ayushman","Saubhagya","Shobhana","Atiganda","Sukarman",
    "Dhriti","Shula","Ganda","Vriddhi","Dhruva","Vyaghata","Harshana","Vajra",
    "Siddhi","Vyatipata","Variyan","Parigha","Shiva","Siddha","Sadhya","Shubha",
    "Shukla","Brahma","Indra","Vaidhriti"
];

const KARANAS: &[&str] = &[
    "Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti",
    "Shakuni", "Chatushpada", "Naga"
];

// ─── Category Significators ────────────────────────────────────────────────

fn category_significator(category: &str) -> &'static str {
    match category {
        "career"   => "Sun/Mercury (10th house karaka, ambition and intellect)",
        "marriage" => "Venus/Jupiter (7th house karaka, relationships)",
        "health"   => "Sun/Moon/Mars (vitality, body, energy)",
        "finance"  => "Jupiter/Venus (2nd and 11th house karakas, wealth and gains)",
        "travel"   => "Moon/Mercury/Rahu (movement, journeys, foreign connections)",
        _          => "Moon (Prashna Chandra rules all spontaneous questions)",
    }
}

// ─── Yes/No Indicator from Nakshatra + Hora ───────────────────────────────

fn calculate_answer_indicator(nakshatra_idx: usize, hora_lord: &str) -> &'static str {
    // Classical Prashna rules:
    // Saumya (benefic) Nakshatras + benefic Hora = YES
    // Krura (malefic) Nakshatras or malefic Hora = NO or timing dependent
    let benefic_nakshatras = [0, 3, 6, 7, 9, 11, 13, 16, 20, 21, 25, 26]; // Favorable
    let benefic_horas = ["Jupiter", "Venus", "Mercury", "Moon"];

    let nak_ok = benefic_nakshatras.contains(&nakshatra_idx);
    let hora_ok = benefic_horas.contains(&hora_lord);

    match (nak_ok, hora_ok) {
        (true, true)   => "YES — Both Nakshatra and Hora are auspicious. Strong affirmative.",
        (true, false)  => "CONDITIONAL — Nakshatra favors it but timing (Hora) creates friction. Result delayed.",
        (false, true)  => "NOT_NOW — Hora is supportive but the moment's Nakshatra indicates obstacles. Wait.",
        (false, false) => "NO — Both the Nakshatra and Hora are inauspicious. Question may be premature.",
    }
}

// ─── Core Prashna Chart Calculation ────────────────────────────────────────

pub fn calculate_prashna(req: &PrashnaRequest) -> PrashnaResponse {
    // Moon longitude approximation at given JD
    let t = (req.julian_day - 2451545.0) / 36525.0;
    let moon_lon_raw = (218.316 + 481267.881 * t).rem_euclid(360.0);

    // Sidereal Moon longitude (approx Lahiri ayanamsa 24°)
    let moon_sidereal = (moon_lon_raw - 24.0).rem_euclid(360.0);

    // Nakshatra at question moment
    let nakshatra_idx = (moon_sidereal / 13.333) as usize % 27;
    let (nakshatra_name, nakshatra_deity) = NAKSHATRAS[nakshatra_idx];

    // Tithi = difference between Sun and Moon / 12
    let sun_lon = (280.461 + 36000.77 * t).rem_euclid(360.0);
    let tithi_val = ((moon_lon_raw - sun_lon).rem_euclid(360.0) / 12.0) as usize;
    let tithi_name = TITHIS[tithi_val.min(14)];

    // Vara = weekday from JD
    let vara_idx = ((req.julian_day + 1.5) as usize) % 7;
    let vara_name = VARAS[vara_idx];

    // Hora lord = planetary hour ruler
    let day_hour = (req.julian_day.fract() * 24.0) as usize;
    let hora_idx = (vara_idx * 24 + day_hour) % 7;
    let hora_lord = HORA_ORDER[hora_idx];

    // Yoga = (Sun + Moon sidereal lon / 13.333) % 27
    let yoga_idx = (((sun_lon - 24.0).rem_euclid(360.0) + moon_sidereal) / 13.333) as usize % 27;
    let yoga_name = YOGAS[yoga_idx];

    // Karana = tithi / 2
    let karana_idx = (tithi_val * 2) % 10;
    let karana_name = KARANAS[karana_idx];

    // Prashna Ascendant: approximate using sidereal time + latitude
    let gmst_deg = (100.46 + 36000.77 * t + req.longitude).rem_euclid(360.0);
    let prashna_asc = (gmst_deg / 30.0) as u8 % 12 + 1;

    // Arudha Lagna: Lord of Ascendant placed X signs from Ascendant
    // Simplified: rotate ascendant by nakshatra_pada (qualitative approximation)
    let al_offset = (nakshatra_idx % 12) as u8;
    let arudha_lagna = (prashna_asc + al_offset - 1) % 12 + 1;

    // Timing window based on Hora and answer
    let timing_window = match hora_lord {
        "Moon"    => "Within 1-3 days (Moon = swiftness)",
        "Mercury" => "Within 1-3 weeks (Mercury = short-term)",
        "Venus"   => "Within 1-2 months (Venus = medium-term)",
        "Sun"     => "Within 1-3 months (Sun = authority/timing)",
        "Mars"    => "Within 2-3 months — with friction (Mars = action through conflict)",
        "Jupiter" => "Within 6-12 months — a major life cycle event (Jupiter = expansion over time)",
        _         => "Within 1-2 years (Saturn = delay, patience required)",
    };

    let answer_indicator = calculate_answer_indicator(nakshatra_idx, hora_lord);
    let significator = category_significator(&req.question_category);

    let prashna_analysis = vec![
        format!("Prashna Lagna (Rising Sign at question time): House {}", prashna_asc),
        format!("Arudha Lagna: House {} — this is the 'manifested reality' visible to the world", arudha_lagna),
        format!("Hora Lord is {} — this planet's energy dominates the answer", hora_lord),
        format!("Moon in Nakshatra {} (ruled by {}), which is {}", nakshatra_name, nakshatra_deity,
            if [0,3,6,7,9,11,13,16,20,21,25,26usize].contains(&nakshatra_idx) { "auspicious" } else { "challenging" }),
        format!("Panchang quality: {} Tithi + {} Yoga — {}", tithi_name, yoga_name,
            if yoga_idx < 14 { "broadly supportive day-energy" } else { "mixed or tense day-energy" }),
        format!("Primary significator for '{}' questions: {}", req.question_category, significator),
    ];

    PrashnaResponse {
        panchang: PanchangResult {
            tithi: tithi_name.to_string(),
            vara: vara_name.to_string(),
            nakshatra: nakshatra_name.to_string(),
            nakshatra_deity: nakshatra_deity.to_string(),
            karana: karana_name.to_string(),
            yoga: yoga_name.to_string(),
            hora_lord: hora_lord.to_string(),
        },
        prashna_ascendant_sign: prashna_asc,
        arudha_lagna_sign: arudha_lagna,
        answer_indicator: answer_indicator.to_string(),
        timing_window: timing_window.to_string(),
        key_significator: significator.to_string(),
        prashna_analysis,
    }
}
