import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  Body,
  Div,
  Head,
  HTML,
  Input,
  Link,
  Main,
  Meta,
  Style,
  Tag,
  Title,
  render,
} from "fluent-html";

const CSRF_COOKIE = "print_csrf";

export function layout(
  title: string,
  children: Tag[],
  width = "60rem",
  head: Tag[] = [],
): string {
  return (
    `<!DOCTYPE html>` +
    render(
      HTML(
        Head(
          Meta().addAttribute("charset", "utf-8"),
          Meta()
            .setName("viewport")
            .setContent("width=device-width,initial-scale=1"),
          Title(title),
          Link()
            .setRel("stylesheet")
            .setHref(
              "https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css",
            ),
          Link()
            .setRel("stylesheet")
            .setHref(
              "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.2/font/bootstrap-icons.min.css",
            ),
          Style("body{padding:3rem 1rem}"),
          ...head,
        ),
        Body(
          Main(...children).setStyles({ maxWidth: width, margin: "0 auto" }),
        ),
      ).addAttribute("lang", "en"),
    )
  );
}

export function alert(
  kind: "success" | "danger" | "warning" | "info",
  message: string,
): Tag {
  return Div(message)
    .setClasses(["alert", `alert-${kind}`])
    .addAttribute("role", "alert");
}

export function issueCsrf(
  request: FastifyRequest,
  reply: FastifyReply,
  secure: boolean,
): string {
  const current = request.cookies[CSRF_COOKIE];
  const value =
    current && /^[a-f0-9]{64}$/.test(current)
      ? current
      : randomBytes(32).toString("hex");
  if (value !== current) {
    reply.setCookie(CSRF_COOKIE, value, {
      path: "/",
      httpOnly: true,
      secure,
      sameSite: "strict",
      maxAge: 3600,
    });
  }
  return value;
}

export function csrfField(token: string): Tag {
  return Input().setType("hidden").setName("csrf").setValue(token);
}

export function validCsrf(
  request: FastifyRequest,
  submitted: unknown,
): boolean {
  const cookieValue = request.cookies[CSRF_COOKIE];
  if (
    !cookieValue ||
    typeof submitted !== "string" ||
    cookieValue.length !== submitted.length
  )
    return false;
  return timingSafeEqual(Buffer.from(cookieValue), Buffer.from(submitted));
}
