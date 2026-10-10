import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from './db';
import { storage } from './storage';
import { FREE_CHAT_MINUTES } from './paymentService';
import { features } from './features';
import { closeMarketplaceActivity } from './marketplace';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  sid varchar PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

CREATE TABLE IF NOT EXISTS users (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar UNIQUE,
  first_name varchar,
  last_name varchar,
  profile_image_url varchar,
  phone_number varchar,
  date_of_birth timestamp,
  time_of_birth varchar,
  place_of_birth varchar,
  password_hash varchar,
  auth_provider varchar DEFAULT 'google',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
-- Idempotent column additions for existing deployments
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider varchar DEFAULT 'google';

CREATE TABLE IF NOT EXISTS astrologers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  email varchar UNIQUE,
  password_hash varchar,
  profile_image_url varchar,
  specializations text[],
  experience integer,
  rating decimal(3, 2),
  total_consultations integer DEFAULT 0,
  price_per_minute decimal(10, 2),
  availability varchar DEFAULT 'offline',
  languages text[],
  about text,
  certifications text[],
  is_verified boolean DEFAULT false,
  is_online boolean DEFAULT false,
  total_earnings decimal(12, 2) DEFAULT 0,
  pending_payout decimal(12, 2) DEFAULT 0,
  bank_account_name varchar,
  bank_account_number varchar,
  bank_ifsc varchar,
  upi_id varchar,
  phone_number varchar,
  last_seen_at timestamp,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) UNIQUE,
  balance decimal(10, 2) DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kundlis (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar REFERENCES users(id),
  name varchar NOT NULL,
  date_of_birth timestamp NOT NULL,
  time_of_birth varchar NOT NULL,
  place_of_birth varchar NOT NULL,
  latitude decimal(10, 7),
  longitude decimal(10, 7),
  gender varchar,
  zodiac_sign varchar,
  moon_sign varchar,
  ascendant varchar,
  chart_data jsonb,
  dashas jsonb,
  doshas jsonb,
  remedies jsonb,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  amount decimal(10, 2) NOT NULL,
  type varchar NOT NULL,
  description text,
  status varchar DEFAULT 'pending',
  payment_method varchar,
  gateway_order_id varchar,
  gateway_payment_id varchar,
  gateway_signature varchar,
  consultation_id varchar,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consultations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  astrologer_id varchar NOT NULL REFERENCES astrologers(id),
  type varchar NOT NULL,
  status varchar DEFAULT 'active',
  started_at timestamp DEFAULT now(),
  ended_at timestamp,
  duration_seconds integer DEFAULT 0,
  price_per_minute decimal(10, 2),
  total_amount decimal(10, 2) DEFAULT 0,
  agora_channel varchar,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  astrologer_id varchar NOT NULL REFERENCES astrologers(id),
  message text NOT NULL,
  sender varchar NOT NULL,
  message_type varchar DEFAULT 'text',
  is_read boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  astrologer_id varchar NOT NULL REFERENCES astrologers(id),
  consultation_id varchar REFERENCES consultations(id),
  rating integer NOT NULL,
  comment text,
  is_public boolean DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduled_calls (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  astrologer_id varchar NOT NULL REFERENCES astrologers(id),
  scheduled_at timestamp NOT NULL,
  type varchar NOT NULL,
  duration_minutes integer DEFAULT 30,
  status varchar DEFAULT 'pending',
  notes text,
  total_amount decimal(10, 2),
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar,
  recipient_type varchar DEFAULT 'user',
  type varchar NOT NULL,
  title varchar NOT NULL,
  body text NOT NULL,
  data jsonb,
  is_read boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS astrologer_earnings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id varchar NOT NULL REFERENCES astrologers(id),
  consultation_id varchar REFERENCES consultations(id),
  gross_amount decimal(10, 2) NOT NULL,
  platform_fee decimal(10, 2) NOT NULL,
  net_amount decimal(10, 2) NOT NULL,
  status varchar DEFAULT 'pending',
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payout_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id varchar NOT NULL REFERENCES astrologers(id),
  amount decimal(10, 2) NOT NULL,
  method varchar NOT NULL,
  status varchar DEFAULT 'pending',
  notes text,
  created_at timestamp DEFAULT now(),
  processed_at timestamp
);

CREATE TABLE IF NOT EXISTS homepage_content (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  section varchar NOT NULL,
  title varchar NOT NULL,
  subtitle text,
  icon varchar,
  href varchar,
  gradient varchar,
  cta varchar,
  sort_order integer DEFAULT 0,
  enabled boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  session_id varchar NOT NULL,
  role varchar NOT NULL,
  content text NOT NULL,
  kundli_id varchar REFERENCES kundlis(id),
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_user_session ON ai_chat_messages (user_id, session_id);

CREATE TABLE IF NOT EXISTS user_memories (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  kind varchar NOT NULL DEFAULT 'fact',
  content text NOT NULL,
  source_session_id varchar,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_memories_user ON user_memories (user_id);

CREATE TABLE IF NOT EXISTS prediction_feedbacks (
  id serial PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id),
  kundli_id varchar REFERENCES kundlis(id),
  prediction_category text NOT NULL,
  predicted_date timestamp,
  actual_occurrence_date timestamp,
  was_accurate boolean NOT NULL,
  dasha_system_used varchar NOT NULL,
  processed_at timestamp,
  created_at timestamp DEFAULT now()
);

-- Decommission the legacy "Corporate/Boardroom" subsystem (removed pre-launch).
DROP TABLE IF EXISTS boardroom_messages CASCADE;
DROP TABLE IF EXISTS ai_directives CASCADE;
DROP TABLE IF EXISTS ai_initiatives CASCADE;
DROP TABLE IF EXISTS ai_employees CASCADE;
DROP TABLE IF EXISTS ai_companies CASCADE;

-- ─── Offers / Referrals / First-chat-free ──────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS free_chat_used boolean DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS coupon_code varchar;

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS is_free boolean DEFAULT false;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS free_minutes integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS coupons (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar NOT NULL UNIQUE,
  description text,
  discount_type varchar NOT NULL DEFAULT 'percent',
  discount_value decimal(10, 2) NOT NULL,
  max_discount decimal(10, 2),
  min_amount decimal(10, 2) DEFAULT 0,
  usage_limit integer,
  per_user_limit integer DEFAULT 1,
  first_recharge_only boolean DEFAULT false,
  times_used integer DEFAULT 0,
  valid_from timestamp,
  valid_until timestamp,
  is_active boolean DEFAULT true,
  show_on_wallet boolean DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id varchar NOT NULL REFERENCES coupons(id),
  user_id varchar NOT NULL REFERENCES users(id),
  transaction_id varchar,
  discount_amount decimal(10, 2) NOT NULL,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions (user_id);

CREATE TABLE IF NOT EXISTS referrals (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id varchar NOT NULL REFERENCES users(id),
  referee_id varchar NOT NULL UNIQUE REFERENCES users(id),
  status varchar DEFAULT 'pending',
  referrer_reward decimal(10, 2) DEFAULT 0,
  referee_reward decimal(10, 2) DEFAULT 0,
  rewarded_at timestamp,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id);

-- ─── Push notification tokens (FCM) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id varchar NOT NULL,
  owner_type varchar NOT NULL DEFAULT 'user',
  token varchar NOT NULL UNIQUE,
  platform varchar DEFAULT 'web',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_owner ON push_tokens (owner_id, owner_type);

-- ─── Astromall (store) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  slug varchar NOT NULL UNIQUE,
  description text,
  category varchar NOT NULL,
  price decimal(10, 2) NOT NULL,
  mrp decimal(10, 2),
  image_url varchar,
  images text[],
  stock integer DEFAULT 100,
  rating decimal(3, 2) DEFAULT 4.5,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  status varchar DEFAULT 'placed',
  total_amount decimal(10, 2) NOT NULL,
  payment_method varchar DEFAULT 'wallet',
  shipping_name varchar,
  shipping_phone varchar,
  shipping_address text,
  shipping_city varchar,
  shipping_state varchar,
  shipping_pincode varchar,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id);

CREATE TABLE IF NOT EXISTS order_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id varchar NOT NULL REFERENCES orders(id),
  product_id varchar NOT NULL REFERENCES products(id),
  product_name varchar NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  price decimal(10, 2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

-- ─── Paid reports ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_types (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar NOT NULL UNIQUE,
  name varchar NOT NULL,
  description text,
  category varchar DEFAULT 'life',
  price decimal(10, 2) NOT NULL,
  icon varchar,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_orders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  report_type_id varchar NOT NULL REFERENCES report_types(id),
  kundli_id varchar REFERENCES kundlis(id),
  subject_name varchar,
  status varchar DEFAULT 'processing',
  amount decimal(10, 2) NOT NULL,
  content jsonb,
  created_at timestamp DEFAULT now(),
  ready_at timestamp
);
CREATE INDEX IF NOT EXISTS idx_report_orders_user ON report_orders (user_id);
ALTER TABLE report_orders ADD COLUMN IF NOT EXISTS subject_name varchar;
ALTER TABLE report_orders ADD COLUMN IF NOT EXISTS charged_amount decimal(10, 2);
ALTER TABLE report_orders ADD COLUMN IF NOT EXISTS refunded_at timestamp;
ALTER TABLE report_orders ADD COLUMN IF NOT EXISTS failure_reason text;
CREATE INDEX IF NOT EXISTS idx_report_orders_processing ON report_orders (created_at) WHERE status = 'processing';

CREATE TABLE IF NOT EXISTS daily_horoscopes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  kundli_id varchar REFERENCES kundlis(id),
  horo_date varchar NOT NULL,
  language varchar DEFAULT 'English',
  content jsonb NOT NULL,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_horo_user_date ON daily_horoscopes (user_id, horo_date);

-- ─── Book a pooja ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poojas (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar NOT NULL UNIQUE,
  name varchar NOT NULL,
  description text,
  benefits text[],
  price decimal(10, 2) NOT NULL,
  duration_text varchar,
  image_url varchar,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pooja_bookings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  pooja_id varchar NOT NULL REFERENCES poojas(id),
  pooja_name varchar NOT NULL,
  status varchar DEFAULT 'booked',
  amount decimal(10, 2) NOT NULL,
  devotee_name varchar NOT NULL,
  gotra varchar,
  preferred_date timestamp,
  sankalp_notes text,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pooja_bookings_user ON pooja_bookings (user_id);

-- ─── Live streaming ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_streams (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id varchar NOT NULL REFERENCES astrologers(id),
  title varchar NOT NULL,
  status varchar DEFAULT 'live',
  agora_channel varchar NOT NULL,
  viewer_count integer DEFAULT 0,
  peak_viewers integer DEFAULT 0,
  total_gifts decimal(12, 2) DEFAULT 0,
  started_at timestamp DEFAULT now(),
  ended_at timestamp
);
CREATE INDEX IF NOT EXISTS idx_live_streams_status ON live_streams (status);

CREATE TABLE IF NOT EXISTS stream_messages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id varchar NOT NULL REFERENCES live_streams(id),
  sender_id varchar NOT NULL,
  sender_type varchar NOT NULL DEFAULT 'user',
  sender_name varchar NOT NULL,
  type varchar NOT NULL DEFAULT 'chat',
  message text,
  gift_name varchar,
  gift_amount decimal(10, 2),
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stream_messages_stream ON stream_messages (stream_id, created_at);

-- ─── Follow / waitlist ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS astrologer_follows (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  astrologer_id varchar NOT NULL REFERENCES astrologers(id),
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_user_astro ON astrologer_follows (user_id, astrologer_id);

CREATE TABLE IF NOT EXISTS consultation_queue (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  astrologer_id varchar NOT NULL REFERENCES astrologers(id),
  type varchar NOT NULL DEFAULT 'chat',
  status varchar DEFAULT 'waiting',
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_queue_astro ON consultation_queue (astrologer_id, status);

-- ─── Astrologer KYC fields ─────────────────────────────────────────────────
ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS kyc_status varchar DEFAULT 'none';
ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS pan_number varchar;
ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS aadhaar_last4 varchar;
ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS kyc_notes text;
ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamp;
ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS kyc_reviewed_at timestamp;

-- ─── Jyotish AI Reading (admin + Astrologer Pro) ───────────────────────────
CREATE TABLE IF NOT EXISTS jyotish_client_profiles (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id varchar REFERENCES users(id),
  astrologer_id varchar REFERENCES astrologers(id),
  name varchar NOT NULL,
  gender varchar,
  phone varchar,
  tags varchar,
  follow_up_at timestamp,
  date_of_birth timestamp NOT NULL,
  time_of_birth varchar NOT NULL,
  place_of_birth varchar NOT NULL,
  latitude decimal(10, 7) NOT NULL,
  longitude decimal(10, 7) NOT NULL,
  notes text,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jyotish_profiles_creator ON jyotish_client_profiles (created_by_user_id);

-- Idempotent upgrades for existing installs (must run BEFORE indexes on new columns)
ALTER TABLE jyotish_client_profiles ALTER COLUMN created_by_user_id DROP NOT NULL;
ALTER TABLE jyotish_client_profiles ADD COLUMN IF NOT EXISTS astrologer_id varchar REFERENCES astrologers(id);
ALTER TABLE jyotish_client_profiles ADD COLUMN IF NOT EXISTS phone varchar;
ALTER TABLE jyotish_client_profiles ADD COLUMN IF NOT EXISTS tags varchar;
ALTER TABLE jyotish_client_profiles ADD COLUMN IF NOT EXISTS follow_up_at timestamp;
CREATE INDEX IF NOT EXISTS idx_jyotish_profiles_astrologer ON jyotish_client_profiles (astrologer_id);
ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS pro_ai_credits_used integer DEFAULT 0;
ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS pro_ai_credits_reset_at timestamp;

CREATE TABLE IF NOT EXISTS jyotish_readings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id varchar NOT NULL REFERENCES jyotish_client_profiles(id),
  chart_data jsonb NOT NULL,
  parashar_reading text,
  kn_rao_reading text,
  kamakhya_reading text,
  language varchar DEFAULT 'English',
  status varchar DEFAULT 'ready',
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jyotish_readings_profile ON jyotish_readings (profile_id);

CREATE TABLE IF NOT EXISTS jyotish_session_queries (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id varchar NOT NULL REFERENCES jyotish_client_profiles(id),
  reading_id varchar REFERENCES jyotish_readings(id),
  tradition varchar NOT NULL DEFAULT 'Parashar',
  question text NOT NULL,
  answer text,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jyotish_queries_profile ON jyotish_session_queries (profile_id, created_at);

-- Release A: recharge breakdown verified at settlement, coupon redemption state, Ask metering,
-- entitlements and shared AI usage. Additive only; see docs/RELEASE_A.md for rollback.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gateway_amount_paise integer;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gateway_currency varchar;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pack_bonus decimal(10, 2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS coupon_bonus decimal(10, 2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS review_reason text;
ALTER TABLE coupon_redemptions ADD COLUMN IF NOT EXISTS status varchar;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS settlement_verified_at timestamp;

CREATE TABLE IF NOT EXISTS ask_usage (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  chart_key varchar NOT NULL,
  session_id varchar NOT NULL,
  kind varchar NOT NULL,
  parent_id varchar,
  entitlement varchar NOT NULL,
  entitlement_id varchar,
  follow_ups_allowed integer NOT NULL DEFAULT 0,
  status varchar NOT NULL DEFAULT 'reserved',
  idempotency_key varchar NOT NULL,
  reply_message_id varchar,
  created_at timestamp DEFAULT now(),
  settled_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS ask_usage_idempotency_uq ON ask_usage (user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS ask_usage_thread_idx ON ask_usage (user_id, session_id, chart_key);

CREATE TABLE IF NOT EXISTS entitlements (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  kind varchar NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 0),
  used integer NOT NULL DEFAULT 0,
  follow_ups_each integer NOT NULL DEFAULT 0,
  source varchar NOT NULL,
  source_ref varchar,
  expires_at timestamp,
  created_at timestamp DEFAULT now(),
  CONSTRAINT entitlements_used_within_quantity CHECK (used >= 0 AND used <= quantity)
);
CREATE INDEX IF NOT EXISTS entitlements_user_kind_idx ON entitlements (user_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_source_ref_uq ON entitlements (source_ref) WHERE source_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  subject varchar NOT NULL,
  day varchar NOT NULL,
  feature varchar NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cost_micro_usd bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, day, feature)
);

CREATE TABLE IF NOT EXISTS ai_budget_daily (
  subject varchar NOT NULL,
  day varchar NOT NULL,
  cost_micro_usd bigint NOT NULL DEFAULT 0,
  calls integer NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, day)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamp;

-- prediction_feedbacks was first created with predicted_event / predicted_start_date /
-- predicted_end_date, but the Drizzle table reads and writes prediction_category and
-- predicted_date, so every feedback read and insert failed (42703). Add the columns the code
-- uses and let the old required column be empty; existing rows and columns are kept.
ALTER TABLE prediction_feedbacks ADD COLUMN IF NOT EXISTS prediction_category text;
ALTER TABLE prediction_feedbacks ADD COLUMN IF NOT EXISTS predicted_date timestamp;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'prediction_feedbacks' AND column_name = 'predicted_event') THEN
    ALTER TABLE prediction_feedbacks ALTER COLUMN predicted_event DROP NOT NULL;
  END IF;
END $$;

-- Release B: email verification and Ask question packs. Additive only; see docs/RELEASE_B.md.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  email varchar NOT NULL,
  token_hash varchar NOT NULL,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_hash_uq ON email_verification_tokens (token_hash);
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx ON email_verification_tokens (user_id, created_at);
ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS transaction_id varchar;
`;

const SEED_STORE_SQL = `
INSERT INTO products (name, slug, description, category, price, mrp, rating, sort_order)
SELECT * FROM (VALUES
  ('Natural Yellow Sapphire (Pukhraj)', 'yellow-sapphire-pukhraj', 'Certified 5.25 ratti Pukhraj to strengthen Jupiter — wisdom, prosperity and growth.', 'gemstone', 5100, 7500, 4.7, 0),
  ('Blue Sapphire (Neelam)', 'blue-sapphire-neelam', 'Certified Neelam to harness Saturn''s discipline and rapid results.', 'gemstone', 6800, 9500, 4.6, 1),
  ('5 Mukhi Rudraksha Mala', 'rudraksha-mala-5mukhi', 'Original 108-bead 5 Mukhi Rudraksha mala for peace, focus and protection.', 'rudraksha', 1100, 1800, 4.8, 2),
  ('Shree Yantra (Brass)', 'shree-yantra-brass', 'Energised brass Shree Yantra for wealth and abundance. Hand-finished.', 'yantra', 1499, 2200, 4.7, 3),
  ('7 Chakra Healing Bracelet', 'seven-chakra-bracelet', 'Natural stone bracelet to balance the seven chakras and uplift energy.', 'bracelet', 699, 1200, 4.5, 4),
  ('Red Coral (Moonga)', 'red-coral-moonga', 'Certified Moonga to empower Mars — courage, vitality and drive.', 'gemstone', 3200, 4800, 4.6, 5)
) AS v(name, slug, description, category, price, mrp, rating, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM products LIMIT 1);

INSERT INTO report_types (slug, name, description, category, price, icon, sort_order)
SELECT * FROM (VALUES
  ('career-report', 'Career & Profession Report', 'Detailed analysis of your career path, ideal fields, timing of growth and job vs business.', 'career', 299, 'Briefcase', 0),
  ('marriage-report', 'Marriage & Love Report', 'Insights on marriage timing, partner traits, married life and remedies for harmony.', 'marriage', 349, 'Heart', 1),
  ('finance-report', 'Wealth & Finance Report', 'Your money houses, income sources, investment windows and financial remedies.', 'finance', 299, 'Coins', 2),
  ('year-ahead-report', 'Year Ahead Report', 'Month-by-month predictions for the next 12 months across career, money and relationships.', 'year_ahead', 499, 'CalendarRange', 3)
) AS v(slug, name, description, category, price, icon, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM report_types LIMIT 1);

-- Premium Complete Life Report tier (idempotent: inserts once even on existing DBs)
INSERT INTO report_types (slug, name, description, category, price, icon, sort_order)
SELECT 'complete-life-report', 'Complete Life Report', 'An in-depth life analysis in 40+ sections: every planet & house, yogas, doshas, Sade Sati, the full Vimshottari dasha life-map and personalised remedies.', 'life_complete', 1499, 'BookOpen', -1
WHERE NOT EXISTS (SELECT 1 FROM report_types WHERE slug = 'complete-life-report');

INSERT INTO poojas (slug, name, description, benefits, price, duration_text, sort_order)
SELECT slug, name, description, benefits::text[], price, duration_text, sort_order FROM (VALUES
  ('navagraha-shanti-pooja', 'Navagraha Shanti Pooja', 'Comprehensive pooja to pacify all nine planets and remove obstacles.', ARRAY['Removes planetary doshas','Brings peace & prosperity','Boosts overall fortune'], 2100, 'Performed within 7 days', 0),
  ('mangal-dosha-nivaran', 'Mangal Dosha Nivaran Pooja', 'Special pooja to neutralise Manglik dosha for smooth marriage prospects.', ARRAY['Reduces Mangal dosha effects','Supports marital harmony'], 1800, 'Performed within 7 days', 1),
  ('kaal-sarp-dosh-pooja', 'Kaal Sarp Dosh Pooja', 'Powerful remedy performed at sacred sites to dissolve Kaal Sarp dosha.', ARRAY['Relief from Kaal Sarp dosha','Removes recurring obstacles'], 3100, 'Performed within 10 days', 2),
  ('mahalakshmi-pooja', 'Maha Lakshmi Pooja', 'Invoke Goddess Lakshmi for wealth, abundance and financial stability.', ARRAY['Attracts wealth & abundance','Clears financial blockages'], 1500, 'Performed within 5 days', 3)
) AS v(slug, name, description, benefits, price, duration_text, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM poojas LIMIT 1);
`;

const SEED_COUPONS_SQL = `
INSERT INTO coupons (code, description, discount_type, discount_value, max_discount, min_amount, per_user_limit, first_recharge_only, is_active, show_on_wallet)
SELECT * FROM (VALUES
  ('WELCOME50', 'Get 50% extra on your first recharge (up to ₹100)', 'percent', 50, 100, 100, 1, true, true, true),
  ('ADD20', 'Get 20% extra cashback on any recharge (up to ₹200)', 'percent', 20, 200, 200, 5, false, true, true),
  ('FLAT100', 'Flat ₹100 bonus on recharge of ₹500 or more', 'flat', 100, NULL, 500, 3, false, true, true)
) AS v(code, description, discount_type, discount_value, max_discount, min_amount, per_user_limit, first_recharge_only, is_active, show_on_wallet)
WHERE NOT EXISTS (SELECT 1 FROM coupons LIMIT 1);
`;


/** Homepage free-chat banner; its minutes come from the same constant the billing loop uses. */
export const FREE_CHAT_BANNER = {
  title: 'Your first chat starts free',
  subtitle: `The first ${FREE_CHAT_MINUTES} minutes of your first chat with an astrologer are free. After that, chat is billed per minute.`,
  cta: 'Browse astrologers',
} as const;

/**
 * Corrections to seeded homepage copy that made claims the product does not
 * support. Each statement matches the original seed text exactly, so rows an
 * admin has edited are never touched, and re-running changes nothing.
 */
// Report catalogue corrections. Health and longevity are not predicted, so the Health report
// is withdrawn (existing orders stay readable); descriptions are corrected only while they
// still hold the original seed text.
export const REPORT_CATALOGUE_FIXES: Array<{ text: string; values: unknown[] }> = [
  { text: "UPDATE report_types SET is_active = false WHERE category = 'health' AND is_active IS DISTINCT FROM false", values: [] },
  {
    text: "UPDATE report_types SET description = $1 WHERE slug = 'complete-life-report' AND description = $2",
    values: [
      "An in-depth life analysis in 40+ sections: every planet & house, yogas, doshas, Sade Sati, the full Vimshottari dasha life-map and personalised remedies.",
      "A 50+ page in-depth life analysis: every planet & house, yogas, doshas, Sade Sati, the full Vimshottari dasha life-map and personalised remedies.",
    ],
  },
  {
    text: "UPDATE report_types SET description = $1 WHERE slug = 'year-ahead-report' AND description = $2",
    values: [
      "Month-by-month predictions for the next 12 months across career, money and relationships.",
      "Month-by-month predictions for the next 12 months across all life areas.",
    ],
  },
];

export const HOMEPAGE_COPY_FIXES: Array<{ text: string; values: unknown[] }> = [
  {
    // A generic horoscope presented as "Today's Insight", above a "First chat free" eyebrow.
    text: `UPDATE homepage_content SET title = $1, subtitle = $2, cta = $3, href = '/astrologers'
           WHERE section = 'banner' AND title = 'Today''s Insight'
             AND subtitle = 'Venus guides you toward love and creative flow. Open yourself to positive energy.'
             AND cta = 'Read More'`,
    values: [FREE_CHAT_BANNER.title, FREE_CHAT_BANNER.subtitle, FREE_CHAT_BANNER.cta],
  },
  {
    // There is no premium plan.
    text: `UPDATE homepage_content SET enabled = false
           WHERE section = 'banner' AND title = 'Premium Plan'
             AND subtitle = 'Get unlimited AI insights, priority booking, and exclusive content.'
             AND cta = 'Upgrade Plan' AND enabled = true`,
    values: [],
  },
];

const SEED_HOMEPAGE_SQL = `
INSERT INTO homepage_content (section, title, subtitle, icon, href, gradient, cta, sort_order, enabled)
SELECT * FROM (VALUES
  ('banner', '${FREE_CHAT_BANNER.title}', '${FREE_CHAT_BANNER.subtitle}', NULL, '/astrologers', 'bg-gradient-to-br from-[#8B2252] via-[#C0506A] to-[#D4847A]', '${FREE_CHAT_BANNER.cta}', 0, true),
  ('banner', 'Your Birth Chart', 'Discover your exact planetary positions and dashas for accurate predictions.', NULL, '/kundli/new', 'bg-gradient-to-br from-[#4A1A6B] via-[#6B3FA0] to-[#8B6CC1]', 'Generate', 2, true),
  ('service', 'Chat with Astrologer', NULL, 'MessageCircle', '/astrologers', 'from-pink-500/20 to-rose-500/10', NULL, 0, true),
  ('service', 'Talk to Astrologer', NULL, 'Phone', '/astrologers', 'from-amber-500/20 to-yellow-500/10', NULL, 1, true),
  ('service', 'Book Appointment', NULL, 'Calendar', '/schedule', 'from-violet-500/20 to-purple-500/10', NULL, 2, true),
  ('service', 'Personalized AI Astrology', NULL, 'Zap', '/kundli/new', 'from-emerald-500/20 to-teal-500/10', NULL, 3, true),
  ('free_service', 'Compatibility', 'Check your match score', 'Scale', '/kundli/matchmaking', NULL, NULL, 0, true),
  ('free_service', 'Kundli Match Making', 'Vedic matching', 'Heart', '/kundli/matchmaking', NULL, NULL, 1, true),
  ('free_service', 'Free Kundli', 'Generate birth chart', 'Scroll', '/kundli/new', NULL, NULL, 2, true),
  ('free_service', 'Today''s Horoscope', 'Daily predictions', 'Sun', '#horoscope', NULL, NULL, 3, true)
) AS v(section, title, subtitle, icon, href, gradient, cta, sort_order, enabled)
WHERE NOT EXISTS (SELECT 1 FROM homepage_content LIMIT 1);
`;

// Bootstrap an admin account from ADMIN_EMAIL + ADMIN_PASSWORD so a fresh
// deploy has a guaranteed login. Idempotent: creates the user if missing,
// otherwise syncs the password to the env value. ADMIN_EMAIL is also treated
// as an admin in getAdminEmails(), so this single pair is enough to log in
// and reach /admin/dashboard.
async function seedAdminUser(): Promise<void> {
  const rawEmail = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!rawEmail || !password) return;

  const email = rawEmail.toLowerCase();
  if (password.length < 8) {
    console.warn('[seed] ADMIN_PASSWORD must be at least 8 characters — skipping admin bootstrap');
    return;
  }

  try {
    const found = await storage.getUserByEmail(email);
    // Only the canonical lower-case row is the admin; a case variant is someone else's account.
    const existing = found?.email === email ? found : undefined;
    if (!existing) {
      const user = await storage.createUserWithPassword({ email, password, firstName: 'Admin' });
      await storage.createWallet(user.id).catch(() => {});
      console.log(`[seed] created admin user ${email}`);
      return;
    }

    const matches = existing.passwordHash
      ? await bcrypt.compare(password, existing.passwordHash)
      : false;
    if (!matches) {
      const passwordHash = await bcrypt.hash(password, 12);
      await storage.updateUser(existing.id, { passwordHash, authProvider: 'email' });
      console.log(`[seed] synced admin password for ${email}`);
    }
    await storage.createWallet(existing.id).catch(() => {});
  } catch (err) {
    console.error('[seed] admin bootstrap failed:', err);
  }
}

// Published development defaults. In production they are never seeded, and an account
// still holding them is locked (see retireDefaultProAstrologer).
export const DEMO_PRO_EMAIL = 'pro@navagraha.app';
export const DEMO_PRO_PASSWORD = 'ProDemo@2026';

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * Locks any Pro astrologer that still has the published default password, under the
 * default email or the configured PRO_ASTROLOGER_EMAIL: unlisted, offline, unverified
 * (login refuses it), password replaced, its sessions ended and any live stream closed.
 * The row and everything linked to it are kept, so it can be restored by setting
 * PRO_ASTROLOGER_PASSWORD, which the seed then syncs.
 */
export async function retireDefaultProAstrologer(): Promise<void> {
  const emails = Array.from(new Set([DEMO_PRO_EMAIL, process.env.PRO_ASTROLOGER_EMAIL?.trim().toLowerCase()].filter(Boolean) as string[]));
  for (const email of emails) {
    const demo = await storage.getAstrologerByEmail(email);
    if (!demo || demo.passwordHash !== sha256(DEMO_PRO_PASSWORD)) continue;
    await storage.updateAstrologer(demo.id, {
      passwordHash: sha256(crypto.randomBytes(32).toString('hex')),
      isVerified: false,
      isOnline: false,
      availability: 'offline',
    });
    await pool.query(`DELETE FROM sessions WHERE sess->>'astrologerId' = $1`, [demo.id]);
    await pool.query(`UPDATE live_streams SET status = 'ended', ended_at = now() WHERE astrologer_id = $1 AND status = 'live'`, [demo.id]);
    console.warn(`[seed] locked the Pro astrologer ${email}: it still had the published default password (record kept)`);
  }
}

/** Verified Pro practice account — same login as marketplace, used on /astrologer/pro. */
export async function seedProAstrologer(): Promise<void> {
  const envPassword = process.env.PRO_ASTROLOGER_PASSWORD;
  if (process.env.NODE_ENV === 'production') {
    // Every boot: no account may keep the published password, whatever is configured now.
    try {
      await retireDefaultProAstrologer();
    } catch (err) {
      console.error('[seed] could not lock the default Pro demo astrologer:', err);
    }
    if (!envPassword || envPassword === DEMO_PRO_PASSWORD) {
      if (envPassword) console.warn('[seed] PRO_ASTROLOGER_PASSWORD is the published default — refusing to seed the Pro account in production');
      return;
    }
  }

  const email = (process.env.PRO_ASTROLOGER_EMAIL || DEMO_PRO_EMAIL).trim().toLowerCase();
  const password = envPassword || DEMO_PRO_PASSWORD;
  const name = process.env.PRO_ASTROLOGER_NAME || 'Pro Demo Astrologer';

  if (password.length < 8) {
    console.warn('[seed] PRO_ASTROLOGER_PASSWORD must be at least 8 characters — skipping Pro bootstrap');
    return;
  }

  const passwordHash = sha256(password);

  try {
    const existing = await storage.getAstrologerByEmail(email);
    if (!existing) {
      const created = await storage.createAstrologerWithPassword({
        name,
        email,
        password,
        phoneNumber: '+919999000001',
      });
      await storage.updateAstrologer(created.id, {
        isVerified: true,
        kycStatus: 'approved',
        specializations: ['Vedic', 'Kundli', 'Career'],
        experience: 10,
        pricePerMinute: '25',
        languages: ['English', 'Hindi'],
        about: 'Seeded Navagraha Pro practice account for chart + AI co-pilot sessions.',
      });
      console.log(`[seed] created Pro astrologer ${email} (verified)`);
      return;
    }

    const needsPassword = existing.passwordHash !== passwordHash;
    const needsVerify = !existing.isVerified;
    if (needsPassword || needsVerify) {
      await storage.updateAstrologer(existing.id, {
        ...(needsPassword ? { passwordHash } : {}),
        isVerified: true,
        kycStatus: existing.kycStatus === 'approved' ? existing.kycStatus : 'approved',
      });
      console.log(`[seed] synced Pro astrologer ${email}${needsPassword ? ' (password)' : ''}${needsVerify ? ' (verified)' : ''}`);
    }
  } catch (err) {
    console.error('[seed] Pro astrologer bootstrap failed:', err);
  }
}

// One credit per gateway payment and per completed recharge order. Each index is guarded:
// if historical duplicates exist it is skipped with a warning instead of failing boot
// (settlement is still claim-once without it); find them with the query in the warning.
const PAYMENT_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS transactions_gateway_order_id_idx ON transactions (gateway_order_id);
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS transactions_gateway_payment_id_uq
    ON transactions (gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'transactions_gateway_payment_id_uq skipped: duplicate gateway_payment_id rows exist (SELECT gateway_payment_id, count(*) FROM transactions WHERE gateway_payment_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1)';
END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_transaction_uq
    ON coupon_redemptions (transaction_id) WHERE transaction_id IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'coupon_redemptions_transaction_uq skipped: a transaction has more than one coupon redemption (SELECT transaction_id, count(*) FROM coupon_redemptions WHERE transaction_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1)';
END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS transactions_completed_recharge_order_uq
    ON transactions (gateway_order_id) WHERE type = 'recharge' AND status = 'completed' AND gateway_order_id IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'transactions_completed_recharge_order_uq skipped: an order was credited more than once (SELECT gateway_order_id, count(*) FROM transactions WHERE type = ''recharge'' AND status = ''completed'' GROUP BY 1 HAVING count(*) > 1)';
END $$;
`;

// One astrologer earning per consultation. Guarded: historical duplicates skip the index
// with a warning instead of failing boot (the route still checks before inserting).
const EARNINGS_INDEX_SQL = `
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS astrologer_earnings_consultation_uq
    ON astrologer_earnings (consultation_id) WHERE consultation_id IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'astrologer_earnings_consultation_uq skipped: a consultation has more than one earning (SELECT consultation_id, count(*) FROM astrologer_earnings GROUP BY 1 HAVING count(*) > 1)';
END $$;
`;

// Release A deployment guard, enforced by the database so it holds for any code that writes
// recharges — including an older build still running during a deploy, or after a rollback:
//  - a Razorpay recharge order must record the paise it was created for (pre-Release A order
//    creation, which mis-recorded string amounts, fails before the payer can pay);
//  - a Razorpay recharge becomes completed only through verified settlement, which sets
//    settlement_verified_at (older settlement code fails and rolls back its credit; Razorpay
//    retries the webhook, and the new code or the reconciler settles it);
//  - direct Snapmint/LazyPay recharges, which were credited from the callback, are refused.
// Rows that existed before the guard are untouched. Removing the guard is a deliberate act
// (docs/RELEASE_A.md), never part of a code rollback.
export const RECHARGE_GUARD_SQL = `
CREATE OR REPLACE FUNCTION release_a_recharge_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'recharge' AND NEW.status = 'completed' AND NEW.payment_method IN ('snapmint', 'lazypay')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    RAISE EXCEPTION 'release_a_recharge_guard: direct BNPL recharges are disabled';
  END IF;
  IF NEW.type = 'recharge' AND NEW.payment_method = 'razorpay' THEN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' AND NEW.gateway_amount_paise IS NULL THEN
      RAISE EXCEPTION 'release_a_recharge_guard: a recharge order must record gateway_amount_paise';
    END IF;
    IF NEW.status = 'completed' AND NEW.settlement_verified_at IS NULL
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
      RAISE EXCEPTION 'release_a_recharge_guard: a recharge is completed only by verified settlement';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS release_a_recharge_guard ON transactions;
CREATE TRIGGER release_a_recharge_guard BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION release_a_recharge_guard();
`;

export async function runMigrations(): Promise<void> {
  await pool.query(SCHEMA_SQL);
  await pool.query(PAYMENT_INDEXES_SQL);
  await pool.query(RECHARGE_GUARD_SQL);
  await pool.query(SEED_HOMEPAGE_SQL);
  for (const fix of HOMEPAGE_COPY_FIXES) await pool.query(fix.text, fix.values);
  await pool.query(SEED_COUPONS_SQL);
  await pool.query(SEED_STORE_SQL);
  for (const fix of REPORT_CATALOGUE_FIXES) await pool.query(fix.text, fix.values);
  await pool.query(EARNINGS_INDEX_SQL);
  await seedAdminUser();
  await seedProAstrologer();
  if (!features.marketplace()) {
    try {
      await closeMarketplaceActivity();
    } catch (err) {
      console.error('[marketplace] closing open activity failed:', err);
    }
  }
  console.log('[migrate] Schema initialised successfully');
}
