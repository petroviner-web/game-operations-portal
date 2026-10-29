import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { MemberRateLimitGuard } from './member-rate-limit.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, MemberRateLimitGuard],
})
export class ProjectsModule {}
