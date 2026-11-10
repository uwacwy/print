import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  CreatedPrinter,
  PrinterInput,
  PrinterSummary,
  PublicPrinter,
  Slug,
} from './printer';

const summary = {
  activeJobs: 0,
  coverPage: false,
  failedJobs: 0,
  id: 1,
  lastSeenAt: null,
  name: 'Front',
  online: false,
  pin: null,
  qrEpoch: 0,
  queue: 'q',
  slug: 'front',
};

describe('printer schemas', () => {
  it('defaults coverPage on input', () => {
    expect(
      PrinterInput.parse({
        name: 'n',
        queue: 'cups://q',
        slug: 's',
      }),
    ).toEqual({
      coverPage: false,
      name: 'n',
      queue: 'cups://q',
      slug: 's',
    });
  });

  it('normalizes text and reads checkbox-style cover pages', () => {
    expect(
      PrinterInput.parse({
        coverPage: 'on',
        name: ' Front ',
        queue: ' ipp://host/printers/a ',
        slug: ' Front-Office ',
      }),
    ).toEqual({
      coverPage: true,
      name: 'Front',
      queue: 'ipp://host/printers/a',
      slug: 'front-office',
    });
  });

  it('rejects bad names and queues with readable messages', () => {
    const issues = (input: object) =>
      z.prettifyError(
        PrinterInput.safeParse({
          name: 'n',
          queue: 'cups://q',
          slug: 's',
          ...input,
        }).error!,
      );
    expect(issues({ name: ' ' })).toContain('Name is required');
    expect(issues({ queue: 'nope' })).toContain('valid cups://');
    expect(issues({ queue: 'cups://q/extra' })).toContain(
      'cups://<queue_name>',
    );
    expect(issues({ queue: 'ipp://host/' })).toContain(
      'printer endpoint',
    );
    expect(issues({ slug: 'No Good' })).toContain(
      'Slug must be',
    );
  });

  it('checks slugs against the pattern', () => {
    expect(Slug.safeParse('front-office').success).toBe(true);
    expect(Slug.safeParse('Front Office').success).toBe(false);
  });

  it('parses a summary and the response that wraps it', () => {
    expect(PrinterSummary.parse(summary)).toEqual(summary);
    expect(
      CreatedPrinter.safeParse({
        agentToken: 't',
        printer: summary,
        serverUrl: null,
      }).success,
    ).toBe(true);
    expect(
      PrinterSummary.safeParse({ ...summary, id: '1' }).success,
    ).toBe(false);
  });

  it('parses the public view', () => {
    expect(
      PublicPrinter.safeParse({
        access: {
          pinEnabled: true,
          signedIn: false,
          token: 'not-yet-valid',
          tokenExpiresAt: null,
        },
        coverPage: false,
        name: 'n',
        slug: 's',
        upload: {
          maxCopies: 5,
          maxDocuments: 3,
          maxUploadBytes: 1,
        },
      }).success,
    ).toBe(true);
  });
});
