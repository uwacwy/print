import { describe, expect, it } from 'vitest';

import { evaluateAppClaims } from './entra-app';

describe('evaluateAppClaims', () => {
  const app = {
    azp: 'windmill-client',
    oid: 'windmill-sp',
    roles: ['Printer.PrintJob'],
  };

  it('accepts an app token holding the role', () => {
    expect(evaluateAppClaims(app, 'Printer.PrintJob')).toEqual({
      clientId: 'windmill-client',
      id: 'windmill-sp',
      kind: 'entraApp',
      roles: ['Printer.PrintJob'],
    });
  });

  it('reads the v1 appid claim', () => {
    expect(
      evaluateAppClaims(
        {
          appid: 'v1-client',
          oid: 'sp',
          roles: ['Printer.Read'],
        },
        'Printer.Read',
      ),
    ).toMatchObject({ clientId: 'v1-client' });
  });

  it('rejects an app token without the role', () => {
    expect(
      evaluateAppClaims(app, 'Printer.ManagePin'),
    ).toMatchObject({
      code: 'app_role_required',
      details: { role: 'Printer.ManagePin' },
      presented: true,
      status: 403,
    });
  });

  it('declines delegated tokens without claiming them', () => {
    expect(
      evaluateAppClaims(
        { ...app, scp: 'Printers.Manage' },
        'Printer.PrintJob',
      ),
    ).toMatchObject({
      code: 'app_token_required',
      presented: false,
    });
  });

  it('rejects tokens without a subject or client', () => {
    for (const claims of [
      { ...app, oid: undefined },
      { ...app, azp: undefined },
    ]) {
      expect(
        evaluateAppClaims(claims, 'Printer.PrintJob'),
      ).toMatchObject({ code: 'access_token_invalid' });
    }
  });
});
