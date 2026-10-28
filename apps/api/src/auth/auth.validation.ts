import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function validateCredentials(body: unknown, registering: boolean) {
  const schema = z
    .object({
      email: z.string().trim().toLowerCase().max(254).email('Enter a valid email address.'),
      password: z
        .string()
        .min(
          registering ? 12 : 1,
          registering ? 'Use at least 12 characters.' : 'Enter your password.',
        )
        .max(128, 'Use no more than 128 characters.'),
    })
    .strict();
  const result = schema.safeParse(body);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (field === 'email' || field === 'password') fieldErrors[field] ??= issue.message;
    }
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Check your email and password. Only these two fields are accepted.',
      fieldErrors,
    });
  }
  return result.data;
}
