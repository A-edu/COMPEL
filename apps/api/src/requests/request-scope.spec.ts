import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { SessionUser } from '../auth/session-user.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestScope } from './request-scope.js';

describe('RequestScope', () => {
  const user: SessionUser = { userId: 'user-a', entityId: 'entity-a' };
  const partyFilter = {
    OR: [{ requestingEntityId: 'entity-a' }, { providingEntityId: 'entity-a' }],
  };

  let findFirst: ReturnType<typeof vi.fn>;
  let findMany: ReturnType<typeof vi.fn>;
  let scope: RequestScope;

  beforeEach(() => {
    findFirst = vi.fn();
    findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      dataSharingRequest: { findFirst, findMany },
    } as unknown as PrismaService;
    scope = new RequestScope(prisma);
  });

  describe('partyWhere', () => {
    it("filters by the session user's entity as requester or provider", () => {
      expect(scope.partyWhere(user)).toEqual({ AND: [partyFilter, {}] });
    });

    it('ANDs extra conditions so they cannot widen the filter', () => {
      const extra = {
        OR: [
          { requestingEntityId: 'entity-b' },
          { providingEntityId: 'entity-b' },
        ],
      };
      expect(scope.partyWhere(user, extra)).toEqual({
        AND: [partyFilter, extra],
      });
    });

    it.each([
      { userId: 'user-a', entityId: '' },
      { userId: 'user-a', entityId: undefined },
      undefined,
    ])('throws without an entity ID (%o)', (bad) => {
      expect(() => scope.partyWhere(bad as unknown as SessionUser)).toThrow();
    });
  });

  describe('findMany', () => {
    it("scopes the caller's where and keeps other arguments", async () => {
      await scope.findMany(user, {
        where: { status: 'PROVIDER_RESPONDED' },
        orderBy: { createdAt: 'desc' },
      });
      expect(findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        where: { AND: [partyFilter, { status: 'PROVIDER_RESPONDED' }] },
      });
    });

    it('scopes a call without arguments', async () => {
      await scope.findMany(user);
      expect(findMany).toHaveBeenCalledWith({
        where: { AND: [partyFilter, {}] },
      });
    });

    it('uses the transaction client when given', async () => {
      const txFindMany = vi.fn().mockResolvedValue([]);
      const tx = { dataSharingRequest: { findMany: txFindMany } };
      await scope.findMany(user, {}, tx as never);
      expect(txFindMany).toHaveBeenCalled();
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('findPartyOrThrow', () => {
    it('loads the request by ID within the party filter', async () => {
      const request = { id: 'req-1' };
      findFirst.mockResolvedValue(request);
      await expect(
        scope.findPartyOrThrow(user, 'req-1', { include: { documents: true } }),
      ).resolves.toBe(request);
      expect(findFirst).toHaveBeenCalledWith({
        include: { documents: true },
        where: { AND: [partyFilter, { id: 'req-1' }] },
      });
    });

    it('throws 404, never 403, when the caller is not a party', async () => {
      findFirst.mockResolvedValue(null);
      const result = scope.findPartyOrThrow(user, 'req-1');
      await expect(result).rejects.toBeInstanceOf(NotFoundException);
      await expect(result).rejects.not.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('roleOf and assertProvider', () => {
    const sent = {
      requestingEntityId: 'entity-a',
      providingEntityId: 'entity-b',
    };
    const received = {
      requestingEntityId: 'entity-b',
      providingEntityId: 'entity-a',
    };
    const others = {
      requestingEntityId: 'entity-b',
      providingEntityId: 'entity-c',
    };

    it('returns the caller’s role on the request', () => {
      expect(scope.roleOf(sent, user)).toBe('REQUESTER');
      expect(scope.roleOf(received, user)).toBe('PROVIDER');
    });

    it('throws 404 for a request the caller is not a party to', () => {
      expect(() => scope.roleOf(others, user)).toThrow(NotFoundException);
      expect(() => scope.assertProvider(others, user)).toThrow(
        NotFoundException,
      );
    });

    it('lets the provider through and gives the requester 403', () => {
      expect(() => scope.assertProvider(received, user)).not.toThrow();
      expect(() => scope.assertProvider(sent, user)).toThrow(
        ForbiddenException,
      );
    });
  });
});
