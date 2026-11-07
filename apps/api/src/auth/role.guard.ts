import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { IS_PUBLIC } from './public.decorator.js';
import { ROUTE_ACCESS, type RouteAccess } from './route-access.js';
import type { SessionUser } from './session-user.js';

export const NOT_FOUND = 'Not found.';

// Runs after SessionGuard. The role is read from the database on every
// request, so it is never taken from the client and the session contract
// keeps its shape. The refusal is a 404 raised before any request is loaded,
// so it is the same whether or not the request exists or is flagged (Sprint 2
// spec §4.1).
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }
    const access = this.reflector.getAllAndOverride<RouteAccess | undefined>(
      ROUTE_ACCESS,
      targets,
    );
    if (access === 'ANY_ROLE') return true;

    const required: UserRole =
      access === 'OFFICER_ONLY' ? 'COMPLIANCE_OFFICER' : 'DPO';
    const { user } = context.switchToHttp().getRequest<{ user: SessionUser }>();
    const account = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { role: true },
    });
    if (account?.role !== required) throw new NotFoundException(NOT_FOUND);
    return true;
  }
}
