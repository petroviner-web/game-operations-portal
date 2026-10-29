import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MemberRateLimitGuard } from './member-rate-limit.guard';
import { AuthRequest } from '../auth/auth.types';
import { ProjectsService } from './projects.service';
import {
  createProjectSchema,
  addMemberSchema,
  listProjectsSchema,
  parseProjectInput,
  updateProjectSchema,
  versionSchema,
} from './projects.validation';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  async create(@Req() request: AuthRequest, @Body() body: unknown) {
    return {
      project: await this.projects.create(
        request.user!.id,
        parseProjectInput(createProjectSchema, body),
      ),
    };
  }
  @Get()
  list(@Req() request: AuthRequest, @Query() query: unknown) {
    return this.projects.list(request.user!.id, parseProjectInput(listProjectsSchema, query));
  }
  @Get(':id')
  async get(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return { project: await this.projects.get(request.user!.id, id) };
  }
  @Get(':id/members')
  async members(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return { members: await this.projects.members(request.user!.id, id) };
  }
  @Post(':id/members')
  @HttpCode(200)
  @UseGuards(MemberRateLimitGuard)
  addMember(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.projects.addMember(
      request.user!.id,
      id,
      parseProjectInput(addMemberSchema, body).email,
    );
  }
  @Delete(':id/members/:userId')
  removeMember(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.projects.removeMember(request.user!.id, id, userId);
  }
  @Patch(':id')
  async update(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return {
      project: await this.projects.update(
        request.user!.id,
        id,
        parseProjectInput(updateProjectSchema, body),
      ),
    };
  }
  @Post(':id/archive')
  @HttpCode(200)
  async archive(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return {
      project: await this.projects.setArchived(
        request.user!.id,
        id,
        parseProjectInput(versionSchema, body).version,
        true,
      ),
    };
  }
  @Post(':id/restore')
  @HttpCode(200)
  async restore(
    @Req() request: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return {
      project: await this.projects.setArchived(
        request.user!.id,
        id,
        parseProjectInput(versionSchema, body).version,
        false,
      ),
    };
  }
}
