-- Shared Steam login state for Checkpoint. All rows are short-lived.
CREATE TABLE IF NOT EXISTS login_states (
  state TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  return_url TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS used_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_codes (
  code_hash TEXT PRIMARY KEY,
  steam_id TEXT NOT NULL,
  challenge TEXT NOT NULL,
  origin TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS import_tokens (
  token_hash TEXT PRIMARY KEY,
  steam_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
