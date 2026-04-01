# ─── Stage 1: Build the Rust binary ─────────────────────────────────────────
FROM rust:latest AS builder

WORKDIR /usr/src/astro-engine-rs

# Copy manifests first for dependency caching
COPY Cargo.toml ./

# Create a dummy main.rs to pre-compile dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release

# Remove the dummy binary and copy real source
RUN rm -rf src
COPY src ./src
RUN touch src/main.rs && cargo build --release

# ─── Stage 2: Minimal runtime image ──────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/astro-engine-rs/target/release/astro-engine-rs /usr/local/bin/

ENV PORT=3001
EXPOSE 3001

CMD ["astro-engine-rs"]
