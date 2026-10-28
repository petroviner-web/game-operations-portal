import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Public } from '../auth/public.decorator';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  @Header('Cache-Control', 'no-store')
  live() {
    return { status: 'ok', service: 'game-ops-api' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    const ready = await this.database.isReady();
    const response = {
      status: ready ? 'ok' : 'unavailable',
      service: 'game-ops-api',
      checks: { database: ready ? 'up' : 'down' },
      checkedAt: new Date().toISOString(),
    };
    if (!ready) throw new ServiceUnavailableException(response);
    return response;
  }
}
