import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SESSION_COOKIE } from './session-cookie.js';
import { IS_PUBLIC } from './public.decorator.js';
import { SessionService } from './session.service.js';
import type { SessionUser } from './session-user.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: SessionUser }>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token === '') {
      throw new UnauthorizedException('Not logged in.');
    }

    const user = await this.sessions.validate(token, req.ip);
    if (!user) throw new UnauthorizedException('Not logged in.');

    req.user = { userId: user.userId, entityId: user.entityId };
    return true;
  }
}
