import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { AuthRequest } from '../auth/auth.types';
import { parseSessionInput, sessionActionSchema } from './sessions.validation';
import {
  createSessionSchema,
  emptySessionSchema,
  joinSessionSchema,
  listSessionsSchema,
} from './sessions.validation';
import { SessionsService } from './sessions.service';

@Controller('projects/:projectId/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}
  @Get()
  list(
    @Req() req: AuthRequest,
    @Param('projectId', new ParseUUIDPipe()) project: string,
    @Query() query: unknown,
  ) {
    return this.sessions.list(req.user!.id, project, parseSessionInput(listSessionsSchema, query));
  }
  @Post()
  async create(
    @Req() req: AuthRequest,
    @Param('projectId', new ParseUUIDPipe()) project: string,
    @Body() body: unknown,
  ) {
    return {
      session: await this.sessions.create(
        req.user!.id,
        project,
        parseSessionInput(createSessionSchema, body),
      ),
    };
  }
  @Get(':id')
  async get(
    @Req() req: AuthRequest,
    @Param('projectId', new ParseUUIDPipe()) project: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { session: await this.sessions.get(req.user!.id, project, id) };
  }
  @Post(':id/players')
  @HttpCode(200)
  async join(
    @Req() req: AuthRequest,
    @Param('projectId', new ParseUUIDPipe()) project: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return {
      session: await this.sessions.join(
        req.user!.id,
        project,
        id,
        parseSessionInput(joinSessionSchema, body),
      ),
    };
  }
  @Post(':id/players/:playerId/leave')
  @HttpCode(200)
  async leave(
    @Req() req: AuthRequest,
    @Param('projectId', new ParseUUIDPipe()) project: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('playerId', new ParseUUIDPipe()) player: string,
    @Body() body: unknown,
  ) {
    parseSessionInput(emptySessionSchema, body ?? {});
    return { session: await this.sessions.leave(req.user!.id, project, id, player) };
  }
  @Post(':id/:action')
  @HttpCode(200)
  async transition(
    @Req() req: AuthRequest,
    @Param('projectId', new ParseUUIDPipe()) project: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('action') action: string,
    @Body() body: unknown,
  ) {
    parseSessionInput(emptySessionSchema, body ?? {});
    const parsed = parseSessionInput(sessionActionSchema, action);
    return { session: await this.sessions.transition(req.user!.id, project, id, parsed) };
  }
}
