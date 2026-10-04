CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  formato TEXT NOT NULL,
  label TEXT NOT NULL,
  icon TEXT NOT NULL,
  rede TEXT[] NOT NULL DEFAULT '{}',
  data_programada TEXT,
  hook TEXT NOT NULL,
  slides JSONB,
  status TEXT NOT NULL DEFAULT 'pendente',
  feedback TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rounds_client ON rounds(client_id);
CREATE INDEX IF NOT EXISTS idx_posts_round ON posts(round_id);

-- seed: cliente fictício pra teste
INSERT INTO clients (brand_name, username, password_hash)
VALUES ('Clínica Luz Estética', 'clinicaluz', 'SEED_NO_LOGIN')
ON CONFLICT (username) DO NOTHING;
