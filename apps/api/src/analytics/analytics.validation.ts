import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
const day = z.iso
  .date()
  .refine((value) => !value.startsWith('0000-'), 'Use a year from 0001 to 9999.');
const schema = z.object({ from: day.optional(), to: day.optional() }).strict();
const DAY_MS = 86400000;
export interface AnalyticsRange {
  from: string;
  to: string;
}
export function parseAnalyticsRange(input: unknown, now = new Date()): AnalyticsRange {
  const parsed = schema.safeParse(input);
  const fail = (): never => {
    throw new BadRequestException({
      code: 'INVALID_ANALYTICS_RANGE',
      message:
        'Provide both dates as YYYY-MM-DD, with From before Until and a range of 1–90 UTC days.',
    });
  };
  if (!parsed.success) return fail();
  const { from, to } = parsed.data;
  if (from === undefined && to === undefined) {
    const today = Date.parse(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
    return {
      from: new Date(today - 6 * DAY_MS).toISOString().slice(0, 10),
      to: new Date(today + DAY_MS).toISOString().slice(0, 10),
    };
  }
  if (!from || !to) return fail();
  const duration = Date.parse(to + 'T00:00:00.000Z') - Date.parse(from + 'T00:00:00.000Z');
  if (duration < DAY_MS || duration > 90 * DAY_MS) return fail();
  return { from, to };
}
