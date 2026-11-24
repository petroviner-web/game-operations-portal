import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthRequest } from './auth.types';

@Controller('auth/accounts')
export class AccountsController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async list(@Req() request: AuthRequest) {
    if (!request.user?.isAdmin) throw new ForbiddenException();
    return (
      await this.db.query(
        'SELECT id, email_normalized AS email, suspended FROM users ORDER BY email_normalized',
      )
    ).rows;
  }

  @Post(':id/status')
  async setStatus(
    @Req() request: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('suspended') suspended: unknown,
  ) {
    if (!request.user?.isAdmin) throw new ForbiddenException();
    if (request.user.id === id.toLowerCase() || typeof suspended !== 'boolean')
      throw new BadRequestException();
    await this.db.transaction(async (client) => {
      const result = await client.query('UPDATE users SET suspended = $2 WHERE id = $1', [
        id,
        suspended,
      ]);
      if (!result.rowCount) throw new NotFoundException();
      if (suspended) await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [id]);
    });
    return { suspended };
  }
}
