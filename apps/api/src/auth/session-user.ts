import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Attached to every authenticated request by SessionGuard. This shape is a
// contract (AGENTS.md -> Authentication invariants); do not change it.
export interface SessionUser {
  userId: string;
  entityId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser =>
    ctx.switchToHttp().getRequest<{ user: SessionUser }>().user,
);
