import { Injectable } from '@nestjs/common';
import type { Prisma, RequestStatus } from '@prisma/client';
import type { ReviewSort, ReviewView } from './dto/review-queue.query.js';
import { DECIDED, FLAGGED, isFlagged } from './flag-reasons.js';
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

// What each view holds. `queue` is every pending and flagged request; decided
// requests have left it but stay reachable through their own view. A request
// with a flag reason is flagged whatever its status (§3.1), so `pending` leaves
// those out and no request appears in both.
const VIEWS: Record<ReviewView, Prisma.DataSharingRequestWhereInput> = {
  queue: { status: { notIn: DECIDED } },
  flagged: FLAGGED,
  pending: {
    status: 'AWAITING_PROVIDER_RESPONSE',
    flagReasons: { none: {} },
  },
  decided: { status: { in: DECIDED } },
};

@Injectable()
export class ReviewQueueService {
  constructor(private readonly scope: RequestScope) {}

  async list(view: ReviewView, sort: ReviewSort): Promise<ReviewQueueItem[]> {
    const direction = sort === 'newest' ? 'desc' : 'asc';
    const rows = await this.scope.findManyForOfficer({
      where: VIEWS[view],
      orderBy: [{ createdAt: direction }, { reference: direction }],
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
