-- CreateTable
CREATE TABLE "ReferenceCounter" (
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceCounter_pkey" PRIMARY KEY ("year")
);

-- Backfill (added manually): continue each year after the highest reference
-- already issued, e.g. the seeded demo requests, so new references never
-- collide with existing ones.
INSERT INTO "ReferenceCounter" ("year", "lastValue", "updatedAt")
SELECT
    CAST(substring("reference" FROM 5 FOR 4) AS INTEGER),
    MAX(CAST(substring("reference" FROM 10 FOR 6) AS INTEGER)),
    CURRENT_TIMESTAMP
FROM "DataSharingRequest"
WHERE "reference" ~ '^CMP-[0-9]{4}-[0-9]{6}$'
GROUP BY 1;
