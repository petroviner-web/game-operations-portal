export const engines = {
  UNREAL: 'Unreal Engine',
  UNITY: 'Unity',
  GODOT: 'Godot',
  CUSTOM: 'Custom engine',
} as const;
export interface Project {
  id: string;
  name: string;
  description: string;
  engine: keyof typeof engines;
  state: 'active' | 'archived';
  role: 'owner' | 'developer';
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}
export interface ProjectPage {
  items: Project[];
  nextCursor: string | null;
}
export function formatProjectDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value),
  );
}
