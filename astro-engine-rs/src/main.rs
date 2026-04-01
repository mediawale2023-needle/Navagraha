// ─── Actix-Web HTTP Server ────────────────────────────────────────────────────

mod types;
mod shadbala;
mod varga;
mod yoga;

use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder};
use types::{AstroEngineResponse, ChartRequest};

#[get("/health")]
async fn health() -> impl Responder {
    HttpResponse::Ok().body("astro-engine-rs ok")
}

/// POST /calculate
/// Accepts a ChartRequest JSON body, returns AstroEngineResponse
#[post("/calculate")]
async fn calculate(body: web::Json<ChartRequest>) -> impl Responder {
    let req = body.into_inner();

    // Tier 1: Deterministic math — no LLM involved
    let shadbala = shadbala::calculate_shadbala(&req);
    let varga_strengths = varga::calculate_varga_strengths(&req.planets);

    // Tier 2: Yoga detection using Shadbala as strength gate
    let yogas = yoga::detect_yogas(&req.planets, &shadbala);

    // Global strength score = average Rupas across all planets
    let global_strength_score = if shadbala.is_empty() {
        0.0
    } else {
        let sum: f64 = shadbala.iter().map(|s| s.total_rupas).sum();
        (sum / shadbala.len() as f64 * 100.0).round() / 100.0
    };

    let response = AstroEngineResponse {
        shadbala,
        yogas,
        varga_strengths,
        global_strength_score,
    };

    HttpResponse::Ok().json(response)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let addr = format!("0.0.0.0:{}", port);

    println!("[astro-engine-rs] Starting on {}", addr);

    HttpServer::new(|| {
        App::new()
            .service(health)
            .service(calculate)
    })
    .bind(&addr)?
    .run()
    .await
}
