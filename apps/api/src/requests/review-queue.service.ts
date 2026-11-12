import { Injectable } from '@nestjs/common';
import type { DecisionOutcome, Prisma, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ReviewQueueQuery,
  ReviewView,
} from './dto/review-queue.query.js';
import { DECIDED, FLAGGED, isFlagged } from './flag-reasons.js';
import { RequestScope } from './request-scope.js';

export interface QueueEntity {
  id: string;
  name: string;
  slug: string;
}

// One row of the review queue (Sprint 2 spec §7).
export interface ReviewQueueItem {
  id: string;
  reference: string;
  title: string;
  status: RequestStatus;
  flagged: boolean;
  createdAt: Date;
  requestingEntity: QueueEntity;
  providingEntity: QueueEntity;
  // Open rows: since when the request has waited on the provider (pending:
  // when it was submitted) or on a decision (flagged: its first reason).
  waitingSince?: Date;
  // Flagged and decided rows: distinct flag sources, oldest first. On a
  // decided row, only the reasons that led to the decision.
  flagSources?: string[];
  // Decided rows only.
  outcome?: DecisionOutcome;
  decidedAt?: Date;
}

export interface ReviewQueue {
  items: ReviewQueueItem[];
  // The open views, with the same entity filter, whatever view is listed.
  counts: Record<Exclude<ReviewView, 'decided'>, number>;
  // Every entity, for the entity filter.
  entities: QueueEntity[];
}

const entitySelect = { select: { id: true, name: true, slug: true } } as const;

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

function distinctSources(reasons: { source: string }[]): string[] {
  return [...new Set(reasons.map((reason) => reason.source))];
}

@Injectable()
export class ReviewQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: RequestScope,
  ) {}

  async list({ view, sort, entity }: ReviewQueueQuery): Promise<ReviewQueue> {
    const entityFilter: Prisma.DataSharingRequestWhereInput = entity
      ? { OR: [{ requestingEntityId: entity }, { providingEntityId: entity }] }
      : {};
    const where = (v: ReviewView) => ({ AND: [VIEWS[v], entityFilter] });

    const [rows, flagged, pending, queue, entities] = await Promise.all([
      this.scope.findManyForOfficer({
        where: where(view),
        orderBy: [{ createdAt: 'asc' }, { reference: 'asc' }],
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          createdAt: true,
          requestingEntity: entitySelect,
          providingEntity: entitySelect,
          flagReasons: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { source: true, createdAt: true },
          },
          decision: { select: { outcome: true, createdAt: true } },
        },
      }),
      this.scope.countForOfficer(where('flagged')),
      this.scope.countForOfficer(where('pending')),
      this.scope.countForOfficer(where('queue')),
      this.prisma.entity.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true },
      }),
    ]);

    const items = rows.map(
      ({ flagReasons, decision, ...row }): ReviewQueueItem => {
        const item: ReviewQueueItem = {
          ...row,
          flagged: isFlagged(row.status, flagReasons.length),
        };
        if (DECIDED.includes(row.status)) {
          if (decision) {
            item.outcome = decision.outcome;
            item.decidedAt = decision.createdAt;
            item.flagSources = distinctSources(
              flagReasons.filter((r) => r.createdAt <= decision.createdAt),
            );
          }
        } else if (item.flagged) {
          item.waitingSince = flagReasons[0].createdAt;
          item.flagSources = distinctSources(flagReasons);
        } else {
          item.waitingSince = row.createdAt;
        }
        return item;
      },
    );

    return {
      items: view === 'decided' ? byDecision(items) : byWait(items, sort),
      counts: { flagged, pending, queue },
      entities,
    };
  }
}

// Newest decision first.
function byDecision(items: ReviewQueueItem[]): ReviewQueueItem[] {
  const time = (item: ReviewQueueItem) => item.decidedAt?.getTime() ?? 0;
  return [...items].sort(
    (x, y) =>
      time(y) - time(x) || y.reference.localeCompare(x.reference),
  );
}

// `longest`: the earliest `waitingSince` first; `recent`: the latest first.
function byWait(
  items: ReviewQueueItem[],
  sort: ReviewQueueQuery['sort'],
): ReviewQueueItem[] {
  const sign = sort === 'recent' ? -1 : 1;
  const time = (item: ReviewQueueItem) =>
    (item.waitingSince ?? item.createdAt).getTime();
  return [...items].sort(
    (x, y) =>
      sign * (time(x) - time(y)) ||
      sign * x.reference.localeCompare(y.reference),
  );
}
