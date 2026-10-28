import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
export const sessionActionSchema = z.enum(['start', 'end', 'cancel']);
export function parseSessionInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Check the session fields and action.',
    fieldErrors: z.flattenError(result.error).fieldErrors,
  });
}
export const createSessionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    maxPlayers: z.number().int().min(2).max(32),
  })
  .strict();
export const joinSessionSchema = z
  .object({ id: z.uuid(), name: z.string().trim().min(1).max(40) })
  .strict();
export const emptySessionSchema = z.object({}).strict();
export const listSessionsSchema = z
  .object({
    limit: z
      .string()
      .regex(/^[1-9]\d?$/)
      .transform(Number)
      .pipe(z.number().max(50))
      .default(10),
    cursor: z.uuid().optional(),
  })
  .strict();
export type CreateSession = z.infer<typeof createSessionSchema>;
export type JoinSession = z.infer<typeof joinSessionSchema>;
export type ListSessions = z.infer<typeof listSessionsSchema>;
