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
// env: CLIENT
export const ClientConfig = z.object({
  // env += _BRAND
  brand: z.object({
    // env += _LINKS
    // environment file should encode this as a query string
    // label=Link text&url=https://example.com&label=Another&url=https://...
    links: z
      .array(
        z.object({
          label: z.string(),
          url: z.string(),
        }),
      )
      .optional(),

    // if this is defined, don't look for logo.* files in packages/server/public
    /** Present when the server's static folder has a `logo.{svg,png,jpg}`. */
    // env += _LOGO
    logo: SiteLogo.optional(),

    siteTitle: z.string(),
  }),

  /** `PUBLIC_URL` is set, so the server can mint enrollment tokens and install commands. */
  enrollment: z.boolean(),

  // env += _LEGAL
  legal: z.object({
    // env += _ORG_NAME
    organizationName: z.string(),
  }),

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

  showAttribution: z.boolean().default(true),
});
export type ClientConfig = z.infer<typeof ClientConfig>;
