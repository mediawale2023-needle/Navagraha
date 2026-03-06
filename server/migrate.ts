import { Pool } from 'pg';

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
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

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
`;

export async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(SCHEMA_SQL);
    console.log('[migrate] Schema initialised successfully');
  } catch (err) {
    console.error('[migrate] Schema initialisation failed:', err);
    throw err;
  } finally {
    await pool.end();
  }
}
