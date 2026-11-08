import { installScriptPath } from '../paths/paths.js';

/** Absolute URL of the enrollment (with token) or generic install script. */
export const installUrl = (
  serverUrl: string,
  enrollToken?: string,
): string => new URL(installScriptPath(enrollToken), serverUrl).href;
