import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UseInterceptors,
  mixin,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type Type,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { extname } from 'node:path';
import type { Observable } from 'rxjs';

// Accepted document types, by extension (AGENTS.md -> Architecture).
export const ALLOWED_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export type DocumentExtension = keyof typeof ALLOWED_TYPES;

export const WRONG_TYPE_MESSAGE = 'Only PDF or DOCX files are allowed.';

export function tooLargeMessage(maxBytes: number): string {
  return `Each file must be ${maxBytes / (1024 * 1024)} MB or smaller.`;
}

export function maxUploadBytes(config: ConfigService): number {
  const mb = Number(config.get<string>('MAX_UPLOAD_MB'));
  if (!Number.isInteger(mb) || mb <= 0) {
    throw new Error('MAX_UPLOAD_MB must be a positive integer.');
  }
  return mb * 1024 * 1024;
}

// Rejects anything but a PDF or DOCX up to `maxBytes`. The declared content
// type and the extension must both be allowed and agree with each other.
// Returns the extension to store the file under.
export function assertAllowedUpload(
  file: Pick<Express.Multer.File, 'originalname' | 'mimetype' | 'size'>,
  maxBytes: number,
): DocumentExtension {
  const ext = extname(file.originalname).slice(1).toLowerCase();
  if (
    !Object.hasOwn(ALLOWED_TYPES, ext) ||
    ALLOWED_TYPES[ext as DocumentExtension] !== file.mimetype
  ) {
    throw new BadRequestException(WRONG_TYPE_MESSAGE);
  }
  if (file.size > maxBytes) {
    throw new BadRequestException(tooLargeMessage(maxBytes));
  }
  return ext as DocumentExtension;
}

export interface UploadField {
  name: string;
  maxCount: number;
}

export type UploadedFields = Record<string, Express.Multer.File[] | undefined>;

// Parses a multipart body into memory and checks every file before the
// handler runs. Read the files with @UploadedFiles(); whether a field is
// required stays with the endpoint's own validation.
//
//   @DocumentUpload([{ name: 'requestForm', maxCount: 1 }])
export function DocumentUpload(fields: UploadField[]) {
  return UseInterceptors(documentUploadInterceptor(fields));
}

function documentUploadInterceptor(
  fields: UploadField[],
): Type<NestInterceptor> {
  @Injectable()
  class DocumentUploadInterceptor implements NestInterceptor {
    private readonly maxBytes: number;
    private readonly multer: NestInterceptor;

    constructor(config: ConfigService) {
      this.maxBytes = maxUploadBytes(config);
      // Per-field counts are checked below so the message can name the
      // field; multer only caps the total, one above the sum, so that one
      // file too many still reaches that check.
      const Multer = FileFieldsInterceptor(
        fields.map(({ name }) => ({ name })),
        {
          limits: {
            fileSize: this.maxBytes,
            files: fields.reduce((sum, f) => sum + f.maxCount, 0) + 1,
          },
          // Keeps non-Latin filenames (e.g. Arabic) intact.
          defParamCharset: 'utf8',
        },
      );
      this.multer = new Multer();
    }

    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      const req = context
        .switchToHttp()
        .getRequest<Request & { files?: UploadedFields }>();
      const checked: CallHandler = {
        handle: () => {
          this.check(req.files ?? {});
          return next.handle();
        },
      };
      try {
        return await this.multer.intercept(context, checked);
      } catch (error) {
        if (error instanceof PayloadTooLargeException) {
          throw new BadRequestException(tooLargeMessage(this.maxBytes));
        }
        throw error;
      }
    }

    private check(files: UploadedFields): void {
      for (const { name, maxCount } of fields) {
        const received = files[name] ?? [];
        if (received.length > maxCount) {
          throw new BadRequestException(
            `At most ${maxCount} ${maxCount === 1 ? 'file is' : 'files are'} allowed in ${name}.`,
          );
        }
        for (const file of received) assertAllowedUpload(file, this.maxBytes);
      }
    }
  }
  return mixin(DocumentUploadInterceptor);
}
