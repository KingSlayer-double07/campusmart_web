import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { clearAuthCookies } from '../auth/auth-cookies';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { SessionDto } from './dto/session.dto';
import { SessionsService } from './sessions.service';

@ApiTags('Users')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @ApiOperation({ summary: 'List the signed-in sessions of the current user' })
  @ApiOkEnvelope([SessionDto])
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<SessionDto[]> {
    return this.sessions.list(user.id, user.sessionId);
  }

  @ApiOperation({
    summary: 'Sign out every other device',
    description: 'Revokes every session except the one making the request.',
  })
  @ApiNoContentResponse()
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeOthers(@CurrentUser() user: AuthUser): Promise<void> {
    await this.sessions.revokeOthers(user.id, user.sessionId);
  }

  @ApiOperation({
    summary: 'Sign out one session',
    description:
      "Revokes one of the current user's sessions. Revoking the current one also clears its cookies.",
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'No such session for this user' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revoke(user.id, id);
    if (id === user.sessionId) clearAuthCookies(res);
  }
}
