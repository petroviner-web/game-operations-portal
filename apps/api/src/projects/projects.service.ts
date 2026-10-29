import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { CreateProject, ListProjects, UpdateProject } from './projects.validation';

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  engine: CreateProject['engine'];
  version: number;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
  access_role?: 'owner' | 'developer';
}
function projectView(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    engine: row.engine,
    version: row.version,
    state: row.archived_at ? 'archived' : 'active',
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at?.toISOString() ?? null,
    role: row.access_role ?? 'owner',
  };
}
function missing(): never {
  throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Project not found.' });
}
function checkVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This project changed in another tab. Reload the latest version before saving.',
    });
}

@Injectable()
export class ProjectsService {
  constructor(private readonly db: DatabaseService) {}

  async create(ownerId: string, input: CreateProject) {
    const result = await this.db.query<ProjectRow>(
      'INSERT INTO projects (owner_id, name, description, engine) VALUES ($1, $2, $3, $4) RETURNING *',
      [ownerId, input.name, input.description, input.engine],
    );
    return projectView(result.rows[0]!);
  }

  async list(ownerId: string, input: ListProjects) {
    // Keep timestamp precision in PostgreSQL. The cursor is the immutable project ID.
    if (input.cursor) {
      const cursor = await this.db.query(
        'SELECT 1 FROM projects p WHERE (p.owner_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1)) AND p.id=$2',
        [ownerId, input.cursor],
      );
      if (!cursor.rowCount)
        throw new BadRequestException({
          code: 'INVALID_CURSOR',
          message: 'Invalid page cursor. Return to the first page.',
        });
    }
    const result = await this.db.query<ProjectRow>(
      `
      SELECT p.*, CASE WHEN p.owner_id=$1 THEN 'owner' ELSE 'developer' END AS access_role FROM projects p
      WHERE (p.owner_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1))
        AND ($2='all' OR ($2='active' AND p.archived_at IS NULL) OR ($2='archived' AND p.archived_at IS NOT NULL))
        AND ($3::uuid IS NULL OR (p.created_at, p.id) <
          (SELECT c.created_at, c.id FROM projects c WHERE (c.owner_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=c.id AND m.user_id=$1)) AND c.id=$3))
      ORDER BY p.created_at DESC, p.id DESC LIMIT $4`,
      [ownerId, input.state, input.cursor ?? null, input.limit + 1],
    );
    const rows = result.rows.slice(0, input.limit);
    return {
      items: rows.map(projectView),
      nextCursor: result.rows.length > input.limit ? rows.at(-1)!.id : null,
    };
  }

  async get(ownerId: string, id: string) {
    const result = await this.db.query<ProjectRow>(
      "SELECT p.*, CASE WHEN p.owner_id=$1 THEN 'owner' ELSE 'developer' END AS access_role FROM projects p WHERE (p.owner_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1)) AND p.id=$2",
      [ownerId, id],
    );
    return projectView(result.rows[0] ?? missing());
  }

  async update(ownerId: string, id: string, input: UpdateProject) {
    return this.db.transaction(async (client) => {
      const found = await client.query<ProjectRow>(
        'SELECT * FROM projects WHERE id=$1 FOR UPDATE',
        [id],
      );
      const current = found.rows[0] ?? missing();
      const access = await client.query<{ access_role: 'owner' | 'developer' }>(
        "SELECT CASE WHEN owner_id=$1 THEN 'owner' ELSE 'developer' END AS access_role FROM projects p WHERE id=$2 AND (owner_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1))",
        [ownerId, id],
      );
      if (!access.rowCount) missing();
      if (current.archived_at)
        throw new ConflictException({
          code: 'PROJECT_ARCHIVED',
          message: 'Restore this project before editing it.',
        });
      checkVersion(current.version, input.version);
      const result = await client.query<ProjectRow>(
        `
        UPDATE projects SET name=$3, description=$4, engine=$5, version=version+1, updated_at=clock_timestamp()
        WHERE id=$2 AND (owner_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=projects.id AND m.user_id=$1)) RETURNING *`,
        [
          ownerId,
          id,
          input.name ?? current.name,
          input.description ?? current.description,
          input.engine ?? current.engine,
        ],
      );
      return projectView({ ...result.rows[0]!, access_role: access.rows[0]!.access_role });
    });
  }

  async members(owner: string, id: string) {
    const result = await this.db.query<{ id: string; email: string; created_at: Date }>(
      'SELECT u.id,u.email_normalized AS email,m.created_at FROM projects p JOIN project_members m ON m.project_id=p.id JOIN users u ON u.id=m.user_id WHERE p.id=$2 AND p.owner_id=$1 ORDER BY m.created_at,u.id',
      [owner, id],
    );
    const project = await this.db.query('SELECT 1 FROM projects WHERE id=$2 AND owner_id=$1', [
      owner,
      id,
    ]);
    if (!project.rowCount) missing();
    return result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: 'developer',
      createdAt: row.created_at.toISOString(),
    }));
  }

  async addMember(owner: string, id: string, email: string) {
    return this.db.transaction(async (client) => {
      const project = await client.query<{ archived_at: Date | null }>(
        'SELECT archived_at FROM projects WHERE id=$2 AND owner_id=$1 FOR UPDATE',
        [owner, id],
      );
      if (!project.rowCount) missing();
      if (project.rows[0]!.archived_at)
        throw new ConflictException({
          code: 'PROJECT_ARCHIVED',
          message: 'Restore the project before changing members.',
        });
      // Generic result avoids a direct account-existence response. The owner may inspect members afterwards.
      await client.query(
        'INSERT INTO project_members(project_id,user_id) SELECT $1,u.id FROM users u WHERE u.email_normalized=$2 AND u.id<>$3 ON CONFLICT DO NOTHING',
        [id, email, owner],
      );
      return { message: 'If an eligible account exists, it has been added as a developer.' };
    });
  }

  async removeMember(owner: string, id: string, userId: string) {
    return this.db.transaction(async (client) => {
      const project = await client.query(
        'SELECT 1 FROM projects WHERE id=$2 AND owner_id=$1 FOR UPDATE',
        [owner, id],
      );
      if (!project.rowCount) missing();
      await client.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [
        id,
        userId,
      ]);
      return { message: 'Access removed.' };
    });
  }

  async setArchived(ownerId: string, id: string, version: number, archived: boolean) {
    return this.db.transaction(async (client) => {
      const found = await client.query<ProjectRow>(
        'SELECT * FROM projects WHERE owner_id=$1 AND id=$2 FOR UPDATE',
        [ownerId, id],
      );
      const current = found.rows[0] ?? missing();
      // Repeating an already-applied transition is safe after a lost HTTP response.
      if (Boolean(current.archived_at) === archived) return projectView(current);
      checkVersion(current.version, version);
      if (archived) {
        const open = await client.query(
          "SELECT 1 FROM game_sessions WHERE project_id=$1 AND state <> 'ENDED' LIMIT 1",
          [id],
        );
        if (open.rowCount)
          throw new ConflictException({
            code: 'OPEN_SESSIONS',
            message: 'End running sessions and cancel open lobbies before archiving this project.',
          });
      }
      const result = await client.query<ProjectRow>(
        `
        UPDATE projects SET archived_at=CASE WHEN $3 THEN clock_timestamp() ELSE NULL END,
          version=version+1, updated_at=clock_timestamp()
        WHERE owner_id=$1 AND id=$2 RETURNING *`,
        [ownerId, id, archived],
      );
      return projectView(result.rows[0]!);
    });
  }
}
