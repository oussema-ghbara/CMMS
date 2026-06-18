import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';

@Injectable()
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling'],
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = (client.handshake.auth as Record<string, unknown>)
      ?.token as string | undefined;

    if (!token) {
      this.logger.warn(`[WS] ${client.id} disconnected – no auth token`);
      client.disconnect(true);
      return;
    }

    try {
      const secret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret,
      });

      (client.data as Record<string, unknown>).userId = payload.sub;
      await client.join(`user:${payload.sub}`);

      this.logger.debug(
        `[WS] ${client.id} authenticated → room user:${payload.sub}`,
      );
    } catch {
      this.logger.warn(`[WS] ${client.id} disconnected – invalid token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = (client.data as Record<string, unknown>).userId as
      | string
      | undefined;
    this.logger.debug(
      `[WS] ${client.id} disconnected${userId ? ` (user:${userId})` : ''}`,
    );
  }

  emitToUser(userId: string, event: string, data: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, data);
  }
}
