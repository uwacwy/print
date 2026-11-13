import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from './logging';

describe('createLogger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prefixes messages with the scope', () => {
    const write = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const log = createLogger('ng', 'server', 'express');
    log.ng.log('starting');
    expect(write).toHaveBeenCalledWith('[ng] starting');
  });

  it('nests scopes and camel-cases their keys', () => {
    const write = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const ngLog = createLogger('ng').ng.create(
      'router',
      'app engine',
    );
    ngLog.router.log('init');
    ngLog.appEngine.log('start');
    expect(write).toHaveBeenNthCalledWith(
      1,
      '[ng][router] init',
    );
    expect(write).toHaveBeenNthCalledWith(
      2,
      '[ng][app engine] start',
    );
  });

  it('routes each level to its console method', () => {
    const { ng } = createLogger('ng');
    for (const level of [
      'debug',
      'error',
      'info',
      'warn',
    ] as const) {
      const write = vi
        .spyOn(console, level)
        .mockImplementation(() => undefined);
      ng[level]('x', 1);
      expect(write).toHaveBeenCalledWith('[ng] x', 1);
    }
  });

  it('keeps non-string first arguments intact', () => {
    const write = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const failure = new Error('boom');
    createLogger('ng').ng.error(failure);
    expect(write).toHaveBeenCalledWith('[ng]', failure);
  });

  it('rejects unknown scopes at compile time', () => {
    const log = createLogger('ng');
    // @ts-expect-error `server` was never created
    expect(log.server).toBeUndefined();
  });
});
