import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyRequest } from 'fastify';
import WebSocket from 'ws';
import {
  A,
  Button,
  Div,
  Form,
  H1,
  Input,
  Label,
  Li,
  Option,
  P,
  render,
  Select,
  Script,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Ul,
} from 'fluent-html';
import {
  AGENT_WS_PATH,
  HEARTBEAT_INTERVAL_MS,
  parseAgentMessage,
  type JobReport,
} from '@uwacwy/print-shared';
import { loadConfig } from './config/config.js';
import { addCoverPage } from '../../packages/server/src/api/pdf/cover-page/cover-page.js';
import {
  expireStaleJobs,
  getJobForPrinter,
  getPrinterBySlug,
  getPrinterByToken,
  getQueuedJobs,
  listPrinters,
  markJobsPrinting,
  markPrinterSeen,
  openDatabase,
  purgeFinishedJobs,
  reportJob,
  resetPrintingJobs,
  type PrinterRow,
} from '../../packages/server/src/lib/database/database.js';
import { combineDocuments } from '../../packages/server/src/api/pdf/document/document.js';
import { EntraAuth } from './entra.js';
import { enqueueJob } from '../../packages/server/src/lib/database/jobs.js';
import { registerManageRoutes } from './manage/manage.js';

import { SessionCookies } from './session.js';
import {
  alert,
  csrfField,
  issueCsrf,
  layout,
  validCsrf,
} from './web.js';
import { isValidPasscode } from './config/passcode.js';

const config = loadConfig();
const { db, jobsDir } = openDatabase(config.dataDir);
const cookies = config.session
  ? new SessionCookies(
      config.session.secret,
      config.publicUrl?.protocol === 'https:',
      config.session.ttlMs,
    )
  : undefined;
const entra =
  config.entra && cookies && config.publicUrl
    ? new EntraAuth(
        config.entra,
        new URL('/auth/callback', config.publicUrl),
      )
    : undefined;
const agents = new Map<number, WebSocket>();
const secureCookies = config.publicUrl?.protocol === 'https:';

function safeReturnTo(value: unknown, fallback: string): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return fallback;
  }
  return value;
}

function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ')
    ? header.slice(7).trim()
    : undefined;
}

function authorizedAgent(
  request: FastifyRequest,
): PrinterRow | undefined {
  const token = bearerToken(request);
  return token ? getPrinterByToken(db, token) : undefined;
}

function page(
  printer: PrinterRow,
  options: {
    title: string;
    csrf: string;
    hasPasscode: boolean;
    success: boolean;
    error?: string;
  },
): string {
  const documentInput = (index: number) => {
    const fileId = `document__file_${index}`;
    const copiesId = `document__copies_${index}`;
    return Tr(
      Td(
        Label(`${index + 1}`)
          .setFor(fileId)
          .setClasses(['form-label', 'document-label', 'pt-2']),
      ),
      Td(
        Input()
          .setId(fileId)
          .setName(fileId)
          .setType('file')
          .setAccept(
            'application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif',
          )
          .setClass('form-control'),
      ),
      Td(
        Label(`Copies for document ${index + 1}`)
          .setFor(copiesId)
          .setClasses(['visually-hidden', 'copies-label']),
        Input()
          .setType('number')
          .setMin(1)
          .setValue('1')
          .setMax(config.maxCopies)
          .setStep(1)
          .setId(copiesId)
          .setName(copiesId)
          .setClass('form-control')
          .setPlaceholder('Copies'),
      ),
      Td(
        Button('Remove')
          .setType('button')
          .setClasses([
            'btn',
            'btn-outline-danger',
            'remove-document',
          ]),
      ),
    ).addClass('document-row');
  };
  const formFields = [
    Div(
      Label('Job Title')
        .setFor('job__title')
        .addClass('form-label fw-bold'),
      Input()
        .setId('job__title')
        .setName('job__title')
        .setType('text')
        .setMaxlength(120)
        .setPlaceholder('Name/Phone/Email')
        .setClass('form-control'),
      P(
        'Enter your name, a phone number, email address, or other identifier to make your job easy to find.',
      ).addClass('form-text'),
    ).addClass('mb-3'),

    Div(
      Table(
        Thead(
          Tr(Th('Document').setColspan(2), Th('Copies'), Th('')),
        ),
        Tbody(documentInput(0)).setId('document-list'),
      ).setClass('table align-middle'),
      P(
        [
          `Add up to ${config.maxDocumentsPerJob} documents.`,
          `Each file can be PDF, JPEG, PNG, or HEIC up to ${Math.floor(config.maxUploadBytes / 1048576)} MB.`,
          `Jobs may contain up to 100 pages.`,
        ].join(' '),
      ).addClass('form-text mb-2'),
      Button('Add document')
        .setId('add-document')
        .setType('button')
        .setClass('btn btn-outline-primary'),
    ).addClass('mb-3'),
  ];
  if (options.hasPasscode) {
    formFields.push(
      Div(
        Label('Passcode')
          .setFor('job__passcode')
          .addClass('form-label'),
        Input()
          .setId('job__passcode')
          .setName('job__passcode')
          .setType('password')
          .setAutocomplete('one-time-code')
          .setClass('form-control')
          .toggle('required'),
      ).addClass('mb-3'),
    );
  }
  const form = Form(
    csrfField(options.csrf),
    ...formFields,
    Button('Print')
      .setType('submit')
      .setClasses(['btn', 'btn-primary', 'btn-lg']),
  )
    .setId('upload-form')
    .setAction(`/p/${encodeURIComponent(printer.slug)}`)
    .setMethod('post')
    .setEnctype('multipart/form-data');
  const documentScript = Script(`(() => {
    const maxDocuments = ${config.maxDocumentsPerJob};
    const list = document.getElementById("document-list");
    const addButton = document.getElementById("add-document");
    const form = document.getElementById("upload-form");
    if (!list || !addButton || !form) return;
    let nextIndex = 1;
    const update = () => {
      const rows = [...list.querySelectorAll(".document-row")];
      addButton.disabled = rows.length >= maxDocuments;
      rows.forEach((row, index) => {
        const fileLabel = row.querySelector(".document-label");
        const fileInput = row.querySelector("input[type=file]");
        const copiesLabel = row.querySelector(".copies-label");
        const copiesSelect = row.querySelector("input[type=number]");
        const remove = row.querySelector(".remove-document");
        fileLabel.htmlFor = fileInput.id;
        fileLabel.textContent = (index + 1);
        copiesLabel.htmlFor = copiesSelect.id;
        copiesLabel.textContent = "Copies for document " + (index + 1);
        remove.textContent = "Remove";
        remove.disabled = rows.length <= 1;
      });
    };
    addButton.addEventListener("click", () => {
      if (list.children.length >= maxDocuments) return;
      const row = list.firstElementChild.cloneNode(true);
      const inputIndex = nextIndex++;
      const input = row.querySelector("input[type=file]");
      const copies = row.querySelector("input[type=number]");
      input.id = "document__file_" + inputIndex;
      input.name = input.id;
      input.value = "";
      copies.id = "document__copies_" + inputIndex;
      copies.name = copies.id;
      copies.value = "1";
      list.append(row);
      update();
    });
    list.addEventListener("click", (event) => {
      const remove = event.target.closest(".remove-document");
      if (!remove || list.children.length <= 1) return;
      remove.closest(".document-row").remove();
      update();
    });
    form.addEventListener("submit", (event) => {
      const inputs = [...list.querySelectorAll("input[type=file]")];
      if (inputs.some((input) => input.files && input.files.length)) return;
      event.preventDefault();
      inputs[0].setCustomValidity("Choose at least one document.");
      inputs[0].reportValidity();
      inputs[0].addEventListener("change", () => inputs[0].setCustomValidity(""), { once: true });
    });
    update();
  })();`);
  const content = [
    H1(options.title).addClass('h2'),
    P(`Print at ${printer.name}.`),
  ];
  if (options.success) {
    content.push(alert('success', 'Your print job was received.'));
  } else if (options.error) {
    content.push(alert('danger', options.error));
  }
  content.push(form, documentScript);
  return layout(options.title, content, '48rem');
}

async function main(): Promise<void> {
  if (entra) {
    await entra.initialize();
  }
  const app = Fastify({
    logger: { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit:
      config.maxUploadBytes * config.maxDocumentsPerJob + 256 * 1024,
  });
  await app.register(cookie);
  await app.register(formbody);
  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadBytes,
      files: config.maxDocumentsPerJob,
      fields: 8,
    },
  });
  await app.register(rateLimit, { global: false });
  await app.register(websocket);

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/', async (_request, reply) => {
    const printers = listPrinters(db);
    return reply
      .type('text/html; charset=utf-8')
      .send(
        `<!DOCTYPE html>` +
          render(
            layout('Print', [
              H1('Choose a printer'),
              Ul(
                ...printers.map((printer) =>
                  Li(
                    A(printer.name).setHref(
                      `/p/${encodeURIComponent(printer.slug)}`,
                    ),
                  ),
                ),
              ),
            ]),
          ),
      );
  });

  if (entra && cookies && config.publicUrl) {
    app.get('/auth/login', async (request, reply) => {
      const query = request.query as { returnTo?: unknown };
      const returnTo = safeReturnTo(query.returnTo, '/manage');
      const flow = await entra.begin(returnTo);
      cookies.setFlow(reply, { ...flow, returnTo });
      return reply.redirect(flow.url.toString());
    });
    app.get('/auth/callback', async (request, reply) => {
      const flow = cookies.readFlow(request);
      cookies.clearFlow(reply);
      if (!flow) {
        return reply
          .code(400)
          .type('text/plain')
          .send('Login expired. Please try again.');
      }
      try {
        const currentUrl = new URL(request.url, config.publicUrl);
        const principal = await entra.complete(currentUrl, flow);
        cookies.set(reply, principal);
        return reply.redirect(
          safeReturnTo(flow.returnTo, '/manage'),
        );
      } catch (error) {
        request.log.warn({ err: error }, 'Entra ID sign-in failed');
        return reply
          .code(403)
          .type('text/plain')
          .send(
            'Sign-in failed or this account is not a print administrator.',
          );
      }
    });
    app.get('/auth/logout', async (_request, reply) => {
      cookies.clear(reply);
      return reply.redirect('/');
    });

    registerManageRoutes(app, {
      db,
      jobsDir,
      entra: config.entra!,
      cookies,
      publicUrl: config.publicUrl,
      siteTitle: config.siteTitle,
      timeZone: config.timeZone,
      secureCookies,
      isOnline: (printerId) =>
        agents.get(printerId)?.readyState === WebSocket.OPEN,
      disconnect: (printerId, reason) =>
        agents.get(printerId)?.close(4002, reason),
      notify: (printer) => dispatch(printer),
    });
  }

  app.get<{
    Params: { slug: string };
    Querystring: { success?: string };
  }>('/p/:slug', async (request, reply) => {
    const printer = getPrinterBySlug(db, request.params.slug);
    if (!printer) {
      return reply
        .code(404)
        .type('text/plain')
        .send('Printer not found.');
    }
    return reply.type('text/html; charset=utf-8').send(
      page(printer, {
        title: config.siteTitle,
        csrf: issueCsrf(request, reply, secureCookies),
        hasPasscode: Boolean(config.passcode),
        success: request.query.success === '1',
      }),
    );
  });

  app.post<{ Params: { slug: string } }>(
    '/p/:slug',
    {
      config: {
        rateLimit: {
          max: config.uploadsPerMinute,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const printer = getPrinterBySlug(db, request.params.slug);
      if (!printer) {
        return reply
          .code(404)
          .type('text/plain')
          .send('Printer not found.');
      }
      const uploaded: {
        buffer: Buffer;
        fileName: string;
        index: number;
      }[] = [];
      const fields: Record<string, string> = {};
      let filePartCount = 0;
      try {
        for await (const part of request.parts()) {
          if (part.type === 'file') {
            const fileField = /^document__file_(\d+)$/.exec(
              part.fieldname,
            );
            if (!fileField) {
              throw new Error('Unexpected document field.');
            }
            filePartCount++;
            if (filePartCount > config.maxDocumentsPerJob) {
              throw new Error(
                `Upload at most ${config.maxDocumentsPerJob} documents per job.`,
              );
            }
            const buffer = await part.toBuffer();
            if (!part.filename) {
              continue;
            }
            if (!buffer.length) {
              throw new Error(`${part.filename} is an empty file.`);
            }
            uploaded.push({
              buffer,
              fileName:
                part.filename
                  .replace(/[\\/\0-\x1f]/g, '')
                  .slice(0, 180) || 'document',
              index: Number(fileField[1]),
            });
          } else {
            fields[part.fieldname] = String(part.value);
          }
        }
      } catch (error) {
        const message =
          error instanceof Error &&
          error.message.includes('larger than')
            ? `File exceeds the ${Math.floor(config.maxUploadBytes / 1048576)} MB limit.`
            : error instanceof Error &&
                /file(?:s)? limit/i.test(error.message)
              ? `Upload at most ${config.maxDocumentsPerJob} documents per job.`
              : error instanceof Error
                ? error.message
                : 'Unable to read upload.';
        return reply.code(400).type('text/plain').send(message);
      }
      if (!validCsrf(request, fields.csrf)) {
        return reply
          .code(403)
          .type('text/plain')
          .send('Refresh the page and try again.');
      }
      if (!uploaded.length) {
        return reply
          .code(400)
          .type('text/plain')
          .send('Choose at least one document to print.');
      }
      if (config.passcode) {
        let passcodeAccepted: boolean;
        try {
          passcodeAccepted = await isValidPasscode(
            config.passcode,
            fields.job__passcode,
          );
        } catch (error) {
          request.log.error(
            { err: error },
            'Passcode database check failed',
          );
          return reply
            .code(503)
            .type('text/plain')
            .send(
              'Unable to check the passcode right now. Please try again later.',
            );
        }
        if (!passcodeAccepted) {
          return reply
            .code(403)
            .type('text/plain')
            .send('Enter a valid passcode to print.');
        }
      }
      const documents = uploaded.map((document) => ({
        ...document,
        copies: Number(
          fields[`document__copies_${document.index}`] ?? 1,
        ),
      }));
      const invalidCopies = documents.some(
        ({ copies }) =>
          !Number.isInteger(copies) ||
          copies < 1 ||
          copies > config.maxCopies,
      );
      if (invalidCopies) {
        return reply
          .code(400)
          .type('text/plain')
          .send(
            `Copies must be between 1 and ${config.maxCopies} for each document.`,
          );
      }
      const submittedTitle = (fields.job__title ?? '').trim();
      const filenameTitle =
        uploaded.length === 1
          ? uploaded[0]!.fileName.replace(/\.[^.]+$/, '').trim()
          : `${uploaded.length} documents`;
      const title = (
        submittedTitle ||
        filenameTitle ||
        `Print job ${new Date().toLocaleString()}`
      ).slice(0, 120);
      const originalName = uploaded
        .map(({ fileName }) => fileName)
        .join(', ');
      let pdf: Uint8Array;
      try {
        pdf = await combineDocuments(documents);
        if (printer.cover_page) {
          pdf = await addCoverPage(pdf, {
            siteTitle: config.siteTitle,
            printerName: printer.name,
            title,
            submittedAt: new Date(),
            timeZone: config.timeZone,
            documents: documents.map((d) => ({
              titleOrFilename: d.fileName,
              copies: d.copies,
            })),
          });
        }
      } catch (error) {
        return reply
          .code(400)
          .type('text/plain')
          .send(
            error instanceof Error
              ? error.message
              : 'Unable to process document.',
          );
      }
      try {
        await enqueueJob(
          db,
          jobsDir,
          {
            printerId: printer.id,
            title,
            copies: 1,
            originalName,
            submittedBy: null,
            uploaderIp: request.ip,
          },
          pdf,
        );
      } catch (error) {
        request.log.error(
          { err: error },
          'Could not persist print job',
        );
        return reply
          .code(500)
          .type('text/plain')
          .send('Unable to queue this print job.');
      }
      dispatch(printer);
      return reply
        .code(303)
        .redirect(
          `/p/${encodeURIComponent(printer.slug)}?success=1`,
        );
    },
  );

  app.get(
    AGENT_WS_PATH,
    {
      websocket: true,
      preValidation: async (request, reply) => {
        if (!authorizedAgent(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    (socket: WebSocket, request) => {
      const printer = authorizedAgent(request);
      if (!printer) {
        return socket.close(1008, 'Unauthorized');
      }
      const previous = agents.get(printer.id);
      if (previous && previous !== socket) {
        previous.close(4001, 'Replaced by newer connection');
      }
      resetPrintingJobs(db, printer.id);
      agents.set(printer.id, socket);
      markPrinterSeen(db, printer.id);
      socket.send(
        JSON.stringify({
          type: 'hello',
          printer: { slug: printer.slug, name: printer.name },
        }),
      );
      let alive = true;
      socket.on('pong', () => {
        alive = true;
        markPrinterSeen(db, printer.id);
      });
      const heartbeat = setInterval(() => {
        if (!alive) {
          return socket.terminate();
        }
        alive = false;
        socket.ping();
      }, HEARTBEAT_INTERVAL_MS);
      socket.on('message', (raw) => {
        const message = parseAgentMessage(raw.toString());
        if (message?.type === 'sync') {
          dispatch(printer);
        }
      });
      socket.on('close', () => {
        clearInterval(heartbeat);
        if (agents.get(printer.id) === socket) {
          agents.delete(printer.id);
          resetPrintingJobs(db, printer.id);
        }
      });
      dispatch(printer);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/agent/jobs/:id/file',
    async (request, reply) => {
      const printer = authorizedAgent(request);
      if (!printer) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const job = getJobForPrinter(
        db,
        printer.id,
        request.params.id,
      );
      if (!job || job.status !== 'printing') {
        return reply.code(404).send({ error: 'Job not found' });
      }
      const filePath = join(jobsDir, `${job.id}.pdf`);
      try {
        return reply
          .type('application/pdf')
          .header(
            'Content-Disposition',
            `attachment; filename="${job.id}.pdf"`,
          )
          .send(createReadStream(filePath));
      } catch {
        return reply.code(404).send({ error: 'Job file not found' });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: JobReport }>(
    '/agent/jobs/:id/status',
    async (request, reply) => {
      const printer = authorizedAgent(request);
      if (!printer) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const body = request.body as Partial<JobReport> | undefined;
      if (
        !body ||
        (body.status !== 'printed' && body.status !== 'failed')
      ) {
        return reply
          .code(400)
          .send({ error: 'Invalid status report' });
      }
      const errorText =
        body.status === 'failed' && 'error' in body
          ? String(body.error).slice(0, 500)
          : undefined;
      if (
        !reportJob(
          db,
          printer.id,
          request.params.id,
          body.status,
          errorText,
        )
      ) {
        return reply
          .code(404)
          .send({ error: 'Job not found or already completed' });
      }
      await rm(join(jobsDir, `${request.params.id}.pdf`), {
        force: true,
      });
      return { accepted: true };
    },
  );

  function dispatch(printer: PrinterRow): void {
    const socket = agents.get(printer.id);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const queued = getQueuedJobs(db, printer.id);
    if (!queued.length) {
      return;
    }
    const jobs = markJobsPrinting(db, printer.id, queued);
    if (!jobs.length) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: 'jobs',
        jobs: jobs.map(({ id, title }) => ({ id, title })),
      }),
    );
  }

  const cleanup = setInterval(async () => {
    const now = Date.now();
    const expired = expireStaleJobs(
      db,
      new Date(now - config.jobTtlMs).toISOString(),
    );
    const removed = purgeFinishedJobs(
      db,
      new Date(now - config.retentionMs).toISOString(),
    );
    for (const id of [...expired, ...removed]) {
      await rm(join(jobsDir, `${id}.pdf`), { force: true });
    }
  }, 10 * 60_000);
  cleanup.unref();

  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    `Print server listening on ${config.host}:${config.port}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
