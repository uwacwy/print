import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import Fastify, {
  type FastifyInstance,
  type LightMyRequestResponse,
} from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getPrinterById,
  getPrinterBySlug,
  getPrinterByToken,
  getQueuedJobs,
  insertJob,
  openDatabase,
  validatePrinterFields,
  type PrintDatabase,
} from "../../../packages/server/src/lib/database/database.js";
import { registerManageRoutes } from "../manage/manage.js";
import { SessionCookies } from "../session.js";
import type { EntraConfig } from "../config/config.js";

const entra: EntraConfig = {
  tenantId: "123e4567-e89b-12d3-a456-426614174000",
  clientId: "123e4567-e89b-12d3-a456-426614174001",
  clientSecret: "secret",
  adminGroupIds: ["admins-group"],
  adminEmails: ["owner@example.org"],
};

let directory: string;
let db: PrintDatabase;
let jobsDir: string;
let app: FastifyInstance;
const disconnected: number[] = [];
const notified: number[] = [];

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "omega-manage-test-"));
  ({ db, jobsDir } = openDatabase(directory));
  disconnected.length = 0;
  notified.length = 0;
  const cookies = new SessionCookies("x".repeat(40), false, 3_600_000);
  app = Fastify();
  await app.register(cookie);
  await app.register(formbody);
  app.get<{ Querystring: { email: string; group?: string } }>(
    "/test-login",
    async (request, reply) => {
      cookies.set(reply, {
        sub: "sub",
        name: "Test",
        email: request.query.email,
        groups: request.query.group ? [request.query.group] : [],
      });
      return "ok";
    },
  );
  registerManageRoutes(app, {
    db,
    jobsDir,
    entra,
    cookies,
    publicUrl: new URL("https://print.example.org"),
    siteTitle: "Print",
    timeZone: "America/Denver",
    secureCookies: false,
    isOnline: () => false,
    disconnect: (id) => {
      disconnected.push(id);
    },
    notify: (printer) => {
      notified.push(printer.id);
    },
  });
});

afterEach(async () => {
  await app.close();
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

function cookiesFrom(
  ...responses: LightMyRequestResponse[]
): Record<string, string> {
  return Object.fromEntries(
    responses.flatMap((response) =>
      response.cookies.map((c) => [c.name, c.value]),
    ),
  );
}

async function signIn(email: string, group?: string) {
  const login = await app.inject({
    url: "/test-login",
    query: group ? { email, group } : { email },
  });
  const list = await app.inject({
    url: "/manage",
    cookies: cookiesFrom(login),
  });
  const jar = cookiesFrom(login, list);
  const csrf = /name="csrf" value="([a-f0-9]{64})"/.exec(list.body)?.[1] ?? "";
  const post = (url: string, form: Record<string, string> = {}) =>
    app.inject({
      method: "POST",
      url,
      cookies: jar,
      payload: new URLSearchParams({ csrf, ...form }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
  return { list, jar, csrf, post };
}

describe("/manage", () => {
  it("redirects anonymous users to Entra sign-in and rejects non-admins", async () => {
    const anonymous = await app.inject({ url: "/manage" });
    expect(anonymous.statusCode).toBe(302);
    expect(anonymous.headers.location).toBe("/auth/login?returnTo=%2Fmanage");
    const { list } = await signIn("volunteer@example.org", "other-group");
    expect(list.statusCode).toBe(403);
  });

  it("admits admins by email or group", async () => {
    expect((await signIn("OWNER@example.org")).list.statusCode).toBe(200);
    expect(
      (await signIn("someone@example.org", "admins-group")).list.statusCode,
    ).toBe(200);
  });

  it("accepts HTTP(S) transport URLs for IPP printers", () => {
    const fields = validatePrinterFields({
      slug: "office-http",
      name: "Office HTTP",
      queue: "https://printer.local:631/ipp/print",
    });
    expect(fields).toMatchObject({
      slug: "office-http",
      queue: "https://printer.local:631/ipp/print",
    });
  });

  it("accepts named CUPS queues and rejects CUPS paths", () => {
    expect(validatePrinterFields({ slug: "office", name: "Office", queue: "cups://HP_LaserJet_MFP_M130fw_D8F5EC" })).toMatchObject({
      queue: "cups://HP_LaserJet_MFP_M130fw_D8F5EC",
    });
    expect(validatePrinterFields({ slug: "office", name: "Office", queue: "cups://Office/other" })).toMatch(/cups:\/\//);
  });

  it("creates, edits, rotates, and deletes printers", async () => {
    const { post, jar } = await signIn("owner@example.org");

    const created = await post("/manage/printers", {
      name: "Main Office",
      slug: "main",
      queue: "ipp://printer.local:631/ipp/print",
    });
    expect(created.statusCode).toBe(200);
    const token = /<input[^>]*value="([A-Za-z0-9_-]{43})"/.exec(
      created.body,
    )?.[1];
    expect(token).toBeDefined();
    const printer = getPrinterByToken(db, token!)!;
    expect(printer).toMatchObject({
      slug: "main",
      name: "Main Office",
      queue: "ipp://printer.local:631/ipp/print",
    });
    expect(created.body).toContain("Printer destination");
    expect(created.body).toContain("ipp://printer.local:631/ipp/print");

    expect(
      (
        await post("/manage/printers", {
          name: "Dup",
          slug: "main",
          queue: "ipp://printer.local:631/ipp/print",
        })
      ).body,
    ).toContain("already exists");
    expect(
      (
        await post("/manage/printers", {
          name: "Bad",
          slug: "Bad Slug",
          queue: "ipp://printer.local:631/ipp/print",
        })
      ).statusCode,
    ).toBe(400);

    const qr = await app.inject({
      url: `/manage/printers/${printer.id}/qr.pdf`,
      cookies: jar,
    });
    expect(qr.statusCode).toBe(200);
    expect(qr.headers["content-type"]).toBe("application/pdf");
    expect(qr.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect(
      (await app.inject({ url: `/manage/printers/${printer.id}/qr.pdf` }))
        .statusCode,
    ).toBe(302);

    const queued = await post(`/manage/printers/${printer.id}/print-qr`);
    expect(queued.statusCode).toBe(303);
    expect(queued.headers.location).toBe("/manage?done=qr-queued");
    const [sheet] = getQueuedJobs(db, printer.id);
    expect(sheet).toMatchObject({
      title: "QR info sheet - Main Office",
      copies: 1,
      submitted_by: "owner@example.org",
    });
    expect(
      readFileSync(join(jobsDir, `${sheet!.id}.pdf`))
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
    expect(notified).toEqual([printer.id]);

    const edited = await post(`/manage/printers/${printer.id}`, {
      name: "Library",
      slug: "library",
      queue: "ipp://library.local:631/ipp/print",
    });
    expect(edited.statusCode).toBe(303);
    expect(getPrinterById(db, printer.id)).toMatchObject({
      slug: "library",
      name: "Library",
      queue: "ipp://library.local:631/ipp/print",
    });

    const rotated = await post(`/manage/printers/${printer.id}/rotate`);
    const newToken = /<input[^>]*value="([A-Za-z0-9_-]{43})"/.exec(
      rotated.body,
    )?.[1];
    expect(newToken).toBeDefined();
    expect(getPrinterByToken(db, token!)).toBeUndefined();
    expect(getPrinterByToken(db, newToken!)?.id).toBe(printer.id);
    expect(disconnected).toEqual([printer.id]);

    insertJob(db, {
      id: "job-1",
      printer_id: printer.id,
      title: "t",
      copies: 1,
      original_name: "a.pdf",
      submitted_by: null,
      uploader_ip: "::1",
    });
    writeFileSync(join(jobsDir, "job-1.pdf"), "%PDF-");
    const deleted = await post(`/manage/printers/${printer.id}/delete`);
    expect(deleted.statusCode).toBe(303);
    expect(getPrinterBySlug(db, "library")).toBeUndefined();
    expect(existsSync(join(jobsDir, "job-1.pdf"))).toBe(false);
    expect(disconnected).toEqual([printer.id, printer.id]);
  });

  it("rejects state changes without a valid CSRF token", async () => {
    const { jar } = await signIn("owner@example.org");
    const response = await app.inject({
      method: "POST",
      url: "/manage/printers",
      cookies: jar,
      payload: "name=X&slug=x&queue=Q&csrf=" + "0".repeat(64),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(response.statusCode).toBe(400);
    expect(getPrinterBySlug(db, "x")).toBeUndefined();
  });
});
