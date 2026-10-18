import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import {
  MarkedDto,
  MarkReadDto,
  NotificationPageDto,
  NotificationPrefsDto,
  NotificationsQueryDto,
  UnreadCountDto,
} from './dto/notification.dto';
import { InboxService } from './inbox.service';

// Guide 10: the bell, the list and the preferences. Every signed-in user, own rows only.
@ApiTags('Notifications')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class NotificationsController {
  constructor(private readonly inbox: InboxService) {}

  @ApiOperation({ summary: 'Your notifications, newest first' })
  @ApiOkEnvelope(NotificationPageDto)
  @Get('notifications')
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: NotificationsQueryDto,
  ): Promise<NotificationPageDto> {
    return this.inbox.list(user.id, query);
  }

  @ApiOperation({
    summary: 'How many are unread (the bell polls this every 60 seconds)',
  })
  @ApiOkEnvelope(UnreadCountDto)
  @Get('notifications/unread-count')
  async unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCountDto> {
    return { count: await this.inbox.unreadCount(user.id) };
  }

  @ApiOperation({ summary: 'Mark some, or all, as read' })
  @ApiOkEnvelope(MarkedDto)
  @Post('notifications/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser() user: AuthUser,
    @Body() dto: MarkReadDto,
  ): Promise<MarkedDto> {
    return { count: await this.inbox.markRead(user.id, dto.ids) };
  }

  @ApiOperation({ summary: 'Your email preferences (T7)' })
  @ApiOkEnvelope(NotificationPrefsDto)
  @Get('users/me/notification-preferences')
  prefs(@CurrentUser() user: AuthUser): Promise<NotificationPrefsDto> {
    return this.inbox.prefs(user.id);
  }

  @ApiOperation({ summary: 'Turn order and payment emails on or off' })
  @ApiOkEnvelope(NotificationPrefsDto)
  @Patch('users/me/notification-preferences')
  setPrefs(
    @CurrentUser() user: AuthUser,
    @Body() dto: NotificationPrefsDto,
  ): Promise<NotificationPrefsDto> {
    return this.inbox.setPrefs(user.id, dto);
  }
}
