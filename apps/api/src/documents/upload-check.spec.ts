import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  ALLOWED_TYPES,
  assertAllowedUpload,
  maxUploadBytes,
  tooLargeMessage,
  WRONG_TYPE_MESSAGE,
} from './upload-check.js';

const MB = 1024 * 1024;
const MAX = 10 * MB;

function file(originalname: string, mimetype: string, size = 1024) {
  return { originalname, mimetype, size };
}

function rejection(fn: () => unknown): { status: number; message: string } {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const e = error as BadRequestException;
    return { status: e.getStatus(), message: e.message };
  }
  throw new Error('Expected a rejection.');
}

describe('assertAllowedUpload', () => {
  it('accepts a PDF and a DOCX, returning the extension to store', () => {
    expect(assertAllowedUpload(file('form.pdf', ALLOWED_TYPES.pdf), MAX)).toBe(
      'pdf',
    );
    expect(
      assertAllowedUpload(file('Form.DOCX', ALLOWED_TYPES.docx), MAX),
    ).toBe('docx');
  });

  it('accepts a file of exactly the maximum size', () => {
    expect(
      assertAllowedUpload(file('a.pdf', ALLOWED_TYPES.pdf, MAX), MAX),
    ).toBe('pdf');
  });

  it.each([
    ['a wrong content type', file('form.pdf', 'image/png')],
    ['a wrong extension', file('form.png', ALLOWED_TYPES.pdf)],
    ['no extension', file('form', ALLOWED_TYPES.pdf)],
    ['a legacy .doc file', file('form.doc', 'application/msword')],
    [
      'an extension that does not match the type',
      file('form.docx', ALLOWED_TYPES.pdf),
    ],
    [
      'an inherited object key as extension',
      file('form.constructor', ALLOWED_TYPES.pdf),
    ],
  ])('rejects %s with 400', (_case, f) => {
    expect(rejection(() => assertAllowedUpload(f, MAX))).toEqual({
      status: 400,
      message: WRONG_TYPE_MESSAGE,
    });
  });

  it('rejects an oversized file with 400', () => {
    const f = file('form.pdf', ALLOWED_TYPES.pdf, MAX + 1);
    expect(rejection(() => assertAllowedUpload(f, MAX))).toEqual({
      status: 400,
      message: tooLargeMessage(MAX),
    });
    expect(tooLargeMessage(MAX)).toBe('Each file must be 10 MB or smaller.');
  });
});

describe('maxUploadBytes', () => {
  const config = (value: unknown) =>
    ({ get: () => value }) as unknown as ConfigService;

  it('reads MAX_UPLOAD_MB in bytes', () => {
    expect(maxUploadBytes(config('10'))).toBe(MAX);
  });

  it.each([undefined, '', '0', '-1', '1.5', 'ten'])('refuses %o', (value) => {
    expect(() => maxUploadBytes(config(value))).toThrow();
  });
});
