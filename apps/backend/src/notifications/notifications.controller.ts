import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto } from './dto/notification-query.dto';

type AuthRequest = { user: { sub: string } };

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List current user notifications with pagination' })
  findAll(@Query() query: NotificationQueryDto, @Request() req: AuthRequest) {
    return this.notifications.findForRecipient(req.user.sub, query);
  }

  @Get('count/unread')
  @ApiOperation({ summary: 'Get unread notification count for current user' })
  getUnreadCount(@Request() req: AuthRequest) {
    return this.notifications.getUnreadCount(req.user.sub);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  @HttpCode(HttpStatus.OK)
  markAsRead(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.notifications.markAsRead(req.user.sub, id);
  }

  @Patch('mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read for current user' })
  @HttpCode(HttpStatus.OK)
  markAllAsRead(@Request() req: AuthRequest) {
    return this.notifications.markAllAsRead(req.user.sub);
  }
}
