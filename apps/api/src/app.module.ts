import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [DatabaseModule, AuthModule, ProjectsModule, SessionsModule, AnalyticsModule],
  controllers: [HealthController],
})
export class AppModule {}
