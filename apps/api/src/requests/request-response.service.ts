import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SessionUser } from '../auth/session-user.js';
import { DocumentStorage } from '../documents/document-storage.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RespondToRequestDto } from './dto/respond-to-request.dto.js';
import { RequestScope } from './request-scope.js';

export const ALREADY_RESPONDED = 'A response has already been submitted.';

@Injectable()
export class RequestResponseService {
  private readonly logger = new Logger(RequestResponseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: RequestScope,
    private readonly documents: DocumentStorage,
  ) {}

  // The provider's one response (§2.7): the RoPA document, the response and
  // the status change are written in one transaction.
  async respond(
    user: SessionUser,
    id: string,
    dto: RespondToRequestDto,
    ropaFile: Express.Multer.File,
  ): Promise<{ status: 'PROVIDER_RESPONDED' }> {
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
    try {
      await this.prisma.$transaction(async (tx) => {
        // Claims the request. Under concurrent responses Postgres makes the
        // second UPDATE wait for the first to commit, then re-checks the
        // status and matches nothing.
        const { count } = await tx.dataSharingRequest.updateMany({
          where: this.scope.partyWhere(user, {
            id: request.id,
            providingEntityId: user.entityId,
            status: 'AWAITING_PROVIDER_RESPONSE',
          }),
          data: { status: 'PROVIDER_RESPONDED' },
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
            objectionReason:
              dto.position === 'OBJECTED' ? dto.objectionReason : null,
            respondedById: user.userId,
          },
        });
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

    return { status: 'PROVIDER_RESPONDED' };
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
