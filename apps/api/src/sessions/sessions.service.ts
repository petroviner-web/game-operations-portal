import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import type { CreateSession, JoinSession, ListSessions } from './sessions.validation';

interface SessionRow {
  id: string;
  project_id: string;
  name: string;
  max_players: number;
  state: 'LOBBY' | 'RUNNING' | 'ENDED';
  created_at: Date;
  started_at: Date | null;
  ended_at: Date | null;
  end_reason: 'COMPLETED' | 'CANCELLED' | null;
  active_players: number;
  participants?: { id: string; name: string; joinedAt: string }[];
}
const activeCount = `(SELECT count(*)::int FROM session_participants sp WHERE sp.session_id=s.id AND sp.left_at IS NULL) AS active_players`;
const activeRoster = `COALESCE((SELECT jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'joinedAt', sp.joined_at) ORDER BY sp.joined_at, sp.id)
  FROM session_participants sp WHERE sp.session_id=s.id AND sp.left_at IS NULL),'[]'::jsonb) AS participants`;
function view(row: SessionRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    maxPlayers: row.max_players,
    state: row.state,
    createdAt: row.created_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    endedAt: row.ended_at?.toISOString() ?? null,
    endReason: row.end_reason,
    activePlayers: row.active_players,
    ...(row.participants ? { participants: row.participants } : {}),
  };
}
function missing(): never {
  throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'Session not found.' });
}
function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

@Injectable()
export class SessionsService {
  constructor(private readonly db: DatabaseService) {}

  private async lockProject(client: PoolClient, owner: string, project: string) {
    // Shared project lock first, session lock second. Archive takes an exclusive project lock.
    const result = await client.query<{ archived_at: Date | null }>(
      'SELECT archived_at FROM projects WHERE id=$1 FOR SHARE',
      [project],
    );
    if (!result.rows[0]) missing();
    const access = await client.query(
      'SELECT 1 FROM projects p WHERE p.id=$2 AND (p.owner_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1))',
      [owner, project],
    );
    if (!access.rowCount) missing();
    return result.rows[0];
  }
  private async snapshot(client: PoolClient, project: string, id: string) {
    const result = await client.query<SessionRow>(
      `SELECT s.*, ${activeCount}, ${activeRoster} FROM game_sessions s WHERE s.project_id=$1 AND s.id=$2`,
      [project, id],
    );
    return view(result.rows[0] ?? missing());
  }
  async create(owner: string, project: string, input: CreateSession) {
    return this.db.transaction(async (client) => {
      const parent = await this.lockProject(client, owner, project);
      if (parent.archived_at)
        conflict('PROJECT_ARCHIVED', 'Restore the project before creating a session.');
      const result = await client.query<{ id: string }>(
        'INSERT INTO game_sessions(project_id,name,max_players) VALUES ($1,$2,$3) RETURNING id',
        [project, input.name, input.maxPlayers],
      );
      return this.snapshot(client, project, result.rows[0]!.id);
    });
  }
  async list(owner: string, project: string, input: ListSessions) {
    const parent = await this.db.query(
      'SELECT 1 FROM projects p WHERE (p.owner_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1)) AND p.id=$2',
      [owner, project],
    );
    if (!parent.rowCount) missing();
    if (input.cursor) {
      const cursor = await this.db.query(
        'SELECT 1 FROM game_sessions s JOIN projects p ON p.id=s.project_id WHERE (p.owner_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1)) AND p.id=$2 AND s.id=$3',
        [owner, project, input.cursor],
      );
      if (!cursor.rowCount)
        throw new BadRequestException({
          code: 'INVALID_CURSOR',
          message: 'Invalid session page. Return to the first page.',
        });
    }
    const result = await this.db.query<SessionRow>(
      `SELECT s.*, ${activeCount} FROM game_sessions s JOIN projects p ON p.id=s.project_id
      WHERE (p.owner_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1)) AND p.id=$2 AND ($3::uuid IS NULL OR (s.created_at,s.id)<
        (SELECT c.created_at,c.id FROM game_sessions c WHERE c.project_id=$2 AND c.id=$3))
      ORDER BY s.created_at DESC,s.id DESC LIMIT $4`,
      [owner, project, input.cursor ?? null, input.limit + 1],
    );
    const rows = result.rows.slice(0, input.limit);
    return {
      items: rows.map(view),
      nextCursor: result.rows.length > input.limit ? rows.at(-1)!.id : null,
    };
  }
  async get(owner: string, project: string, id: string) {
    // One SQL statement gives state and roster from the same database snapshot.
    const result = await this.db.query<SessionRow>(
      `SELECT s.*, ${activeCount}, ${activeRoster} FROM game_sessions s JOIN projects p ON p.id=s.project_id
      WHERE (p.owner_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1)) AND p.id=$2 AND s.id=$3`,
      [owner, project, id],
    );
    return view(result.rows[0] ?? missing());
  }
  private async mutate(
    owner: string,
    project: string,
    id: string,
    work: (client: PoolClient, session: SessionRow) => Promise<void>,
  ) {
    return this.db.transaction(async (client) => {
      const parent = await this.lockProject(client, owner, project);
      const result = await client.query<SessionRow>(
        'SELECT * FROM game_sessions WHERE project_id=$1 AND id=$2 FOR UPDATE',
        [project, id],
      );
      const session = result.rows[0] ?? missing();
      if (parent.archived_at)
        conflict('PROJECT_ARCHIVED', 'Restore this project before changing its sessions.');
      await work(client, session);
      return this.snapshot(client, project, id);
    });
  }
  join(owner: string, project: string, id: string, input: JoinSession) {
    return this.mutate(owner, project, id, async (client, session) => {
      const previous = await client.query<{ name: string; left_at: Date | null }>(
        'SELECT name,left_at FROM session_participants WHERE session_id=$1 AND id=$2',
        [id, input.id],
      );
      const player = previous.rows[0];
      if (player) {
        if (player.name !== input.name)
          conflict('PLAYER_ID_CONFLICT', 'This player ID already belongs to another join request.');
        if (player.left_at)
          conflict(
            'PLAYER_LEFT',
            'This player has already left. Use a new player ID to join again.',
          );
        return;
      }
      if (session.state !== 'LOBBY')
        conflict('LOBBY_REQUIRED', 'New players can join only while the session is in the lobby.');
      const count = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM session_participants WHERE session_id=$1 AND left_at IS NULL',
        [id],
      );
      if (count.rows[0]!.count >= session.max_players)
        conflict('SESSION_FULL', 'The lobby is full. Remove a player before adding another.');
      await client.query('INSERT INTO session_participants(session_id,id,name) VALUES ($1,$2,$3)', [
        id,
        input.id,
        input.name,
      ]);
    });
  }
  leave(owner: string, project: string, id: string, playerId: string) {
    return this.mutate(owner, project, id, async (client) => {
      const player = await client.query(
        'SELECT 1 FROM session_participants WHERE session_id=$1 AND id=$2',
        [id, playerId],
      );
      if (!player.rowCount)
        throw new NotFoundException({ code: 'PLAYER_NOT_FOUND', message: 'Player not found.' });
      await client.query(
        'UPDATE session_participants SET left_at=clock_timestamp() WHERE session_id=$1 AND id=$2 AND left_at IS NULL',
        [id, playerId],
      );
    });
  }
  transition(owner: string, project: string, id: string, action: 'start' | 'end' | 'cancel') {
    return this.mutate(owner, project, id, async (client, session) => {
      if (action === 'start') {
        if (session.state === 'RUNNING') return;
        if (session.state !== 'LOBBY')
          conflict(
            'INVALID_TRANSITION',
            'An ended session cannot be restarted. Create a new lobby.',
          );
        const count = await client.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM session_participants WHERE session_id=$1 AND left_at IS NULL',
          [id],
        );
        if (count.rows[0]!.count < 2)
          conflict('NOT_ENOUGH_PLAYERS', 'Add at least two players before starting.');
        await client.query(
          "UPDATE game_sessions SET state='RUNNING', started_at=clock_timestamp() WHERE id=$1",
          [id],
        );
        return;
      }
      const reason = action === 'end' ? 'COMPLETED' : 'CANCELLED';
      if (session.state === 'ENDED' && session.end_reason === reason) return;
      if (session.state !== (action === 'end' ? 'RUNNING' : 'LOBBY'))
        conflict(
          'INVALID_TRANSITION',
          action === 'end'
            ? 'Start the session before ending it, or cancel its lobby.'
            : 'Only a lobby can be cancelled. End a running session instead.',
        );
      await client.query(
        "UPDATE game_sessions SET state='ENDED', ended_at=clock_timestamp(), end_reason=$2 WHERE id=$1",
        [id, reason],
      );
      await client.query(
        'UPDATE session_participants SET left_at=(SELECT ended_at FROM game_sessions WHERE id=$1) WHERE session_id=$1 AND left_at IS NULL',
        [id],
      );
    });
  }
}
