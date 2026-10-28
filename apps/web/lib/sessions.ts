export interface GameSession {
  id: string;
  projectId: string;
  name: string;
  maxPlayers: number;
  activePlayers: number;
  state: 'LOBBY' | 'RUNNING' | 'ENDED';
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  endReason: 'COMPLETED' | 'CANCELLED' | null;
}
export interface SessionDetail extends GameSession {
  participants: { id: string; name: string; joinedAt: string }[];
}
export function sessionLabel(session: GameSession) {
  return session.endReason === 'CANCELLED'
    ? 'Cancelled'
    : { LOBBY: 'Lobby', RUNNING: 'Running', ENDED: 'Ended' }[session.state];
}
