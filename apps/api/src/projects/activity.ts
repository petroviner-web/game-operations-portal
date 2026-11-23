import type { PoolClient } from 'pg';
import { z } from 'zod';

export const activityActions = [
  'project.created',
  'project.updated',
  'project.archived',
  'project.restored',
  'member.added',
  'member.removed',
  'session.created',
  'session.started',
  'session.ended',
  'session.cancelled',
] as const;
export const activityQuerySchema = z
  .object({
    action: z.enum(activityActions).optional(),
    cursor: z.uuid().optional(),
    limit: z
      .string()
      .regex(/^[1-9]\d?$/)
      .transform(Number)
      .pipe(z.number().max(50))
      .default(20),
  })
  .strict();
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

// Call only after authorization, using the mutation's transaction client.
export async function recordActivity(
  client: PoolClient,
  project: string,
  actor: string,
  action: (typeof activityActions)[number],
  target: string | null = null,
) {
  await client.query(
    'INSERT INTO project_activity(project_id,actor_id,action,target_id) VALUES ($1,$2,$3,$4)',
    [project, actor, action, target],
  );
}
