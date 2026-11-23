CREATE TABLE project_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('project.created','project.updated','project.archived','project.restored','member.added','member.removed','session.created','session.started','session.ended','session.cancelled')),
  target_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX project_activity_page ON project_activity(project_id, created_at DESC, id DESC);
CREATE INDEX project_activity_filter ON project_activity(project_id, action, created_at DESC, id DESC);
