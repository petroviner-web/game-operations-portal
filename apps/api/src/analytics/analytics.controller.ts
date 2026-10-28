import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { AuthRequest } from '../auth/auth.types';
import { AnalyticsService } from './analytics.service';
import { parseAnalyticsRange } from './analytics.validation';
@Controller('projects/:projectId/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get()
  get(
    @Req() req: AuthRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: unknown,
  ) {
    return this.analytics.get(req.user!.id, projectId, parseAnalyticsRange(query));
  }
}
