import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentKind, Position, RequestStatus } from '@prisma/client';
import type { Readable } from 'node:stream';
import type { SessionUser } from '../auth/session-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../storage/storage.interface.js';
import { RequestScope, type RequestRole } from './request-scope.js';

export const DOCUMENT_NOT_FOUND = 'Document not found.';

// Documents both parties see. ROPA belongs to the provider's response and
// is never listed here (AGENTS.md -> Access rules 3).
const SHARED_KINDS: DocumentKind[] = ['REQUEST_FORM', 'SUPPORTING'];

export interface RequestDocumentView {
  id: string;
  kind: DocumentKind;
  originalName: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface ProviderResponseView {
  ropaDocument: {
    id: string;
    originalName: string;
    sizeBytes: number;
    createdAt: Date;
  };
  position: Position;
  objectionReason: string | null;
  createdAt: Date;
}

// §4 detail. `providerResponse` is present only for the provider; for the
// requester the key does not exist at all (§2.2).
export interface RequestDetail {
  id: string;
  reference: string;
  title: string;
  status: RequestStatus;
  createdAt: Date;
  requestingEntity: { id: string; name: string };
  providingEntity: { id: string; name: string };
  myRole: RequestRole;
  documents: RequestDocumentView[];
  providerResponse?: ProviderResponseView | null;
}

export interface DocumentDownload {
  stream: Readable;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

const entitySelect = { select: { id: true, name: true } } as const;

@Injectable()
export class RequestDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: RequestScope,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async getDetail(user: SessionUser, id: string): Promise<RequestDetail> {
    const request = await this.scope.findPartyOrThrow(user, id, {
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        createdAt: true,
        requestingEntityId: true,
        providingEntityId: true,
        requestingEntity: entitySelect,
        providingEntity: entitySelect,
        documents: {
          where: { kind: { in: SHARED_KINDS } },
          orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            kind: true,
            originalName: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
    });
    const myRole = this.scope.roleOf(request, user);

    const detail: RequestDetail = {
      id: request.id,
      reference: request.reference,
      title: request.title,
      status: request.status,
      createdAt: request.createdAt,
      requestingEntity: request.requestingEntity,
      providingEntity: request.providingEntity,
      myRole,
      documents: request.documents,
    };
    // The response is loaded only for the provider, so the requester's
    // detail cannot carry it by accident.
    if (myRole === 'PROVIDER') {
      detail.providerResponse = await this.providerResponse(request.id);
    }
    return detail;
  }

  // A document of a request the caller is a party to. A RoPA document is
  // the provider's alone; for the requester it does not exist.
  async openDocument(
    user: SessionUser,
    id: string,
    documentId: string,
  ): Promise<DocumentDownload> {
    const request = await this.scope.findPartyOrThrow(user, id, {
      select: { id: true, requestingEntityId: true, providingEntityId: true },
    });
    const myRole = this.scope.roleOf(request, user);
    const kinds: DocumentKind[] =
      myRole === 'PROVIDER' ? [...SHARED_KINDS, 'ROPA'] : SHARED_KINDS;

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, requestId: request.id, kind: { in: kinds } },
      select: {
        storageKey: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
      },
    });
    if (!document) throw new NotFoundException(DOCUMENT_NOT_FOUND);

    return {
      stream: await this.storage.get(document.storageKey),
      originalName: document.originalName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
    };
  }

  private async providerResponse(
    requestId: string,
  ): Promise<ProviderResponseView | null> {
    const response = await this.prisma.providerResponse.findUnique({
      where: { requestId },
      select: {
        position: true,
        objectionReason: true,
        createdAt: true,
        ropaDocument: {
          select: {
            id: true,
            originalName: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
    });
    return response ?? null;
  }
}
