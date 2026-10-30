import { describe, expect, it } from 'vitest';
import { setPrinterPin } from '../../../lib/database/database.js';
import { addPrinter } from '../../../realtime/test-support';
import { useApiServer } from '../../test-support';

describe('rate limits', () => {
  const api = useApiServer();

  it('locks out a client after repeated wrong PINs', async () => {
    await api.start();
    const { id } = addPrinter(api.db);
    setPrinterPin(api.db, id, '123456789');

    for (
      let attempt = 0;
      attempt < api.upload.access.pinMaxFailures;
      attempt++
    ) {
      expect((await api.exchangePin('000000000')).status).toBe(401);
    }
    const locked = await api.exchangePin('123456789');
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({
      code: 'pin_locked',
    });
  });
});
