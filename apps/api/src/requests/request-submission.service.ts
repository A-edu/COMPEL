import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { DocumentKind, RequestStatus } from '@prisma/client';
import type { SessionUser } from '../auth/session-user.js';
import {
  DocumentStorage,
  type StoredFile,
} from '../documents/document-storage.js';
import type { UploadedFields } from '../documents/upload-check.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CHOOSE_PROVIDER,
  type CreateRequestDto,
} from './dto/create-request.dto.js';
import { allocateReference } from './reference.js';

export const REQUEST_FORM_REQUIRED = 'A request form is required.';
export const OWN_ENTITY_PROVIDER =
  "You can't send a request to your own entity.";

export interface SubmittedRequest {
  id: string;
  reference: string;
  status: RequestStatus;
}

type StoredDocument = StoredFile & { kind: DocumentKind };

@Injectable()
export class RequestSubmissionService {
  private readonly logger = new Logger(RequestSubmissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentStorage,
  ) {}

  // Every file has already passed the upload check (@DocumentUpload).
  async submit(
    user: SessionUser,
    { providingEntityId, title }: CreateRequestDto,
    files: UploadedFields,
  ): Promise<SubmittedRequest> {
    const requestForm = files.requestForm?.[0];
    if (!requestForm) throw new BadRequestException(REQUEST_FORM_REQUIRED);
    await this.assertProvider(user, providingEntityId);

    const uploads = [
      { kind: 'REQUEST_FORM' as const, file: requestForm },
      ...(files.supportingDocuments ?? []).map((file) => ({
        kind: 'SUPPORTING' as const,
        file,
      })),
    ];

    // Files are stored before the transaction so the reference counter is
    // never locked during storage calls. If anything fails, the files this
    // submission stored are removed again, one by one.
    const stored: StoredDocument[] = [];
    try {
      const saves = await Promise.allSettled(
        uploads.map(async ({ kind, file }) => ({
          kind,
          ...(await this.documents.save(file)),
        })),
      );
      for (const save of saves) {
        if (save.status === 'fulfilled') stored.push(save.value);
      }
      const failed = saves.find((save) => save.status === 'rejected');
      if (failed) throw failed.reason;

      return await this.prisma.$transaction(async (tx) =>
        tx.dataSharingRequest.create({
          data: {
            reference: await allocateReference(tx),
            title,
            requestingEntityId: user.entityId,
            providingEntityId,
            submittedById: user.userId,
            status: 'AWAITING_PROVIDER_RESPONSE',
            documents: {
              create: stored.map((doc) => ({
                ...doc,
                uploadedById: user.userId,
              })),
            },
          },
          select: { id: true, reference: true, status: true },
        }),
      );
    } catch (error) {
      await this.removeStored(stored);
      throw error;
    }
  }

  // Access rule 4, and the provider must be a real entity.
  private async assertProvider(
    user: SessionUser,
    providingEntityId: string,
  ): Promise<void> {
    if (providingEntityId === user.entityId) {
      throw new BadRequestException(OWN_ENTITY_PROVIDER);
    }
    const provider = await this.prisma.entity.findUnique({
      where: { id: providingEntityId },
      select: { id: true },
    });
    if (!provider) throw new BadRequestException(CHOOSE_PROVIDER);
  }

  private async removeStored(stored: StoredDocument[]): Promise<void> {
    for (const { storageKey } of stored) {
      try {
        await this.documents.remove(storageKey);
      } catch (error) {
        this.logger.error(`Could not remove ${storageKey}`, error);
      }
    }
  }
}
