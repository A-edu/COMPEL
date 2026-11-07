import { Injectable } from '@nestjs/common';
import type { RequestStatus } from '@prisma/client';
import { DECIDED, isFlagged } from './flag-reasons.js';
import { RequestScope } from './request-scope.js';

// One row of the review queue (Sprint 2 spec §7).
export interface ReviewQueueItem {
  id: string;
  reference: string;
  title: string;
  status: RequestStatus;
  flagged: boolean;
  createdAt: Date;
  requestingEntity: { id: string; name: string };
  providingEntity: { id: string; name: string };
}

const entitySelect = { select: { id: true, name: true } } as const;

@Injectable()
export class ReviewQueueService {
  constructor(private readonly scope: RequestScope) {}

  // Every pending and flagged request, from all entities, oldest first.
  // Decided requests are reachable by officers but have left the queue.
  async list(): Promise<ReviewQueueItem[]> {
    const rows = await this.scope.findManyForOfficer({
      where: { status: { notIn: DECIDED } },
      orderBy: [{ createdAt: 'asc' }, { reference: 'asc' }],
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        createdAt: true,
        requestingEntity: entitySelect,
        providingEntity: entitySelect,
        flagReasons: { select: { id: true }, take: 1 },
      },
    });
    return rows.map(({ flagReasons, ...row }) => ({
      ...row,
      flagged: isFlagged(row.status, flagReasons.length),
    }));
  }
}
