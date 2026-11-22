-- Shared Xbox login state for Checkpoint. All rows are short-lived; no Microsoft or Xbox tokens are stored.
CREATE TABLE IF NOT EXISTS xbox_login_states (
  state TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  ms_verifier TEXT NOT NULL,
  return_url TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS xbox_login_codes (
  code_hash TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  origin TEXT NOT NULL,
  gamertag TEXT NOT NULL,
  library TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS xbox_import_tokens (
  token_hash TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  gamertag TEXT NOT NULL,
  library TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
