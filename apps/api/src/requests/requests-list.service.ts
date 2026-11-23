import { Injectable } from '@nestjs/common';
import type { RequestStatus } from '@prisma/client';
import type { SessionUser } from '../auth/session-user.js';
import type { Direction } from './dto/list-requests.query.js';
import { ACTIVE_REASON, isFlagged } from './flag-reasons.js';
import { RequestScope } from './request-scope.js';
import { statusChangedAt, visibleStage } from './status-changed-at.js';

// One row of GET /requests (spec §4 -> List item). `flagged` is present only
// on the provider's rows (Sprint 2 spec §3.1); `underReview` only on the
// requester's, for a request the pipeline did not auto-clear and nobody has
// decided (Sprint 3 spec §2.7, §3.1). `statusChangedAt` is when the status
// this caller sees last changed (the createdAt of a pending request), worked
// out from the same rules (status-changed-at.ts).
export interface RequestListItem {
  id: string;
  reference: string;
  title: string;
  status: RequestStatus;
  createdAt: Date;
  statusChangedAt: Date;
  counterpartEntity: { id: string; name: string };
  flagged?: true;
  underReview?: true;
}

const entitySelect = { select: { id: true, name: true } } as const;

@Injectable()
export class RequestsListService {
  constructor(private readonly scope: RequestScope) {}

  // Sent: the caller's entity requested, the counterpart is the provider.
  // Received: the caller's entity provides, the counterpart is the requester.
  async list(
    user: SessionUser,
    direction: Direction,
  ): Promise<RequestListItem[]> {
    const rows = await this.scope.findMany(user, {
      where:
        direction === 'sent'
          ? { requestingEntityId: user.entityId }
          : { providingEntityId: user.entityId },
      orderBy: [{ createdAt: 'desc' }, { reference: 'desc' }],
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        createdAt: true,
        requestingEntity: entitySelect,
        providingEntity: entitySelect,
        flagReasons: { where: ACTIVE_REASON, select: { id: true }, take: 1 },
        // Only the times that mark a visible status change. Never updatedAt,
        // which moves on internal writes.
        providerResponse: { select: { createdAt: true } },
        decision: { select: { createdAt: true } },
        pipelineRuns: {
          select: { createdAt: true, endedAt: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });
    return rows.map(
      ({
        requestingEntity,
        providingEntity,
        flagReasons,
        providerResponse,
        decision,
        pipelineRuns,
        ...row
      }) => {
        const flagged = isFlagged(row.status, flagReasons.length);
        const providerFlagged = direction === 'received' && flagged;
        // Same rule as requesterSeesUnderReview() in the detail.
        const underReview =
          direction === 'sent' &&
          flagged &&
          row.status === 'PROVIDER_RESPONDED' &&
          pipelineRuns.length > 0;
        return {
          ...row,
          statusChangedAt: statusChangedAt(
            visibleStage(row.status, providerFlagged || underReview),
            {
              createdAt: row.createdAt,
              respondedAt: providerResponse?.createdAt ?? null,
              decidedAt: decision?.createdAt ?? null,
              latestRun: pipelineRuns[0] ?? null,
            },
          ),
          counterpartEntity:
            direction === 'sent' ? providingEntity : requestingEntity,
          ...(providerFlagged ? { flagged: true as const } : {}),
          ...(underReview ? { underReview: true as const } : {}),
        };
      },
    );
  }
}
