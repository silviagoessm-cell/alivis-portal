-- perfil do cliente na página de aprovação (estilo Instagram)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS handle TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_key TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cover_key TEXT;
