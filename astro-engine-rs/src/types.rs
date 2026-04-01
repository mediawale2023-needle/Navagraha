// ─── Shared Types ────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};

/// A single planet's position + strength matrix
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanetInput {
    pub name: String,           // "Sun", "Moon", "Mars", ...
    pub longitude: f64,         // Tropical geocentric longitude (degrees)
    pub house: u8,              // House number 1-12 (Bhava Chalit)
    pub is_retrograde: bool,
    pub sign: u8,               // 1=Aries … 12=Pisces
    pub nakshatra_pada: u8,     // 1-108
}

/// Full chart context fed from Node.js
#[derive(Debug, Clone, Deserialize)]
pub struct ChartRequest {
    pub planets: Vec<PlanetInput>,
    pub ascendant_longitude: f64,
    pub latitude: f64,          // Birth latitude (for Dig Bala)
    pub julian_day: f64,        // JD of birth moment (for Kaala Bala)
}

/// Per-planet Shadbala components + total Rupas
#[derive(Debug, Clone, Serialize)]
pub struct ShadbalaPlanet {
    pub planet: String,
    pub sthana_bala: f64,       // Sign placement strength
    pub dig_bala: f64,          // Directional strength
    pub kaala_bala: f64,        // Temporal strength
    pub chesta_bala: f64,       // Motional speed strength
    pub naisargika_bala: f64,   // Natural hierarchy
    pub drik_bala: f64,         // Aspectual strength (simplified)
    pub total_rupas: f64,       // Sum ÷ 60 → Rupas
    pub ishta_phala: f64,       // Benefic points
    pub kashta_phala: f64,      // Malefic points
}

/// Detected Yoga
#[derive(Debug, Clone, Serialize)]
pub struct DetectedYoga {
    pub name: String,
    pub description: String,
    pub planets_involved: Vec<String>,
    pub strength_rupas: f64,    // Weighted average Rupas of forming planets
    pub fires: bool,            // true if strength_rupas >= threshold
}

#[derive(Debug, Clone, Serialize)]
pub struct VargaStrength {
    pub planet: String,
    pub is_vargottama: bool,    // Same sign in D1 and D9
    pub pushkar_navamsa: bool,
    pub d1_sign: u8,
    pub d9_sign: u8,
    pub strength_score: f64,   // 0-100 composite
}

/// The full engine response
#[derive(Debug, Serialize)]
pub struct AstroEngineResponse {
    pub shadbala: Vec<ShadbalaPlanet>,
    pub yogas: Vec<DetectedYoga>,
    pub varga_strengths: Vec<VargaStrength>,
    pub global_strength_score: f64, // Average Rupas all planets
}
