import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const fields = {
  name: z
    .string()
    .trim()
    .min(1, 'Enter a project name.')
    .max(100, 'Use no more than 100 characters.'),
  description: z.string().max(2000, 'Use no more than 2,000 characters.'),
  engine: z.enum(['UNREAL', 'UNITY', 'GODOT', 'CUSTOM']),
};
export const addMemberSchema = z
  .object({ email: z.string().trim().toLowerCase().max(254).email() })
  .strict();
export const createProjectSchema = z
  .object({ ...fields, description: fields.description.default('') })
  .strict();
export const versionSchema = z
  .object({ version: z.number().int().positive().max(2147483646) })
  .strict();
export const updateProjectSchema = z
  .object({
    name: fields.name.optional(),
    description: fields.description.optional(),
    engine: fields.engine.optional(),
    version: versionSchema.shape.version,
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined || value.description !== undefined || value.engine !== undefined,
    { message: 'Provide at least one field to update.' },
  );
export const listProjectsSchema = z
  .object({
    state: z.enum(['active', 'archived', 'all']).default('active'),
    limit: z
      .string()
      .regex(/^[1-9]\d?$/)
      .transform(Number)
      .pipe(z.number().max(50))
      .default(12),
    cursor: z.uuid().optional(),
  })
  .strict();

export function parseProjectInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  throw new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Check the submitted project fields.',
    fieldErrors,
  });
}
export type CreateProject = z.infer<typeof createProjectSchema>;
export type UpdateProject = z.infer<typeof updateProjectSchema>;
export type ListProjects = z.infer<typeof listProjectsSchema>;
