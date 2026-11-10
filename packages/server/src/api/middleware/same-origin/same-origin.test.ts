import { describe, expect, it } from 'vitest';

import { addPrinter } from '../../../realtime/test-support';
import { uploadForm, useApiServer } from '../../test-support';

describe('requireSameOrigin', () => {
  const api = useApiServer();

  it('rejects cross-site uploads that lack the upload header', async () => {
    await api.start();
    addPrinter(api.db);
    expect(
      (await api.postUpload(await uploadForm(), {})).status,
    ).toBe(403);
    expect(
      (
        await api.postUpload(await uploadForm(), {
          'sec-fetch-site': 'cross-site',
          'x-print-upload': '1',
        })
      ).status,
    ).toBe(403);
  });
});
