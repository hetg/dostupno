-- Shared cache of image descriptions.
-- key: sha256(PROMPT_VERSION | MODEL | imageUrl). Successes never expire (the key changes with
-- the prompt or model); "unsupported image" results expire after a day (expires_at).
CREATE TABLE IF NOT EXISTS descriptions (
  key TEXT PRIMARY KEY,
  alt TEXT,
  decorative INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);
