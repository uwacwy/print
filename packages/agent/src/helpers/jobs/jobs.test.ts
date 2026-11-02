import { describe, expect, it } from 'vitest';
import {
  checkDownloadedDocument,
  checkDownloadHeaders,
  isJobId,
} from './jobs';

const options = { maxBytes: 1024, mimeTypes: ['application/pdf'] };

describe('isJobId', () => {
  it('accepts UUIDs and rejects anything else', () => {
    expect(isJobId('0f8fad5b-d9cb-469f-a165-70867728950e')).toBe(
      true,
    );
    expect(isJobId('0F8FAD5B-D9CB-469F-A165-70867728950E')).toBe(
      true,
    );
    expect(isJobId('job-1')).toBe(false);
    expect(isJobId('../0f8fad5b-d9cb-469f-a165-70867728950e')).toBe(
      false,
    );
  });
});

describe('checkDownloadHeaders', () => {
  it('accepts a supported type within the size limit', () => {
    expect(() =>
      checkDownloadHeaders(
        {
          contentType: 'application/pdf; charset=binary',
          contentLength: '1024',
        },
        options,
      ),
    ).not.toThrow();
  });

  it('rejects unsupported or missing content types', () => {
    expect(() =>
      checkDownloadHeaders(
        { contentType: 'image/png', contentLength: null },
        options,
      ),
    ).toThrow('Printer does not accept image/png.');
    expect(() =>
      checkDownloadHeaders(
        { contentType: null, contentLength: null },
        options,
      ),
    ).toThrow('untyped documents');
  });

  it('rejects a Content-Length over maxBytes', () => {
    expect(() =>
      checkDownloadHeaders(
        { contentType: 'application/pdf', contentLength: '1025' },
        options,
      ),
    ).toThrow('exceeds the printer maxBytes');
  });
});

describe('checkDownloadedDocument', () => {
  it('returns a valid PDF', () => {
    const pdf = Buffer.from('%PDF-1.7');
    expect(
      checkDownloadedDocument('application/pdf', pdf, options),
    ).toBe(pdf);
  });

  it('rejects a body over maxBytes', () => {
    expect(() =>
      checkDownloadedDocument(
        'application/pdf',
        Buffer.alloc(1025),
        options,
      ),
    ).toThrow('exceeds the printer maxBytes');
  });

  it('rejects a PDF without the %PDF- header but not other types', () => {
    expect(() =>
      checkDownloadedDocument(
        'application/pdf',
        Buffer.from('<html>'),
        options,
      ),
    ).toThrow('not a valid PDF');
    expect(() =>
      checkDownloadedDocument(
        'image/png',
        Buffer.from('PNG'),
        options,
      ),
    ).not.toThrow();
  });
});
