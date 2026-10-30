import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  A,
  Button,
  Code,
  Dd,
  Dl,
  Div,
  Dt,
  Form,
  H1,
  H2,
  Input,
  Label,
  P,
  Span,
  Table,
  Td,
  Th,
  Thead,
  Tr,
  type Tag,
  Tbody,
  H3,
  IfThen,
  InputTag,
  IfThenElse,
  LabelTag,
  ButtonTag,
  AnchorTag,
} from "fluent-html";
import {
  countActiveJobs,
  createPrinter,
  deletePrinter,
  getPrinterById,
  listPrinters,
  printerFields,
  rotatePrinterToken,
  updatePrinter,
  validatePrinterFields,
  type PrintDatabase,
  type PrinterFields,
  type PrinterRow,
} from "../../../packages/server/src/lib/database/database.js";
import { isEntraAdmin } from "../entra.js";
import { enqueueJob } from "../../../packages/server/src/lib/jobs.js";
import { buildQrPoster } from "../../../packages/server/src/lib/qr-poster/qr-poster.js";
import type { PrintSession, SessionCookies } from "../session.js";
import { alert, csrfField, issueCsrf, layout, validCsrf } from "../web.js";
import type { EntraConfig } from "../config/config.js";

export interface ManageOptions {
  db: PrintDatabase;
  jobsDir: string;
  entra: EntraConfig;
  cookies: SessionCookies;
  publicUrl: URL;
  siteTitle: string;
  timeZone: string;
  secureCookies: boolean;
  isOnline(printerId: number): boolean;
  disconnect(printerId: number, reason: string): void;
  notify(printer: PrinterRow): void;
}

type FormBody = Record<string, unknown> | undefined;
type IdParams = { Params: { id: string }; Body: FormBody };

const FLASH: Record<string, string> = {
  saved: "Printer saved.",
  deleted: "Printer deleted.",
  "qr-queued":
    "QR info sheet queued. It prints as soon as that printer's agent is online.",
};

namespace Bootstrap {
  export const Container = (...children: Tag[]) =>
    Div(...children).addClass("container");

  export const Row = (...children: Tag[]) => Div(...children).addClass("row");

  export const Col = (children: Tag[], colSpan?: number) =>
    Div(...children).addClass(colSpan ? "col-" + colSpan : "col");

  export const FormGroup = (
    {
      name,
      value,
      label,
      helpText,
    }: {
      name: string;
      value: string;
      label: string;
      helpText?: string;
    },
    extras: Partial<{
      input: (input: InputTag) => Tag;
      label: (label: LabelTag) => Tag;
    }> = {},
  ): Tag => {
    const e = Object.assign(
      {
        input: (i: InputTag) => i,
        label: (l: LabelTag) => l,
      },
      extras,
    );

    return Div(
      e.label(Label(label).setFor(name).addClass("form-label")),
      e.input(
        Input()
          .setId(name)
          .setName(name)
          .setValue(value)
          .addClass("form-control"),
      ),

      IfThen(!!helpText, () => Div(helpText!).addClass("form-text")),
    ).addClass("form-group");
  };

  export const ButtonGroup = (...children: (ButtonTag | AnchorTag)[]) =>
    Div(...children.map((c) => c.addClass("btn"))).addClass("btn-group");

  export const DefinitionTable = (kvps: Record<string, string | Tag>) =>
    Dl(
      ...Object.entries(kvps).flatMap(([k, v]) => [
        Dt(k).addClass("col-sm-3"),
        Dd(v).addClass("col-sm-9"),
      ]),
    );

  export const PostButton = (
    action: string,
    label: string,
    options?: Partial<{ children: Tag[]; buttonClasses: string }>,
  ) =>
    Form(
      Button(label)
        .setType("submit")
        .setClass("btn")
        .when(!!options?.buttonClasses, (b) =>
          b.addClass(options!.buttonClasses!),
        ),
      ...(options?.children ?? []),
    )
      .setMethod("post")
      .setAction(action);
}

function printerForm(
  action: string,
  csrf: string,
  values: Partial<PrinterFields>,
  submitLabel: string,
): Tag {
  const field = (
    name: "name" | "slug" | "queue",
    label: string,
    helpText: string,
    pattern?: string,
  ) =>
    Bootstrap.Col([
      Bootstrap.FormGroup(
        {
          name,
          value: values[name] ?? "",
          label,
          helpText,
        },
        { input: (i) => i.toggle("required").setPattern(pattern) },
      ),
    ]);

  return Form(
    csrfField(csrf),

    Bootstrap.Row(
      field("name", "Display name", "Shown on the upload page."),
      field(
        "slug",
        "Slug",
        "Upload URL: /p/<slug>",
        "[a-z0-9](?:[a-z0-9\\-]{0,61}[a-z0-9])?",
      ),
      field(
        "queue",
        "Printer destination",
        "cups://Queue_Name or ipp://printer.local:631/ipp/print",
      ),
    ),

    Bootstrap.Row(
      Bootstrap.Col([
        Div(
          Input()
            .setType("checkbox")
            .setId("cover_page")
            .setName("cover_page")
            .setChecked(values.cover_page ?? false)
            .addClass("form-check-input"),
          Label("Print cover page")
            .setFor("cover_page")
            .addClass("form-check-label"),
          Div(
            "Hides the document from view in the output tray. Shows the title, page count, copies, and time. Applies to new uploads only.",
          ).addClass("form-text"),
        ).setClass("form-check"),
      ]),
    ),

    Bootstrap.Row(
      Bootstrap.Col([
        Button(submitLabel).setType("submit").setClass("btn btn-primary"),
      ]),
    ),
  )
    .setClass("d-flex flex-column gap-3")
    .setMethod("post")
    .setAction(action);
}

export function registerManageRoutes(
  app: FastifyInstance,
  options: ManageOptions,
): void {
  const { db, cookies } = options;

  function requireAdmin(
    request: FastifyRequest,
    reply: FastifyReply,
  ): PrintSession | undefined {
    const session = cookies.read(request);
    if (!session) {
      void reply.redirect(
        `/auth/login?returnTo=${encodeURIComponent(request.url)}`,
      );
      return undefined;
    }
    if (!isEntraAdmin(options.entra, session)) {
      void html(
        reply,
        page("Not authorized", [
          alert(
            "danger",
            `${session.email || session.name} is not a print administrator.`,
          ),
          A("Sign out").setHref("/auth/logout"),
        ]),
        403,
      );
      return undefined;
    }
    return session;
  }

  function page(title: string, body: Tag[], session?: PrintSession): string {
    const user = session
      ? P(
          `Signed in as ${session.email || session.name} · `,
          A("Sign out").setHref("/auth/logout"),
        ).addClass("text-muted small mb-3")
      : undefined;
    return layout(
      `${title} · ${options.siteTitle}`,
      [H1(title).addClass("mb-3"), ...(user ? [user] : []), ...body],
      "60rem",
    );
  }

  function html(reply: FastifyReply, body: string, status = 200): FastifyReply {
    return reply
      .code(status)
      .header("Cache-Control", "no-store")
      .type("text/html; charset=utf-8")
      .send(body);
  }

  function formValues(body: FormBody): Partial<PrinterFields> {
    return {
      slug: String(body?.slug ?? ""),
      name: String(body?.name ?? ""),
      queue: String(body?.queue ?? ""),
      cover_page: body?.cover_page === "on",
    };
  }

  function uploadUrl(printer: PrinterRow): string {
    return new URL(
      `/p/${encodeURIComponent(printer.slug)}`,
      options.publicUrl,
    ).toString();
  }

  function qrPoster(printer: PrinterRow): Promise<Uint8Array> {
    return buildQrPoster({
      siteTitle: options.siteTitle,
      printerName: printer.name,
      url: uploadUrl(printer),
      date: new Date(),
      timeZone: options.timeZone,
    });
  }

  function tokenPage(
    printer: PrinterRow,
    token: string,
    heading: string,
    session: PrintSession,
  ): string {
    const url = uploadUrl(printer);
    return page(
      heading,
      [
        alert(
          "warning",
          "Copy this agent token now. It is stored only as a hash and will not be shown again.",
        ),

        Bootstrap.DefinitionTable({
          Printer: printer.name,
          "Printer destination": Code(printer.queue),
          "Upload page": A(url).setHref(url),
          "Server URL": Code(options.publicUrl.origin),
          "Agent token": Input()
            .setValue(token)
            .setReadonly(true)
            .setClass("form-control font-monospace")
            .addAttribute("onfocus", "this.select()"),
        }).addClass("row"),

        H3("Bare-Metal Install"),
        P(
          "On the Pi, run ",
          Code("sudo ./omega-print-agent/install.sh"),
          " and enter these values.",
        ),

        H3("Docker Install"),
        P("Coming soon"),
        A("Back to printers").setHref("/manage").addClass("btn btn-secondary"),
      ],
      session,
    );
  }

  function parseId(raw: string): number | undefined {
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
  }

  function renderList(
    request: FastifyRequest,
    reply: FastifyReply,
    session: PrintSession,
    error?: string,
    values: Partial<PrinterFields> = {},
  ) {
    const csrf = issueCsrf(request, reply, options.secureCookies);
    const flash = FLASH[(request.query as { done?: string }).done ?? ""];
    const active = countActiveJobs(db);
    const rows = listPrinters(db).map((printer) => {
      const online = options.isOnline(printer.id);
      const status = online
        ? Span("Online").setClasses(["badge", "text-bg-success"])
        : Div(
            Span("Offline").setClasses(["badge", "text-bg-secondary"]),
            Div(
              printer.last_seen_at
                ? `Last seen ${printer.last_seen_at.replace("T", " ").slice(0, 16)} UTC`
                : "Never connected",
            ).addClass("small text-muted"),
          );
      const id = printer.id;
      const postButton = (
        path: string,
        label: string,
        variant: string,
        confirmation?: string,
      ) =>
        Form(
          csrfField(csrf),
          Button(label)
            .setType("submit")
            .setClasses(["btn", "btn-sm", variant]),
        )
          .setClass("d-inline")
          .setMethod("post")
          .setAction(`/manage/printers/${id}/${path}`)
          .when(Boolean(confirmation), (form) =>
            form
              .setDataAttrs({
                confirmation: confirmation!,
              })
              .addAttribute(
                "onsubmit",
                `return confirm(this.dataset.confirmation)`,
              ),
          );
      const queueCell = printer.cover_page
        ? Div(
            Code(printer.queue),
            Div(Span("Cover page").setClasses(["badge", "text-bg-info"])),
          )
        : Code(printer.queue);
      return Tbody(
        Tr(
          Td(
            printer.name,
            Div(
              A(`/p/${printer.slug}`)
                .setHref(`/p/${encodeURIComponent(printer.slug)}`)
                .addClass("small"),
            ),
          ),
          Td(queueCell),
          Td(status),
          Td(String(active.get(id) ?? 0)),
          Td(
            A("Edit")
              .setHref(`/manage/printers/${id}`)
              .setClasses(["btn", "btn-sm", "btn-primary"]),
            A("Show QR PDF")
              .setHref(`/manage/printers/${id}/qr.pdf`)
              .setTarget("_blank")
              .setRel("noopener")
              .setClasses(["btn", "btn-sm", "btn-secondary"]),
          ).addClass("text-end text-nowrap"),
        ),
        Tr(
          Td(
            postButton("print-qr", "Print QR sheet", "btn-secondary"),
            postButton(
              "rotate",
              "Rotate token",
              "btn-warning",
              "Rotate the token? The current agent will be disconnected until it is reconfigured.",
            ),
            postButton(
              "delete",
              "Delete",
              "btn-danger",
              "Delete this printer and all of its pending jobs?",
            ),
          ).addAttribute("colspan", "5"),
        ),
      );
    });
    const table = rows.length
      ? Table(
          Thead(
            Tr(
              Th("Printer"),
              Th("Printer destination"),
              Th("Agent"),
              Th("Pending jobs"),
              Th("Actions"),
            ),
          ),
          ...rows,
        ).addClass("table align-middle")
      : P("No printers yet.").addClass("text-muted");
    const content: Tag[] = [];
    if (flash) content.push(alert("success", flash));
    if (error) content.push(alert("danger", error));
    content.push(table, H2("Add a printer"));
    content.push(printerForm("/manage/printers", csrf, values, "Add printer"));
    return html(reply, page("Printers", content, session), error ? 400 : 200);
  }

  app.get("/manage", async (request, reply) => {
    const session = requireAdmin(request, reply);
    if (!session) return reply;
    return renderList(request, reply, session);
  });

  app.post<{ Body: FormBody }>("/manage/printers", async (request, reply) => {
    const session = requireAdmin(request, reply);
    if (!session) return reply;
    if (!validCsrf(request, request.body?.csrf))
      return renderList(
        request,
        reply,
        session,
        "Your session expired. Please try again.",
      );
    const fields = validatePrinterFields(request.body ?? {});
    if (typeof fields === "string")
      return renderList(
        request,
        reply,
        session,
        fields,
        formValues(request.body),
      );
    const created = createPrinter(db, fields);
    if (typeof created === "string")
      return renderList(request, reply, session, created, fields);
    request.log.info(
      { admin: session.email, printer: fields.slug },
      "Printer created",
    );
    return html(
      reply,
      tokenPage(
        getPrinterById(db, created.id)!,
        created.token,
        "Printer added",
        session,
      ),
    );
  });

  app.get<{ Params: { id: string } }>(
    "/manage/printers/:id",
    async (request, reply) => {
      const session = requireAdmin(request, reply);
      if (!session) return reply;
      const printer = getPrinterById(db, parseId(request.params.id) ?? 0);
      if (!printer) return reply.redirect("/manage");
      const csrf = issueCsrf(request, reply, options.secureCookies);
      return html(
        reply,
        page(
          `Edit ${printer.name}`,
          [
            printerForm(
              `/manage/printers/${printer.id}`,
              csrf,
              printerFields(printer),
              "Save",
            ),
            P(A("Cancel").setHref("/manage")).addClass("mt-3"),
          ],
          session,
        ),
      );
    },
  );

  app.get<{ Params: { id: string } }>(
    "/manage/printers/:id/qr.pdf",
    async (request, reply) => {
      const session = requireAdmin(request, reply);
      if (!session) return reply;
      const printer = getPrinterById(db, parseId(request.params.id) ?? 0);
      if (!printer) return reply.redirect("/manage");
      const pdf = await qrPoster(printer);
      return reply
        .header("Cache-Control", "no-store")
        .header(
          "Content-Disposition",
          `inline; filename="print-${printer.slug}-qr.pdf"`,
        )
        .type("application/pdf")
        .send(Buffer.from(pdf));
    },
  );

  app.post<IdParams>(
    "/manage/printers/:id/print-qr",
    async (request, reply) => {
      const session = requireAdmin(request, reply);
      if (!session) return reply;
      if (!validCsrf(request, request.body?.csrf))
        return renderList(
          request,
          reply,
          session,
          "Your session expired. Please try again.",
        );
      const printer = getPrinterById(db, parseId(request.params.id) ?? 0);
      if (!printer) return reply.code(303).redirect("/manage");
      await enqueueJob(
        db,
        options.jobsDir,
        {
          printerId: printer.id,
          title: `QR info sheet - ${printer.name}`,
          copies: 1,
          originalName: `print-${printer.slug}-qr.pdf`,
          submittedBy: session.email || null,
          uploaderIp: request.ip,
        },
        await qrPoster(printer),
      );
      options.notify(printer);
      request.log.info(
        { admin: session.email, printer: printer.slug },
        "QR info sheet queued",
      );
      return reply.code(303).redirect("/manage?done=qr-queued");
    },
  );

  app.post<IdParams>("/manage/printers/:id", async (request, reply) => {
    const session = requireAdmin(request, reply);
    if (!session) return reply;

    const printer = getPrinterById(db, parseId(request.params.id) ?? 0);
    if (!printer) return reply.redirect("/manage");

    const csrf = issueCsrf(request, reply, options.secureCookies);
    const fail = (message: string, values: Partial<PrinterFields>) =>
      html(
        reply,
        page(
          `Edit ${printer.name}`,
          [
            alert("danger", message),
            printerForm(`/manage/printers/${printer.id}`, csrf, values, "Save"),
            P(A("Cancel").setHref("/manage")).addClass("mt-3"),
          ],
          session,
        ),
        400,
      );
    if (!validCsrf(request, request.body?.csrf))
      return fail(
        "Your session expired. Please try again.",
        printerFields(printer),
      );
    const fields = validatePrinterFields(request.body ?? {});
    if (typeof fields === "string")
      return fail(fields, formValues(request.body));
    const updated = updatePrinter(db, printer.id, fields);
    if (typeof updated === "string") return fail(updated, fields);
    request.log.info(
      { admin: session.email, printer: printer.slug, changes: fields },
      "Printer updated",
    );
    return reply.code(303).redirect("/manage?done=saved");
  });

  app.post<IdParams>("/manage/printers/:id/rotate", async (request, reply) => {
    const session = requireAdmin(request, reply);
    if (!session) return reply;
    if (!validCsrf(request, request.body?.csrf)) {
      return renderList(
        request,
        reply,
        session,
        "Your session expired. Please try again.",
      );
    }

    const printer = getPrinterById(db, parseId(request.params.id) ?? 0);
    const token = printer && rotatePrinterToken(db, printer.id);
    if (!printer || !token) {
      return reply.code(303).redirect("/manage");
    }

    options.disconnect(printer.id, "Token rotated");
    request.log.info(
      { admin: session.email, printer: printer.slug },
      "Printer token rotated",
    );

    return html(reply, tokenPage(printer, token, "Token rotated", session));
  });

  app.post<IdParams>("/manage/printers/:id/delete", async (request, reply) => {
    const session = requireAdmin(request, reply);
    if (!session) return reply;
    if (!validCsrf(request, request.body?.csrf))
      return renderList(
        request,
        reply,
        session,
        "Your session expired. Please try again.",
      );
    const printer = getPrinterById(db, parseId(request.params.id) ?? 0);
    const jobIds = printer && deletePrinter(db, printer.id);
    if (!printer || !jobIds) return reply.code(303).redirect("/manage");
    options.disconnect(printer.id, "Printer deleted");
    await Promise.all(
      jobIds.map((id) =>
        rm(join(options.jobsDir, `${id}.pdf`), { force: true }),
      ),
    );
    request.log.info(
      {
        admin: session.email,
        printer: printer.slug,
        jobsRemoved: jobIds.length,
      },
      "Printer deleted",
    );
    return reply.code(303).redirect("/manage?done=deleted");
  });
}
