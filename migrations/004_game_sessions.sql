CREATE TABLE game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  max_players integer NOT NULL CHECK (max_players BETWEEN 2 AND 32),
  state text NOT NULL DEFAULT 'LOBBY' CHECK (state IN ('LOBBY','RUNNING','ENDED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  CHECK (started_at IS NULL OR started_at >= created_at),
  CHECK (ended_at IS NULL OR ended_at >= COALESCE(started_at, created_at)),
  CHECK (
    (state='LOBBY' AND started_at IS NULL AND ended_at IS NULL AND end_reason IS NULL) OR
    (state='RUNNING' AND started_at IS NOT NULL AND ended_at IS NULL AND end_reason IS NULL) OR
    (state='ENDED' AND ended_at IS NOT NULL AND end_reason IS NOT NULL AND
      ((end_reason='COMPLETED' AND started_at IS NOT NULL) OR (end_reason='CANCELLED' AND started_at IS NULL)))
  )
);
CREATE INDEX game_sessions_project_order_idx ON game_sessions(project_id, created_at DESC, id DESC);
CREATE INDEX game_sessions_open_project_idx ON game_sessions(project_id) WHERE state <> 'ENDED';

CREATE TABLE session_participants (
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 40),
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  left_at timestamptz,
  PRIMARY KEY (session_id, id),
  CHECK (left_at IS NULL OR left_at >= joined_at)
);
CREATE INDEX session_participants_active_idx ON session_participants(session_id, joined_at, id) WHERE left_at IS NULL;
