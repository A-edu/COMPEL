import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SessionUser } from '../auth/session-user.js';
import { DocumentStorage } from '../documents/document-storage.js';
import { PipelineRunner } from '../pipeline/pipeline-runner.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RespondToRequestDto } from './dto/respond-to-request.dto.js';
import { FLAG_SOURCE_PROVIDER_OBJECTION } from './flag-reasons.js';
import { RequestScope } from './request-scope.js';

export const ALREADY_RESPONDED = 'A response has already been submitted.';

@Injectable()
export class RequestResponseService {
  private readonly logger = new Logger(RequestResponseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: RequestScope,
    private readonly documents: DocumentStorage,
    private readonly pipeline: PipelineRunner,
  ) {}

  // The provider's one response (§2.7): the RoPA document, the response, the
  // status change, any objection's flag reason and the queued pipeline run
  // are written in one transaction. The run is then triggered in the
  // background, so the response returns straight away (Sprint 3 spec §2.3,
  // §4.3).
  async respond(
    user: SessionUser,
    id: string,
    dto: RespondToRequestDto,
    ropaFile: Express.Multer.File,
  ): Promise<{ status: 'UNDER_AUTOMATED_REVIEW' }> {
    const request = await this.scope.findPartyOrThrow(user, id, {
      select: {
        id: true,
        requestingEntityId: true,
        providingEntityId: true,
        status: true,
      },
    });
    this.scope.assertProvider(request, user);
    // Saves an upload that could never be recorded. The transaction below
    // still decides, since another response may land in between.
    if (request.status !== 'AWAITING_PROVIDER_RESPONSE') {
      throw new ConflictException(ALREADY_RESPONDED);
    }

    // Storage cannot join a database transaction, so the file goes first
    // and is removed again if the transaction does not commit.
    const stored = await this.documents.save(ropaFile);
    const objection =
      dto.position === 'OBJECTED' ? (dto.objectionReason ?? null) : null;
    let runId: string;
    try {
      runId = await this.prisma.$transaction(async (tx) => {
        // Claims the request. Under concurrent responses Postgres makes the
        // second UPDATE wait for the first to commit, then re-checks the
        // status and matches nothing.
        const { count } = await tx.dataSharingRequest.updateMany({
          where: this.scope.partyWhere(user, {
            id: request.id,
            providingEntityId: user.entityId,
            status: 'AWAITING_PROVIDER_RESPONSE',
          }),
          data: { status: 'UNDER_AUTOMATED_REVIEW' },
        });
        if (count !== 1) throw new ConflictException(ALREADY_RESPONDED);

        const ropa = await tx.document.create({
          data: {
            requestId: request.id,
            kind: 'ROPA',
            ...stored,
            uploadedById: user.userId,
          },
        });
        await tx.providerResponse.create({
          data: {
            requestId: request.id,
            ropaDocumentId: ropa.id,
            position: dto.position,
            objectionReason: objection,
            respondedById: user.userId,
          },
        });
        if (objection !== null) {
          await tx.flagReason.create({
            data: {
              requestId: request.id,
              source: FLAG_SOURCE_PROVIDER_OBJECTION,
              text: objection,
            },
          });
        }
        return this.pipeline.createRun(tx, request.id, 'RESPONSE');
      });
    } catch (error) {
      await this.discard(stored.storageKey);
      // ProviderResponse.requestId is unique: a backstop for the claim above.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(ALREADY_RESPONDED);
      }
      throw error;
    }

    await this.pipeline.dispatch(runId);
    return { status: 'UNDER_AUTOMATED_REVIEW' };
  }

  // Removes the one file this response stored. A failure here is logged and
  // must not hide the error that caused it.
  private async discard(storageKey: string): Promise<void> {
    try {
      await this.documents.remove(storageKey);
    } catch (error) {
      this.logger.error(`Could not remove ${storageKey}`, error);
    }
  }
}
