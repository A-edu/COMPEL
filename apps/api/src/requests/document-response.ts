import { StreamableFile, type Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { DocumentDownload } from './request-detail.service.js';

// Sends a stored document as an attachment, the same way on every route.
export function documentResponse(
  file: DocumentDownload,
  res: Response,
  logger: Logger,
): StreamableFile {
  // Express writes an ASCII fallback plus filename*=UTF-8''… so
  // non-Latin names (e.g. Arabic) survive.
  res.attachment(file.originalName);
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const streamable = new StreamableFile(file.stream, {
    type: file.mimeType,
    length: file.sizeBytes,
  });
  // A storage failure mid-stream must not send its message to the client.
  streamable.setErrorHandler((error, response) => {
    logger.error(error);
    if (!response.headersSent) response.statusCode = 500;
    response.end();
  });
  return streamable;
}
