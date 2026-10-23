import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SessionUser } from '../auth/session-user.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const REQUEST_NOT_FOUND = 'Request not found.';
export const PROVIDER_ONLY =
  'Only the providing entity can respond to this request.';

export type RequestRole = 'REQUESTER' | 'PROVIDER';

type FindFirstArgs = Omit<Prisma.DataSharingRequestFindFirstArgs, 'where'>;

interface Parties {
  requestingEntityId: string;
  providingEntityId: string;
}

// The one place request queries are scoped to the caller's entity
// (AGENTS.md -> Access rules 1 and 5). Every method takes the SessionUser
// attached by SessionGuard, never an entity ID from the client.
@Injectable()
export class RequestScope {
  constructor(private readonly prisma: PrismaService) {}

  // Requests the caller's entity is a party to, narrowed by `extra`. The
  // party filter is ANDed with `extra`, so `extra` can never widen it.
  partyWhere(
    user: SessionUser,
    extra?: Prisma.DataSharingRequestWhereInput,
  ): Prisma.DataSharingRequestWhereInput {
    const entityId = entityIdOf(user);
    return {
      AND: [
        {
          OR: [
            { requestingEntityId: entityId },
            { providingEntityId: entityId },
          ],
        },
        extra ?? {},
      ],
    };
  }

  findMany<A extends Prisma.DataSharingRequestFindManyArgs>(
    user: SessionUser,
    args?: Prisma.SelectSubset<A, Prisma.DataSharingRequestFindManyArgs>,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.DataSharingRequestGetPayload<A>[]> {
    const db = tx ?? this.prisma;
    const { where, ...rest } = (args ??
      {}) as Prisma.DataSharingRequestFindManyArgs;
    return db.dataSharingRequest.findMany({
      ...rest,
      where: this.partyWhere(user, where),
    }) as Promise<Prisma.DataSharingRequestGetPayload<A>[]>;
  }

  // Loads one request the caller's entity is a party to. Anything else,
  // including a request that exists between other entities, is a 404.
  async findPartyOrThrow<A extends FindFirstArgs>(
    user: SessionUser,
    id: string,
    args?: Prisma.SelectSubset<A, FindFirstArgs>,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.DataSharingRequestGetPayload<A>> {
    const db = tx ?? this.prisma;
    const request = await db.dataSharingRequest.findFirst({
      ...((args ?? {}) as FindFirstArgs),
      where: this.partyWhere(user, { id }),
    });
    if (!request) throw new NotFoundException(REQUEST_NOT_FOUND);
    return request as Prisma.DataSharingRequestGetPayload<A>;
  }

  roleOf(request: Parties, user: SessionUser): RequestRole {
    const entityId = entityIdOf(user);
    if (request.providingEntityId === entityId) return 'PROVIDER';
    if (request.requestingEntityId === entityId) return 'REQUESTER';
    throw new NotFoundException(REQUEST_NOT_FOUND);
  }

  // Access rule 2: only the provider responds; another party gets 403.
  assertProvider(request: Parties, user: SessionUser): void {
    if (this.roleOf(request, user) !== 'PROVIDER') {
      throw new ForbiddenException(PROVIDER_ONLY);
    }
  }
}

// Prisma drops `undefined` from a where clause, so a missing entity ID would
// match every request. Fail loudly instead.
function entityIdOf(user: SessionUser | undefined): string {
  const entityId: unknown = user?.entityId;
  if (typeof entityId !== 'string' || entityId === '') {
    throw new Error("RequestScope needs the session user's entityId.");
  }
  return entityId;
}
