import { describe, expect, it } from 'vitest';

import {
  checkDownloadedDocument,
  checkDownloadHeaders,
  isJobId,
} from './jobs';

const options = {
  maxBytes: 1024,
  mimeTypes: ['application/pdf'],
};

describe('isJobId', () => {
  it('accepts UUIDs and rejects anything else', () => {
    expect(isJobId('0f8fad5b-d9cb-469f-a165-70867728950e')).toBe(
      true,
    );
    expect(isJobId('0F8FAD5B-D9CB-469F-A165-70867728950E')).toBe(
      true,
    );
    expect(isJobId('job-1')).toBe(false);
    expect(
      isJobId('../0f8fad5b-d9cb-469f-a165-70867728950e'),
    ).toBe(false);
  });
});

describe('checkDownloadHeaders', () => {
  it('accepts a supported type within the size limit', () => {
    expect(() =>
      checkDownloadHeaders(
        {
          contentLength: '1024',
          contentType: 'application/pdf; charset=binary',
        },
        options,
      ),
    ).not.toThrow();
  });

  it('rejects unsupported or missing content types', () => {
    expect(() =>
      checkDownloadHeaders(
        { contentLength: null, contentType: 'image/png' },
        options,
      ),
    ).toThrow('Printer does not accept image/png.');
    expect(() =>
      checkDownloadHeaders(
        { contentLength: null, contentType: null },
        options,
      ),
    ).toThrow('untyped documents');
  });

  it('rejects a Content-Length over maxBytes', () => {
    expect(() =>
      checkDownloadHeaders(
        {
          contentLength: '1025',
          contentType: 'application/pdf',
        },
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
