import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DecisionOutcome, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../storage/storage.interface.js';
import { isFlagged } from './flag-reasons.js';
import {
  DOCUMENT_NOT_FOUND,
  SHARED_KINDS,
  type DocumentDownload,
  type ProviderResponseView,
  type RequestDocumentView,
} from './request-detail.service.js';
import { RequestScope } from './request-scope.js';

export interface FlagReasonView {
  id: string;
  source: string;
  text: string;
  createdAt: Date;
  // Present only on a reason that arrived after the decision, so it is never
  // read as one of the reasons that led to it (Sprint 2 spec §3.2, §8.2).
  raisedAfterDecision?: true;
}

// The stored decision (Sprint 2 spec §3.3). The justification is for officers
// only, so this is loaded on officer routes alone.
export interface DecisionView {
  outcome: DecisionOutcome;
  justification: string;
  createdAt: Date;
  decidedBy: { email: string };
}

// Everything that exists so far on a case (Sprint 2 spec §7). Flag reasons are
// listed whatever their source, and nothing here assumes an objection.
export interface ReviewCase {
  id: string;
  reference: string;
  title: string;
  status: RequestStatus;
  flagged: boolean;
  createdAt: Date;
  requestingEntity: { id: string; name: string };
  providingEntity: { id: string; name: string };
  documents: RequestDocumentView[];
  providerResponse: ProviderResponseView | null;
  flagReasons: FlagReasonView[];
  // Null until an officer decides.
  decision: DecisionView | null;
}

const entitySelect = { select: { id: true, name: true } } as const;
const documentSelect = {
  id: true,
  originalName: true,
  sizeBytes: true,
  createdAt: true,
} as const;

@Injectable()
export class ReviewCaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: RequestScope,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async getCase(id: string): Promise<ReviewCase> {
    const request = await this.scope.findForOfficerOrThrow(id, {
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        createdAt: true,
        requestingEntity: entitySelect,
        providingEntity: entitySelect,
        documents: {
          where: { kind: { in: SHARED_KINDS } },
          orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
          select: { ...documentSelect, kind: true },
        },
        providerResponse: {
          select: {
            position: true,
            objectionReason: true,
            createdAt: true,
            ropaDocument: { select: documentSelect },
          },
        },
        flagReasons: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, source: true, text: true, createdAt: true },
        },
        decision: {
          select: {
            outcome: true,
            justification: true,
            createdAt: true,
            decidedBy: { select: { email: true } },
          },
        },
      },
    });
    const { decision } = request;
    return {
      ...request,
      flagged: isFlagged(request.status, request.flagReasons.length),
      flagReasons: request.flagReasons.map((reason) =>
        decision && reason.createdAt > decision.createdAt
          ? { ...reason, raisedAfterDecision: true as const }
          : reason,
      ),
    };
  }

  // Any document of a case an officer can reach, the RoPA entry included.
  async openDocument(
    id: string,
    documentId: string,
  ): Promise<DocumentDownload> {
    const request = await this.scope.findForOfficerOrThrow(id, {
      select: { id: true },
    });
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, requestId: request.id },
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
}
