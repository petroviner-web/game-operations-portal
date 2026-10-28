CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  engine text NOT NULL CHECK (engine IN ('UNREAL', 'UNITY', 'GODOT', 'CUSTOM')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX projects_owner_order_idx ON projects (owner_id, created_at DESC, id DESC);
CREATE INDEX projects_owner_active_order_idx ON projects (owner_id, created_at DESC, id DESC)
  WHERE archived_at IS NULL;
