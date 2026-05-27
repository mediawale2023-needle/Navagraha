import bcrypt from 'bcryptjs';
import { pool } from './db';
import { storage } from './storage';

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

CREATE TABLE IF NOT EXISTS prediction_feedbacks (
  id serial PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id),
  kundli_id varchar REFERENCES kundlis(id),
  predicted_event text NOT NULL,
  predicted_start_date timestamp,
  predicted_end_date timestamp,
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
  ('year-ahead-report', 'Year Ahead Report', 'Month-by-month predictions for the next 12 months across all life areas.', 'year_ahead', 499, 'CalendarRange', 3),
  ('health-report', 'Health & Wellbeing Report', 'Constitution analysis, vulnerable periods and lifestyle/astro remedies.', 'health', 249, 'Activity', 4)
) AS v(slug, name, description, category, price, icon, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM report_types LIMIT 1);

-- Premium Complete Life Report tier (idempotent: inserts once even on existing DBs)
INSERT INTO report_types (slug, name, description, category, price, icon, sort_order)
SELECT 'complete-life-report', 'Complete Life Report', 'A 50+ page in-depth life analysis: every planet & house, yogas, doshas, Sade Sati, the full Vimshottari dasha life-map and personalised remedies.', 'life_complete', 1499, 'BookOpen', -1
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


const SEED_HOMEPAGE_SQL = `
INSERT INTO homepage_content (section, title, subtitle, icon, href, gradient, cta, sort_order, enabled)
SELECT * FROM (VALUES
  ('banner', 'Today''s Insight', 'Venus guides you toward love and creative flow. Open yourself to positive energy.', NULL, '/astrologers', 'bg-gradient-to-br from-[#8B2252] via-[#C0506A] to-[#D4847A]', 'Read More', 0, true),
  ('banner', 'Premium Plan', 'Get unlimited AI insights, priority booking, and exclusive content.', NULL, '/wallet', 'bg-gradient-to-br from-[#8B2252] via-[#C0506A] to-[#D4847A]', 'Upgrade Plan', 1, true),
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
    const existing = await storage.getUserByEmail(email);
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

export async function runMigrations(): Promise<void> {
  await pool.query(SCHEMA_SQL);
  await pool.query(SEED_HOMEPAGE_SQL);
  await pool.query(SEED_COUPONS_SQL);
  await pool.query(SEED_STORE_SQL);
  await seedAdminUser();
  console.log('[migrate] Schema initialised successfully');
}
