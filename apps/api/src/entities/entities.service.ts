import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../auth/session-user.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface EntityOption {
  id: string;
  name: string;
  slug: string;
}

@Injectable()
export class EntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  // Every entity a request can be sent to: all but the caller's own
  // (spec §2.6, §4).
  providers(user: SessionUser): Promise<EntityOption[]> {
    return this.prisma.entity.findMany({
      where: { id: { not: user.entityId } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    });
  }
}
