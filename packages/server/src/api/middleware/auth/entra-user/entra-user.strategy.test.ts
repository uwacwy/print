import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { testEntra } from '../../../../realtime/test-support';
import { useApiServer } from '../../../test-support';

describe('entraUser strategy', () => {
  const { entra, token, bearer } = testEntra({
    adminRole: 'PrintAdmin',
    adminGroupIds: ['admin-group-id'],
  });
  const api = useApiServer({ entra });
  const roleAdmin = () =>
    bearer({
      sub: 'role-admin',
      roles: ['PrintAdmin'],
      scp: 'Printers.Manage',
    });
  const session = (authorization?: string) =>
    fetch(`${api.baseUrl}/api/session`, {
      headers: authorization ? { authorization } : {},
    });

  beforeEach(() => api.start());

  it('rejects absent, forged, and foreign-tenant tokens', async () => {
    const missing = await session();
    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toBe('Bearer');
    expect(await missing.json()).toMatchObject({
      code: 'access_token_required',
    });

    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const claims = {
      sub: 'role-admin',
      roles: ['PrintAdmin'],
      scp: 'Printers.Manage',
    };
    for (const forged of [
      await token(claims, { key: privateKey }),
      await token(claims, {
        issuer:
          'https://login.microsoftonline.com/another-tenant/v2.0',
      }),
      'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.sig',
    ]) {
      const response = await session(`Bearer ${forged}`);
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe(
        'Bearer error="invalid_token"',
      );
      expect(await response.json()).toMatchObject({
        code: 'access_token_invalid',
      });
    }
  });

  it('denies users without the scope or an admin role or group', async () => {
    const ordinary = await session(
      await bearer({ sub: 'user', scp: 'Printers.Manage' }),
    );
    expect(ordinary.status).toBe(403);
    expect(await ordinary.json()).toMatchObject({
      code: 'admin_access_required',
    });

    const wrongScope = await session(
      await bearer({
        sub: 'user',
        scp: 'User.Read',
        roles: ['PrintAdmin'],
      }),
    );
    expect(wrongScope.status).toBe(403);
    expect(await wrongScope.json()).toMatchObject({
      code: 'admin_scope_required',
      scope: 'Printers.Manage',
    });
  });

  it('accepts the admin app role or group, with v1 or v2 issuers', async () => {
    const role = await session(await roleAdmin());
    expect(role.status).toBe(200);
    expect(await role.json()).toEqual({
      user: { id: 'role-admin', roles: ['PrintAdmin'] },
    });

    const group = await session(
      await bearer({
        oid: 'group-admin-oid',
        sub: 'pairwise',
        groups: ['admin-group-id'],
        scp: 'Printers.Manage',
      }),
    );
    expect(await group.json()).toEqual({
      user: { id: 'group-admin-oid', roles: [] },
    });

    const v1 = await session(
      `Bearer ${await token(
        {
          ver: '1.0',
          sub: 'v1-admin',
          roles: ['PrintAdmin'],
          scp: 'Printers.Manage',
        },
        { issuer: `https://sts.windows.net/${entra.tenantId}/` },
      )}`,
    );
    expect(v1.status).toBe(200);
  });

  it('lets the delegated scope alone authorize when no role or group is configured', async () => {
    await api.start({
      entra: { ...entra, adminRole: undefined, adminGroupIds: [] },
    });
    expect(
      (
        await session(
          await bearer({ sub: 'user', scp: 'Printers.Manage' }),
        )
      ).status,
    ).toBe(200);
  });

  it('answers 503 to presented tokens when Entra is not configured', async () => {
    await api.start({ entra: { adminGroupIds: [] } });
    expect((await session(await roleAdmin())).status).toBe(503);
    expect((await session()).status).toBe(401);
  });
});
