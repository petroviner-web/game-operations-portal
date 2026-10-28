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
      const cursor = await this.db.query('SELECT 1 FROM projects WHERE owner_id=$1 AND id=$2', [
        ownerId,
        input.cursor,
      ]);
      if (!cursor.rowCount)
        throw new BadRequestException({
          code: 'INVALID_CURSOR',
          message: 'Invalid page cursor. Return to the first page.',
        });
    }
    const result = await this.db.query<ProjectRow>(
      `
      SELECT * FROM projects p
      WHERE p.owner_id=$1
        AND ($2='all' OR ($2='active' AND p.archived_at IS NULL) OR ($2='archived' AND p.archived_at IS NOT NULL))
        AND ($3::uuid IS NULL OR (p.created_at, p.id) <
          (SELECT c.created_at, c.id FROM projects c WHERE c.owner_id=$1 AND c.id=$3))
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
      'SELECT * FROM projects WHERE owner_id=$1 AND id=$2',
      [ownerId, id],
    );
    return projectView(result.rows[0] ?? missing());
  }

  async update(ownerId: string, id: string, input: UpdateProject) {
    return this.db.transaction(async (client) => {
      const found = await client.query<ProjectRow>(
        'SELECT * FROM projects WHERE owner_id=$1 AND id=$2 FOR UPDATE',
        [ownerId, id],
      );
      const current = found.rows[0] ?? missing();
      if (current.archived_at)
        throw new ConflictException({
          code: 'PROJECT_ARCHIVED',
          message: 'Restore this project before editing it.',
        });
      checkVersion(current.version, input.version);
      const result = await client.query<ProjectRow>(
        `
        UPDATE projects SET name=$3, description=$4, engine=$5, version=version+1, updated_at=clock_timestamp()
        WHERE owner_id=$1 AND id=$2 RETURNING *`,
        [
          ownerId,
          id,
          input.name ?? current.name,
          input.description ?? current.description,
          input.engine ?? current.engine,
        ],
      );
      return projectView(result.rows[0]!);
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
