import { $ } from '../../routes/routes';

/** Absolute URL of the enrollment (with token) or generic install script. */
export const installUrl = (
  serverUrl: string,
  enrollToken?: string,
): string =>
  new URL(
    enrollToken === undefined
      ? $.install_sh()
      : $.printer.$token.install({ token: enrollToken }),
    serverUrl,
  ).href;
