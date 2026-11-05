-- acesso do cliente por link (sem senha)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS link_token TEXT;
UPDATE clients SET link_token = encode(gen_random_bytes(24), 'hex') WHERE link_token IS NULL;
ALTER TABLE clients ALTER COLUMN link_token SET DEFAULT encode(gen_random_bytes(24), 'hex');
ALTER TABLE clients ALTER COLUMN link_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_link_token ON clients(link_token);
ALTER TABLE clients ALTER COLUMN username DROP NOT NULL;
ALTER TABLE clients ALTER COLUMN password_hash DROP NOT NULL;
