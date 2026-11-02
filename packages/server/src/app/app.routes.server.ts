import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // The welcome page shows a live printers-online count, so it can't be prerendered.
  { path: '', renderMode: RenderMode.Client },
  { path: 'auth/callback', renderMode: RenderMode.Client },
  { path: 'manage/:slug/qr', renderMode: RenderMode.Client },
  { path: 'manage/:slug', renderMode: RenderMode.Client },
  { path: 'manage', renderMode: RenderMode.Client },
  { path: 'print/:slug', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Prerender },
];
