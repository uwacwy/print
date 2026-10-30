import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'auth/callback', renderMode: RenderMode.Client },
    { path: 'manage/:printer_id', renderMode: RenderMode.Client },
    { path: 'manage', renderMode: RenderMode.Client },
    { path: 'print/:printer_id', renderMode: RenderMode.Client },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
