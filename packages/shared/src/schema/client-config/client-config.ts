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
  site: z.object({
    /**
     * Extra links for the footer of the web app, as label/url pairs in a query string
     * @example label=Link text&url=https://example.com&label=Another&url=https://...
     */
    links: z
      .array(
        z.object({
          label: z.string(),
          url: z.string(),
        }),
      )
      .optional(),

    /** Present when the server's static folder has a `logo.{svg,png,jpg}`. */
    logo: SiteLogo.optional(),

    title: z.string(),
    url: z.url(),
    organizationName: z.string(),
    showAttribution: z.boolean().default(true),
  }),

  /** `PUBLIC_URL` is set, so the server can mint enrollment tokens and install commands. */
  enrollment: z.boolean(),

  /**
   * @deprecated
   */
  legal: z.object({
    /** @deprecated use config.site.organizationName */
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

  /**
   * @deprecated use config.site.url
   */
  publicUrl: z.string(),

  /**
   * @deprecated use config.site.showAttribution
   */
  showAttribution: z.boolean().default(true),
});
export type ClientConfig = z.infer<typeof ClientConfig>;
