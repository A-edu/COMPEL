import type { Prisma } from '@prisma/client';

export const REFERENCE_PATTERN = /^CMP-\d{4}-\d{6}$/;

const MAX_SEQUENCE = 999_999;

export function formatReference(year: number, sequence: number): string {
  return `CMP-${year}-${sequence.toString().padStart(6, '0')}`;
}

// Issues the next CMP-YYYY-NNNNNN for the current UTC year (spec §3 ->
// Reference generation). Call it inside the transaction that creates the
// request: the upsert locks the year's counter row until that transaction
// ends, so concurrent submissions wait for each other and never share a
// number, and a rollback gives the number back.
export async function allocateReference(
  tx: Prisma.TransactionClient,
  now = new Date(),
): Promise<string> {
  const year = now.getUTCFullYear();
  const [{ lastValue }] = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "ReferenceCounter" ("year", "lastValue", "updatedAt")
    VALUES (${year}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("year") DO UPDATE
      SET "lastValue" = "ReferenceCounter"."lastValue" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "lastValue"`;
  if (lastValue > MAX_SEQUENCE) {
    throw new Error(`No references left for ${year}.`);
  }
  return formatReference(year, lastValue);
}
