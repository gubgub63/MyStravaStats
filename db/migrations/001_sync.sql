CREATE TABLE IF NOT EXISTS mystats_athletes (
  id bigint PRIMARY KEY,
  profile jsonb NOT NULL,
  credentials text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mystats_sessions (
  token_hash text PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  athlete_id bigint NOT NULL REFERENCES mystats_athletes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('web','mobile')),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS mystats_sessions_athlete ON mystats_sessions(athlete_id);
CREATE TABLE IF NOT EXISTS mystats_oauth (
  state_hash text PRIMARY KEY,
  challenge text NOT NULL,
  expires_at timestamptz NOT NULL,
  code_hash text UNIQUE,
  athlete_id bigint REFERENCES mystats_athletes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS mystats_workspaces (
  athlete_id bigint PRIMARY KEY REFERENCES mystats_athletes(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  season jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
