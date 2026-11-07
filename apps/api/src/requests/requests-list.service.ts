import { Injectable } from '@nestjs/common';
import type { RequestStatus } from '@prisma/client';
import type { SessionUser } from '../auth/session-user.js';
import type { Direction } from './dto/list-requests.query.js';
import { isFlagged } from './flag-reasons.js';
import { RequestScope } from './request-scope.js';

// One row of GET /requests (spec §4 -> List item). `flagged` is present only
// on the provider's rows (Sprint 2 spec §3.1).
export interface RequestListItem {
  id: string;
  reference: string;
  title: string;
  status: RequestStatus;
  createdAt: Date;
  counterpartEntity: { id: string; name: string };
  flagged?: true;
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
        flagReasons: { select: { id: true }, take: 1 },
      },
    });
    return rows.map(
      ({ requestingEntity, providingEntity, flagReasons, ...row }) => ({
        ...row,
        counterpartEntity:
          direction === 'sent' ? providingEntity : requestingEntity,
        ...(direction === 'received' &&
        isFlagged(row.status, flagReasons.length)
          ? { flagged: true as const }
          : {}),
      }),
    );
  }
}
