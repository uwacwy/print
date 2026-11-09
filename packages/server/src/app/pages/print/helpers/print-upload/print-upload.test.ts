import { describe, expect, it } from 'vitest';
import {
  addDocument,
  buildJobBody,
  copyOptions,
  emptyUpload,
  fileSizeError,
  hasDocument,
  jobSentNotice,
  maxUploadMb,
  removeDocument,
  tokenNotice,
} from './print-upload';

const pdf = (name: string, size = 3) =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' });

describe('document rows', () => {
  it('starts with one empty row of one copy', () => {
    expect(emptyUpload(7)).toEqual({
      title: '',
      documents: [{ id: 7, file: null, copies: '1' }],
    });
  });

  it('adds and removes rows by id without mutating', () => {
    const start = emptyUpload(1);
    const added = addDocument(start, 2);
    expect(added.documents.map((d) => d.id)).toEqual([1, 2]);
    expect(start.documents).toHaveLength(1);
    expect(removeDocument(added, 1).documents.map((d) => d.id)).toEqual([
      2,
    ]);
  });

  it('detects whether any row has a file', () => {
    const { documents } = emptyUpload(1);
    expect(hasDocument(documents)).toBe(false);
    expect(hasDocument([{ ...documents[0], file: pdf('a.pdf') }])).toBe(
      true,
    );
  });
});

describe('buildJobBody', () => {
  it('numbers only the rows that have a file', () => {
    const body = buildJobBody({
      title: 'Report',
      documents: [
        { id: 1, file: null, copies: '1' },
        { id: 2, file: pdf('a.pdf'), copies: '2' },
        { id: 3, file: pdf('b.pdf'), copies: '3' },
      ],
    });
    expect(body.get('job__title')).toBe('Report');
    expect(body.get('document__copies_0')).toBe('2');
    expect((body.get('document__file_0') as File).name).toBe('a.pdf');
    expect(body.get('document__copies_1')).toBe('3');
    expect(body.has('document__file_2')).toBe(false);
  });
});

describe('limits', () => {
  it('rounds the upload limit down to whole megabytes', () => {
    expect(maxUploadMb(5 * 1048576 + 10)).toBe(5);
    expect(maxUploadMb(undefined)).toBe(0);
  });

  it('lists copy options up to the limit', () => {
    expect(copyOptions(3)).toEqual(['1', '2', '3']);
    expect(copyOptions(undefined)).toEqual(['1']);
  });

  it('flags only files over the limit', () => {
    expect(fileSizeError(pdf('big.pdf', 11), 10)).toBe(
      'big.pdf exceeds the 0 MB limit.',
    );
    expect(fileSizeError(pdf('ok.pdf', 10), 10)).toBeUndefined();
    expect(fileSizeError(null, 10)).toBeUndefined();
    expect(fileSizeError(pdf('x.pdf', 99), undefined)).toBeUndefined();
  });
});

describe('notices', () => {
  it('words the job result by agent state', () => {
    expect(jobSentNotice({ title: 'T', agentOnline: true }, 'Front')).toBe(
      '"T" was sent to Front.',
    );
    expect(
      jobSentNotice({ title: 'T', agentOnline: false }, 'Front'),
    ).toContain('is queued');
  });

  it('explains unusable tokens only', () => {
    expect(tokenNotice('expired')).toBe('This print link has expired.');
    expect(tokenNotice('invalid')).toContain('not valid');
    expect(tokenNotice('not-yet-valid')).toContain('not active');
    expect(tokenNotice('valid')).toBe('');
    expect(tokenNotice(null)).toBe('');
    expect(tokenNotice(undefined)).toBe('');
  });
});
