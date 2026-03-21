import { pool } from './db';

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

export async function runMigrations(): Promise<void> {
  await pool.query(SCHEMA_SQL);
  await pool.query(SEED_HOMEPAGE_SQL);
  console.log('[migrate] Schema initialised successfully');
}
