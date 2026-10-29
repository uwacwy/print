import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export interface PrintSession {
  sub: string;
  name: string;
  email: string;
  groups: string[];
  expiresAt: number;
}

interface LoginFlow {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  expiresAt: number;
}

export class SessionCookies {
  private readonly key: Buffer;
  private readonly secure: boolean;
  private readonly sessionTtl: number;

  constructor(secret: string, secure: boolean, sessionTtl: number) {
    this.key = createHash("sha256").update(secret).digest();
    this.secure = secure;
    this.sessionTtl = sessionTtl;
  }

  private seal(value: object): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
  }

  private open<T>(value: string | undefined): T | undefined {
    if (!value) return undefined;
    try {
      const [ivText, tagText, dataText] = value.split(".");
      if (!ivText || !tagText || !dataText) return undefined;
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivText, "base64url"));
      decipher.setAuthTag(Buffer.from(tagText, "base64url"));
      return JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(dataText, "base64url")),
          decipher.final(),
        ]).toString("utf8"),
      ) as T;
    } catch {
      return undefined;
    }
  }

  read(request: FastifyRequest): PrintSession | undefined {
    const session = this.open<PrintSession>(request.cookies.print_session);
    return session && session.expiresAt > Date.now() ? session : undefined;
  }

  set(reply: FastifyReply, session: Omit<PrintSession, "expiresAt">): void {
    const value: PrintSession = { ...session, expiresAt: Date.now() + this.sessionTtl };
    reply.setCookie("print_session", this.seal(value), {
      path: "/",
      httpOnly: true,
      secure: this.secure,
      sameSite: "lax",
      maxAge: Math.floor(this.sessionTtl / 1000),
    });
  }

  clear(reply: FastifyReply): void {
    reply.clearCookie("print_session", { path: "/", secure: this.secure, sameSite: "lax" });
  }

  setFlow(reply: FastifyReply, flow: LoginFlow): void {
    reply.setCookie("entra_flow", this.seal(flow), {
      path: "/auth",
      httpOnly: true,
      secure: this.secure,
      sameSite: "lax",
      maxAge: 600,
    });
  }

  readFlow(request: FastifyRequest): LoginFlow | undefined {
    const flow = this.open<LoginFlow>(request.cookies.entra_flow);
    return flow && flow.expiresAt > Date.now() ? flow : undefined;
  }

  clearFlow(reply: FastifyReply): void {
    reply.clearCookie("entra_flow", { path: "/auth", secure: this.secure, sameSite: "lax" });
  }
}
