# Navagraha — Database Schema Redesign
**Prepared by:** Senior Systems Architect  
**Date:** April 2026  
**Version:** 1.0

---

## 1. SCHEMA DESIGN PRINCIPLES

1. **Normalize what you query, JSONB what you don't** — Planetary positions need to be rows, not blobs. Gemstone recommendations can stay as JSONB.
2. **UUID everywhere** — Already doing this. Keep it.
3. **Soft deletes on user-facing entities** — GDPR requires deletion capability; soft deletes preserve audit trails.
4. **`created_at` AND `updated_at` on every table** — Non-negotiable.
5. **Explicit indexes on every foreign key and every column you filter/sort on** — Don't rely on ORM defaults.
6. **Financial tables are append-only** — Never UPDATE a transaction record. Create a reversal record instead.

---

## 2. COMPLETE SCHEMA (REDESIGNED)

### 2.1 User & Auth Tables

```sql
-- Core identity
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE NOT NULL,
    first_name      TEXT NOT NULL,
    last_name       TEXT,
    profile_image   TEXT,
    
    -- Birth data (optional, for quick kundli)
    date_of_birth   DATE,
    time_of_birth   TIME,
    place_of_birth  TEXT,
    birth_lat       DOUBLE PRECISION,
    birth_lon       DOUBLE PRECISION,
    
    -- Auth
    password_hash   TEXT,                              -- null if OAuth only
    auth_provider   TEXT NOT NULL DEFAULT 'email',    -- 'email' | 'google' | 'apple'
    google_id       TEXT UNIQUE,
    apple_id        TEXT UNIQUE,
    
    -- Status
    is_active       BOOLEAN NOT NULL DEFAULT true,
    is_verified     BOOLEAN NOT NULL DEFAULT false,
    email_verified_at TIMESTAMPTZ,
    
    -- Soft delete
    deleted_at      TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

-- Auth tokens (refresh token store — Redis is primary, this is backup/audit)
CREATE TABLE auth_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,              -- SHA-256 of refresh token
    user_agent      TEXT,
    ip_address      INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_tokens_user_id ON auth_tokens(user_id);
CREATE INDEX idx_auth_tokens_expires ON auth_tokens(expires_at) WHERE revoked_at IS NULL;
```

---

### 2.2 Kundli & Planetary Data Tables

**This is the most important schema change. Break the JSONB blob.**

```sql
-- Master birth chart record
CREATE TABLE kundlis (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Identity
    name            TEXT NOT NULL,
    is_primary      BOOLEAN NOT NULL DEFAULT false,    -- one primary per user
    
    -- Birth data (source of truth — immutable after creation)
    date_of_birth   DATE NOT NULL,
    time_of_birth   TIME NOT NULL,
    place_of_birth  TEXT NOT NULL,
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    timezone        TEXT NOT NULL,                     -- 'Asia/Kolkata'
    
    -- Calculation metadata
    julian_day      DOUBLE PRECISION NOT NULL,
    ayanamsa        TEXT NOT NULL DEFAULT 'LAHIRI',
    ayanamsa_value  DOUBLE PRECISION NOT NULL,         -- degrees at birth time
    engine_version  TEXT NOT NULL,                     -- 'js-v2.1' | 'rust-v1.3'
    
    -- Summary fields (denormalized for display performance)
    ascendant_sign  TEXT NOT NULL,                     -- 'ARIES', 'TAURUS', etc.
    moon_sign       TEXT NOT NULL,
    sun_sign        TEXT NOT NULL,
    
    -- Global scores (from Rust engine)
    global_strength_score DOUBLE PRECISION,
    
    -- Non-queryable blobs (remedies, full interpretation metadata)
    remedies_data   JSONB,
    engine_raw      JSONB,                             -- raw Rust engine response (archive)
    
    -- Soft delete
    deleted_at      TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kundlis_user_id ON kundlis(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_kundlis_moon_sign ON kundlis(moon_sign) WHERE deleted_at IS NULL;
CREATE INDEX idx_kundlis_ascendant ON kundlis(ascendant_sign) WHERE deleted_at IS NULL;

-- Normalized planetary positions (replaces chartData JSONB)
CREATE TABLE planetary_positions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kundli_id       UUID NOT NULL REFERENCES kundlis(id) ON DELETE CASCADE,
    
    -- Planet identity
    planet          TEXT NOT NULL,   -- 'SUN'|'MOON'|'MARS'|'MERCURY'|'JUPITER'|'VENUS'|'SATURN'|'RAHU'|'KETU'
    
    -- Precise position
    longitude       DOUBLE PRECISION NOT NULL,  -- 0-360, sidereal
    latitude        DOUBLE PRECISION NOT NULL DEFAULT 0,
    speed           DOUBLE PRECISION NOT NULL DEFAULT 0,  -- degrees/day
    is_retrograde   BOOLEAN NOT NULL DEFAULT false,
    
    -- Derived sign/house
    sign            TEXT NOT NULL,              -- 'ARIES' through 'PISCES'
    sign_lord       TEXT NOT NULL,
    house_number    INTEGER NOT NULL CHECK (house_number BETWEEN 1 AND 12),
    degree          DOUBLE PRECISION NOT NULL,  -- degree within sign (0-30)
    
    -- Nakshatra
    nakshatra       TEXT NOT NULL,
    nakshatra_pada  INTEGER CHECK (nakshatra_pada BETWEEN 1 AND 4),
    nakshatra_lord  TEXT NOT NULL,
    
    -- Strength (Shadbala — from Rust engine)
    sthana_bala     DOUBLE PRECISION,
    dig_bala        DOUBLE PRECISION,
    kaala_bala      DOUBLE PRECISION,
    chesta_bala     DOUBLE PRECISION,
    naisargika_bala DOUBLE PRECISION,
    drik_bala       DOUBLE PRECISION,
    total_shadbala  DOUBLE PRECISION,           -- rupas
    ishta_phala     DOUBLE PRECISION,
    kashta_phala    DOUBLE PRECISION,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(kundli_id, planet)
);

CREATE INDEX idx_positions_kundli ON planetary_positions(kundli_id);
-- Enables queries like "find all charts with Mars in 7th house"
CREATE INDEX idx_positions_planet_house ON planetary_positions(planet, house_number);
CREATE INDEX idx_positions_planet_sign ON planetary_positions(planet, sign);

-- Yoga detection results (replaces yogas in chartData JSONB)
CREATE TABLE yoga_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kundli_id       UUID NOT NULL REFERENCES kundlis(id) ON DELETE CASCADE,
    
    yoga_name       TEXT NOT NULL,              -- 'RAJ_YOGA', 'NEECHA_BHANGA', etc.
    yoga_type       TEXT NOT NULL,              -- 'benefic' | 'malefic' | 'neutral'
    is_active       BOOLEAN NOT NULL,           -- fires: true = active in this chart
    strength        DOUBLE PRECISION,           -- 0-100
    description     TEXT,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(kundli_id, yoga_name)
);

CREATE INDEX idx_yoga_kundli ON yoga_results(kundli_id);
CREATE INDEX idx_yoga_active ON yoga_results(yoga_name, is_active);

-- Dosha records (replaces doshas JSONB)
CREATE TABLE dosha_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kundli_id       UUID NOT NULL REFERENCES kundlis(id) ON DELETE CASCADE,
    
    dosha_type      TEXT NOT NULL,              -- 'MANGAL' | 'KAAL_SARP' | 'PITRU'
    is_present      BOOLEAN NOT NULL,
    severity        TEXT,                       -- 'mild' | 'moderate' | 'severe'
    cancellation    TEXT,                       -- why it's cancelled, if applicable
    is_cancelled    BOOLEAN NOT NULL DEFAULT false,
    details         JSONB,                      -- dosha-specific details
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(kundli_id, dosha_type)
);

-- Dasha periods (replaces dashas JSONB)
CREATE TABLE dasha_periods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kundli_id       UUID NOT NULL REFERENCES kundlis(id) ON DELETE CASCADE,
    
    -- Hierarchy
    level           INTEGER NOT NULL,           -- 1=Mahadasha, 2=Antardasha, 3=Pratyantardasha
    parent_id       UUID REFERENCES dasha_periods(id),
    
    -- Dasha identity
    dasha_system    TEXT NOT NULL DEFAULT 'VIMSHOTTARI',
    planet          TEXT NOT NULL,
    
    -- Timing
    starts_at       DATE NOT NULL,
    ends_at         DATE NOT NULL,
    
    -- Status (computed, updated periodically)
    status          TEXT NOT NULL,              -- 'past' | 'current' | 'upcoming'
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dasha_kundli ON dasha_periods(kundli_id, level);
CREATE INDEX idx_dasha_current ON dasha_periods(kundli_id, status) WHERE status = 'current';
CREATE INDEX idx_dasha_date_range ON dasha_periods(starts_at, ends_at);
```

---

### 2.3 AI & Prediction Tables

```sql
-- AI interpretation outputs (versioned, trackable)
CREATE TABLE ai_interpretations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kundli_id       UUID REFERENCES kundlis(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- What kind of interpretation
    type            TEXT NOT NULL,  -- 'full_kundli'|'dasha'|'transit'|'matching'|'prashna'
    
    -- Which model + prompt produced this
    model           TEXT NOT NULL,                   -- 'claude-sonnet-4-6'
    prompt_template_id UUID REFERENCES prompt_templates(id),
    prompt_version  INTEGER NOT NULL DEFAULT 1,
    
    -- The interpretation content
    content         JSONB NOT NULL,                  -- structured output
    raw_response    TEXT,                            -- full LLM response (for debugging)
    
    -- Quality tracking
    confidence_score DOUBLE PRECISION,               -- 0-1, computed
    user_rating     INTEGER CHECK (user_rating BETWEEN 1 AND 5),
    user_feedback   TEXT,
    
    -- Performance
    latency_ms      INTEGER,
    tokens_used     INTEGER,
    cost_usd        DOUBLE PRECISION,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interpretations_kundli ON ai_interpretations(kundli_id, type);
CREATE INDEX idx_interpretations_user ON ai_interpretations(user_id, created_at DESC);

-- AI conversation sessions
CREATE TABLE ai_chat_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kundli_id       UUID REFERENCES kundlis(id) ON DELETE SET NULL,
    
    title           TEXT,                            -- auto-generated from first message
    message_count   INTEGER NOT NULL DEFAULT 0,
    total_tokens    INTEGER NOT NULL DEFAULT 0,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI chat messages (replaces aiChatMessages)
CREATE TABLE ai_chat_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
    
    role            TEXT NOT NULL,                   -- 'user' | 'assistant'
    content         TEXT NOT NULL,
    
    -- Metadata (only for assistant messages)
    model           TEXT,
    council_outputs JSONB,                           -- 5-agent outputs (for debugging)
    latency_ms      INTEGER,
    tokens_used     INTEGER,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_session ON ai_chat_messages(session_id, created_at);

-- Prompt template versioning
CREATE TABLE prompt_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,                   -- 'kundli_interpreter', 'chronos_agent'
    version         INTEGER NOT NULL DEFAULT 1,
    model           TEXT NOT NULL,
    system_prompt   TEXT NOT NULL,
    user_template   TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    
    -- Performance metrics (updated by analytics job)
    avg_user_rating DOUBLE PRECISION,
    usage_count     INTEGER DEFAULT 0,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(name, version)
);

-- Predictions and accuracy tracking (enhanced from predictionFeedbacks)
CREATE TABLE predictions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    kundli_id       UUID REFERENCES kundlis(id),
    interpretation_id UUID REFERENCES ai_interpretations(id),
    
    -- The prediction
    category        TEXT NOT NULL,                   -- 'career'|'marriage'|'health'|'finance'|'travel'
    prediction_text TEXT NOT NULL,
    predicted_for   DATERANGE,                       -- date range prediction applies to
    
    -- Dasha context at time of prediction
    mahadasha       TEXT,
    antardasha      TEXT,
    
    -- Outcome tracking
    was_accurate    BOOLEAN,                         -- null = not yet rated
    accuracy_notes  TEXT,
    rated_at        TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_predictions_user ON predictions(user_id);
CREATE INDEX idx_predictions_kundli ON predictions(kundli_id);
CREATE INDEX idx_predictions_unrated ON predictions(id) WHERE was_accurate IS NULL;
```

---

### 2.4 Consultation & Communication Tables

```sql
-- Consultation sessions (minimal changes — current design is good)
CREATE TABLE consultations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    astrologer_id   UUID NOT NULL REFERENCES astrologers(id),
    
    type            TEXT NOT NULL,          -- 'chat' | 'voice' | 'video'
    status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'active'|'ended'|'cancelled'
    
    -- Timing
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    scheduled_at    TIMESTAMPTZ,            -- for scheduled calls
    
    -- Billing (CRITICAL: persisted for crash recovery)
    price_per_minute DECIMAL(10,2) NOT NULL,
    billed_seconds  INTEGER NOT NULL DEFAULT 0,
    total_amount    DECIMAL(10,4) NOT NULL DEFAULT 0,
    
    -- Billing checkpoint (CRASH RECOVERY — updated every minute)
    billing_checkpoint_at TIMESTAMPTZ,     -- last time billing was successfully processed
    billing_reserved_amount DECIMAL(10,2), -- amount reserved at start (1 min deposit)
    
    -- Agora
    agora_channel   TEXT UNIQUE,
    agora_token_user TEXT,
    agora_token_astrologer TEXT,
    
    -- Kundli context
    kundli_id       UUID REFERENCES kundlis(id),
    
    -- Notes
    user_notes      TEXT,                  -- pre-consultation notes
    astrologer_notes TEXT,                 -- private notes for astrologer
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consultations_user ON consultations(user_id, created_at DESC);
CREATE INDEX idx_consultations_astrologer ON consultations(astrologer_id, status);
CREATE INDEX idx_consultations_active ON consultations(status) WHERE status = 'active';
-- For billing reconciliation job
CREATE INDEX idx_consultations_checkpoint ON consultations(billing_checkpoint_at) 
    WHERE status = 'active';
```

---

### 2.5 Payment & Financial Tables

```sql
-- Wallet (current design is good)
CREATE TABLE wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id),
    balance         DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    currency        TEXT NOT NULL DEFAULT 'INR',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transactions — APPEND ONLY (no UPDATEs)
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    wallet_id       UUID NOT NULL REFERENCES wallets(id),
    
    -- Amount (always positive; type determines direction)
    amount          DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    type            TEXT NOT NULL,      -- 'recharge'|'debit'|'refund'|'reversal'
    
    -- Balance snapshot (denormalized for statement reconstruction)
    balance_before  DECIMAL(12,2) NOT NULL,
    balance_after   DECIMAL(12,2) NOT NULL,
    
    -- References
    consultation_id UUID REFERENCES consultations(id),
    related_transaction_id UUID REFERENCES transactions(id),  -- for reversals
    
    -- Payment gateway
    payment_method  TEXT,               -- 'razorpay'|'wallet'
    gateway_order_id TEXT,
    gateway_payment_id TEXT UNIQUE,
    gateway_signature TEXT,
    
    -- Status (recharge transactions have status; debits are immediate)
    status          TEXT NOT NULL DEFAULT 'completed',
    description     TEXT NOT NULL,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_user ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_consultation ON transactions(consultation_id);
CREATE INDEX idx_transactions_gateway ON transactions(gateway_payment_id) 
    WHERE gateway_payment_id IS NOT NULL;

-- Audit log (append-only, immutable)
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    actor_type      TEXT NOT NULL,          -- 'user' | 'astrologer' | 'system' | 'admin'
    actor_id        UUID,
    action          TEXT NOT NULL,          -- 'wallet.recharge', 'consultation.start', etc.
    entity_type     TEXT,                   -- 'consultation', 'transaction', etc.
    entity_id       UUID,
    old_value       JSONB,
    new_value       JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_log(actor_type, actor_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
```

---

### 2.6 Indexing Strategy Summary

**Golden rule:** Index every foreign key. Add composite indexes for your N most common query patterns.

```sql
-- Top 10 most-executed queries and their indexes:

-- 1. "Get user's kundlis" (KundliView, profile)
CREATE INDEX idx_kundlis_user_active ON kundlis(user_id, created_at DESC) 
    WHERE deleted_at IS NULL;

-- 2. "Get active consultations" (billing reconciliation)
CREATE INDEX idx_consult_active_checkpoint ON consultations(billing_checkpoint_at) 
    WHERE status = 'active';

-- 3. "Get astrologer list by availability" (browse page)
CREATE INDEX idx_astrologers_availability ON astrologers(availability, rating DESC) 
    WHERE is_verified = true;

-- 4. "Get user wallet balance" (every page with billing)
-- wallets.user_id is UNIQUE, so this is already a primary-key lookup

-- 5. "Get transaction history" (wallet page)
-- idx_transactions_user covers this

-- 6. "Get chat messages for consultation" (chat page)
CREATE INDEX idx_chat_consultation ON chat_messages(consultation_id, created_at DESC);

-- 7. "Find charts with specific planetary placement" (analytics/ML)
-- idx_positions_planet_house covers this

-- 8. "Get current dasha for kundli" (dasha widget)  
-- idx_dasha_current covers this

-- 9. "Get AI session history" (AIAstrologer page)
CREATE INDEX idx_ai_sessions_user ON ai_chat_sessions(user_id, last_message_at DESC);

-- 10. "Get prediction feedback for accuracy model"
CREATE INDEX idx_predictions_category_rated ON predictions(category, was_accurate) 
    WHERE was_accurate IS NOT NULL;
```

---

## 3. MIGRATION STRATEGY

### Phase 1: Additive (no breaking changes)
1. Create new `planetary_positions` table
2. Create `yoga_results`, `dosha_records`, `dasha_periods` tables
3. Write migration job: parse existing `kundlis.chartData` JSONB → insert into new tables
4. Update `createKundli` to write to BOTH old JSONB and new tables
5. Validate new tables match JSONB data

### Phase 2: Read migration (2 weeks post Phase 1)
1. Update all read queries to use new tables instead of JSONB
2. Keep JSONB writes as backup
3. Monitor for discrepancies

### Phase 3: Cleanup (1 month post Phase 2)
1. Remove JSONB columns from `kundlis`
2. Drop old columns
3. Run VACUUM

**Never run Phase 3 until Phase 2 has been stable for 30+ days.**

---

*Continue to: [04_30_DAY_ROADMAP.md](./04_30_DAY_ROADMAP.md)*
