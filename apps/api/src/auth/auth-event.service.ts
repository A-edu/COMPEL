import { Injectable } from '@nestjs/common';
import type { AuthEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthEventService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    type: AuthEventType,
    event: { userId: string | null; email: string; ip?: string },
  ): Promise<void> {
    await this.prisma.authEvent.create({
      data: { type, userId: event.userId, email: event.email, ip: event.ip },
    });
  }
}
