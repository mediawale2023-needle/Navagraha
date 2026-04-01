// ─── Actix-Web HTTP Server ────────────────────────────────────────────────────

mod types;
mod shadbala;
mod varga;
mod yoga;
mod ashtakavarga;
mod dasha;

use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder};
use serde::{Deserialize, Serialize};
use types::{AstroEngineResponse, ChartRequest};
use ashtakavarga::AshtakavargaResult;
use dasha::MultiDashaResult;

// ─── Extended Request/Response ─────────────────────────────────────────────

#[derive(Deserialize)]
struct FullChartRequest {
    #[serde(flatten)]
    base: ChartRequest,
    moon_longitude: Option<f64>,
    birth_julian_day: Option<f64>,
    query_julian_day: Option<f64>,
    ascendant_sign: Option<u8>,
}

#[derive(Serialize)]
struct FullEngineResponse {
    // Sprint 1
    shadbala: Vec<crate::types::ShadbalaPlanet>,
    yogas: Vec<crate::types::DetectedYoga>,
    varga_strengths: Vec<crate::types::VargaStrength>,
    global_strength_score: f64,
    // Sprint 2
    ashtakavarga: Option<AshtakavargaResult>,
    multi_dasha: Option<MultiDashaResult>,
}

#[get("/health")]
async fn health() -> impl Responder {
    HttpResponse::Ok().body("astro-engine-rs v2 ok")
}

/// POST /calculate
#[post("/calculate")]
async fn calculate(body: web::Json<serde_json::Value>) -> impl Responder {
    // Parse as base ChartRequest
    let base_req: ChartRequest = match serde_json::from_value(body.0.clone()) {
        Ok(r) => r,
        Err(e) => return HttpResponse::BadRequest().body(format!("Parse error: {}", e)),
    };

    // Optional extended fields
    let moon_lon = body["moon_longitude"].as_f64();
    let birth_jd = body["birth_julian_day"].as_f64().unwrap_or(base_req.julian_day);
    let query_jd = body["query_julian_day"].as_f64().unwrap_or(
        // Default: today = current system time approximated as JD
        2460767.0 // approximate JD for 2026-04-01
    );
    let asc_sign = body["ascendant_sign"].as_u64().unwrap_or(1) as u8;

    // ─── Tier 1: Sprint 1 Calculations ────────────────────────────────────────
    let shadbala = shadbala::calculate_shadbala(&base_req);
    let varga_strengths = varga::calculate_varga_strengths(&base_req.planets);
    let yogas = yoga::detect_yogas(&base_req.planets, &shadbala);

    let global_strength_score = if shadbala.is_empty() {
        0.0
    } else {
        let sum: f64 = shadbala.iter().map(|s| s.total_rupas).sum();
        (sum / shadbala.len() as f64 * 100.0).round() / 100.0
    };

    // ─── Tier 2: Sprint 2 Calculations ────────────────────────────────────────
    let ashtakavarga = if !base_req.planets.is_empty() {
        Some(ashtakavarga::calculate_ashtakavarga(&base_req.planets))
    } else {
        None
    };

    let multi_dasha = if let Some(moon_l) = moon_lon {
        Some(dasha::run_multi_dasha(moon_l, asc_sign, birth_jd, query_jd))
    } else {
        None
    };

    let response = FullEngineResponse {
        shadbala,
        yogas,
        varga_strengths,
        global_strength_score,
        ashtakavarga,
        multi_dasha,
    };

    HttpResponse::Ok().json(response)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let addr = format!("0.0.0.0:{}", port);

    println!("[astro-engine-rs v2] Starting on {}", addr);
    println!("[astro-engine-rs v2] Modules: Shadbala + Yoga + Varga + Ashtakavarga + MultiDasha");

    HttpServer::new(|| {
        App::new()
            .service(health)
            .service(calculate)
    })
    .bind(&addr)?
    .run()
    .await
}
