import { z } from 'zod';

/** A deployment's logo, shown in the page header. */
export const SiteLogo = z.object({
  /** Text alternative, from `LOGO_ALT`. */
  alt: z.string(),
  /** Root-relative URL of the image. */
  src: z.string(),
});
export type SiteLogo = z.infer<typeof SiteLogo>;

/** `GET /api/client-config`: browser sign-in settings the server reads from its environment at runtime. */
export const ClientConfig = z.object({
  /** `PUBLIC_URL` is set, so the server can mint enrollment tokens and install commands. */
  enrollment: z.boolean(),
  /** Present when the server's static folder has a `logo.{svg,png,jpg}`. */
  logo: SiteLogo.optional(),
  /** Absent when Entra sign-in is not configured. */
  msal: z
    .object({
      /** Delegated scope the SPA requests for the admin REST API. */
      apiScope: z.string(),
      authority: z.string(),
      clientId: z.string(),
      /** The SPA's callback; the browser fills it from its own origin. */
      redirectUri: z.string().optional(),
      tenantId: z.string(),
    })
    .optional(),
  publicUrl: z.string(),
});
export type ClientConfig = z.infer<typeof ClientConfig>;
