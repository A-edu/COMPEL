import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type DecisionOutcome } from '@prisma/client';
import type { SessionUser } from '../auth/session-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RecordDecisionDto } from './dto/record-decision.dto.js';
import { DECIDED, FLAGGED, isFlagged } from './flag-reasons.js';
import { RequestScope } from './request-scope.js';

export const ALREADY_DECIDED = 'This request has already been decided.';
export const NOT_FLAGGED = 'Only a flagged request can be decided.';

@Injectable()
export class ReviewDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: RequestScope,
  ) {}

  // An officer's final decision (Sprint 2 spec §8.1). Nothing here looks at
  // where a flag reason came from, so any source can lead to a decision.
  async decide(
    user: SessionUser,
    id: string,
    dto: RecordDecisionDto,
  ): Promise<{ status: DecisionOutcome }> {
    const request = await this.scope.findForOfficerOrThrow(id, {
      select: {
        id: true,
        status: true,
        flagReasons: { select: { id: true }, take: 1 },
      },
    });
    if (DECIDED.includes(request.status)) {
      throw new ConflictException(ALREADY_DECIDED);
    }
    if (!isFlagged(request.status, request.flagReasons.length)) {
      throw new ConflictException(NOT_FLAGGED);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Flag reasons are never removed, so a request found flagged above
        // that no longer matches can only have been decided in between.
        const { count } = await tx.dataSharingRequest.updateMany({
          where: this.scope.officerWhere({ id: request.id, ...FLAGGED }),
          data: { status: dto.outcome },
        });
        if (count !== 1) throw new ConflictException(ALREADY_DECIDED);

        await tx.decision.create({
          data: {
            requestId: request.id,
            outcome: dto.outcome,
            justification: dto.justification,
            decidedById: user.userId,
          },
        });
      });
    } catch (error) {
      // Decision.requestId is unique: this is what settles two officers
      // deciding at the same moment, and it rolls back the loser's status.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(ALREADY_DECIDED);
      }
      throw error;
    }

    return { status: dto.outcome };
  }
}
