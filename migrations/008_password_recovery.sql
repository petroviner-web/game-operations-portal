ALTER TABLE users ADD COLUMN reset_digest text, ADD COLUMN reset_expires_at timestamptz;
CREATE UNIQUE INDEX users_reset_digest ON users(reset_digest) WHERE reset_digest IS NOT NULL;
