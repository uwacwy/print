import { z } from 'zod';

/** A deployment's logo, shown in the page header. */
export const SiteLogo = z.object({
  /** Text alternative, from `SITE_LOGO_ALT` (default `SITE_ORG_NAME`). */
  alt: z.string(),
  /** Image URL, from `SITE_LOGO_URL` or a `logo.{svg,png,jpg}` in the server's static folder. */
  url: z.string(),
});
export type SiteLogo = z.infer<typeof SiteLogo>;

/** Footer links, from `SITE_FOOTER_LINKS`. */
export const SiteLink = z.object({
  label: z.string(),
  url: z.string(),
});
export type SiteLink = z.infer<typeof SiteLink>;

/** Branding and address of this deployment, from the server's `SITE_*` variables. */
export const SiteConfig = z.object({
  links: z.array(SiteLink).optional(),
  /** Absent when there is no logo to show. */
  logo: SiteLogo.optional(),
  /** Named in the footer copyright notice, from `SITE_ORG_NAME`. */
  organizationName: z.string(),
  /** Show the package name and version in the footer, from `SITE_SHOW_ATTRIBUTION`. */
  showAttribution: z.boolean().default(true),
  /** From `SITE_TITLE`. */
  title: z.string(),
  /** The address people use, from `SITE_URL`. */
  url: z.url(),
});
export type SiteConfig = z.infer<typeof SiteConfig>;

/** `GET /api/client-config`: browser settings the server reads from its environment at runtime. */
export const ClientConfig = z.object({
  /** `SITE_URL` is https (or loopback), so the server can mint enrollment tokens and install commands. */
  enrollment: z.boolean(),

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

  site: SiteConfig,
});
export type ClientConfig = z.infer<typeof ClientConfig>;
