import { installRoutes } from '@uwacwy/print-shared';
import express, { type Request, type Response } from 'express';
import { createRouting } from 'ts-routes';

import type {
  EnrollmentConfig,
  UploadConfig,
} from '../../helpers/server-config/server-config';

import {
  INSTALL_SCRIPT_CONTENT_TYPE,
  renderErrorScript,
  renderInstallScript,
} from '../../helpers/install-script/install-script';
import { enrollTokenParam } from '../../middleware/auth/enroll-token/enroll-token.param';
import { installScriptRateLimit } from '../../middleware/rate-limits/rate-limits';

export interface InstallRouterOptions {
  /** Agent version the scripts install; the server's own version, kept in lockstep. */
  agentVersion?: string;
  enrollment?: EnrollmentConfig;
  upload: UploadConfig;
}

const sendScript = (
  response: Response,
  status: number,
  script: string,
) =>
  response
    .status(status)
    .set({
      'Cache-Control': 'no-store',
      'Content-Type': INSTALL_SCRIPT_CONTENT_TYPE,
    })
    .send(script);

const $ = createRouting(installRoutes);

/**
 * `curl -sSL <PUBLIC_URL>/printer/<enroll token>/install | bash` and the token-free
 * `/install.sh`. Mounted outside `/api` so the one-liners stay short. Failures answer with a
 * script that prints the reason, since that is all `curl | bash` shows.
 */
export default ({
  agentVersion,
  enrollment,
  upload,
}: InstallRouterOptions) => {
  const limit = installScriptRateLimit(upload);
  const script =
    (
      render: (
        serverUrl: string,
        request: Request,
        response: Response,
      ) => string,
    ): express.RequestHandler =>
    (request, response) =>
      enrollment?.serverUrl
        ? sendScript(
            response,
            200,
            render(enrollment.serverUrl, request, response),
          )
        : sendScript(
            response,
            503,
            renderErrorScript(
              'The print server has no https PUBLIC_URL, so it cannot install agents. Ask an administrator to set it.',
            ),
          );

  return express
    .Router()
    .get(
      $.install_sh.pattern,
      limit,
      script((serverUrl) =>
        renderInstallScript({ agentVersion, serverUrl }),
      ),
    )
    .get(
      $.printer.$token.install.pattern,
      limit,
      enrollTokenParam(
        upload.access,
        (response, { error, status }) =>
          sendScript(response, status, renderErrorScript(error)),
      ),
      script((serverUrl, request, response) =>
        renderInstallScript({
          agentVersion,
          enrollToken: String(request.params['token']),
          enrollTokenExpiresAt: response.locals[
            'enrollTokenExpiresAt'
          ] as Date,
          serverUrl,
        }),
      ),
    );
};
