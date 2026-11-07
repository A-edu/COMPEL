-- Objections made before flagging existed become flagged (Sprint 2 spec §5.3),
-- with the objection as the reason. Only adds rows; no status changes. Safe to
-- run twice: a request that already has an objection reason is skipped.
INSERT INTO "FlagReason" ("id", "requestId", "source", "text", "createdAt")
SELECT
    'objection-' || pr."requestId",
    pr."requestId",
    'PROVIDER_OBJECTION',
    COALESCE(pr."objectionReason", ''),
    pr."createdAt"
FROM "ProviderResponse" pr
WHERE pr."position" = 'OBJECTED'
  AND NOT EXISTS (
    SELECT 1 FROM "FlagReason" f
    WHERE f."requestId" = pr."requestId"
      AND f."source" = 'PROVIDER_OBJECTION'
  );
