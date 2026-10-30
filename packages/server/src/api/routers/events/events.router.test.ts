import { describe, expect, it } from 'vitest';
import {
  addPrinter,
  testEntra,
} from '../../../realtime/test-support';
import { uploadForm, useApiServer } from '../../test-support';

/** Reads SSE frames from a fetch response body. */
async function* sseEvents(response: Response) {
  const reader = response
    .body!.pipeThrough(new TextDecoderStream())
    .getReader();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      return;
    }
    buffer += value;
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n');
      if (data) {
        yield JSON.parse(data) as {
          type: string;
          [key: string]: unknown;
        };
      }
    }
  }
}

describe('events router', () => {
  const { entra, bearer } = testEntra();
  const api = useApiServer({ entra });
  const adminBearer = () =>
    bearer({ sub: 'admin', scp: 'Printers.Manage' });

  it('streams agent and job events to admins over SSE', async () => {
    await api.start();
    const { id, token } = addPrinter(api.db);
    const controller = new AbortController();
    const stream = await fetch(`http://${api.host}/api/events`, {
      headers: { authorization: await adminBearer() },
      signal: controller.signal,
    });
    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toContain(
      'text/event-stream',
    );
    const events = sseEvents(stream);

    await expect(events.next()).resolves.toMatchObject({
      value: { type: 'snapshot', onlinePrinterIds: [] },
    });

    await api.connectAgent(token);
    await expect(events.next()).resolves.toMatchObject({
      value: { type: 'agent', printerId: id, online: true },
    });

    await api.postUpload(await uploadForm());
    await expect(events.next()).resolves.toMatchObject({
      value: {
        type: 'job',
        printerId: id,
        status: 'queued',
        activeJobs: 1,
      },
    });
    await expect(events.next()).resolves.toMatchObject({
      value: {
        type: 'job',
        printerId: id,
        status: 'printing',
        activeJobs: 1,
      },
    });
    controller.abort();
  });

  it('requires admin auth for the event stream', async () => {
    await api.start();
    expect(
      (await fetch(`http://${api.host}/api/events`)).status,
    ).toBe(401);
  });
});
