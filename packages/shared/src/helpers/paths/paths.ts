export const agentJobFilePath = (jobId: string): string =>
  `/api/agent/jobs/${encodeURIComponent(jobId)}/file`;
export const agentJobStatusPath = (jobId: string): string =>
  `/api/agent/jobs/${encodeURIComponent(jobId)}/status`;

/** `POST`, enrollment token: creates a printer and returns its agent token. */
export const AGENT_ENROLL_PATH = '/api/agent/enroll';
/** `PATCH`, agent token: the agent reports its local `queue`. */
export const AGENT_PRINTER_PATH = '/api/agent/printer';
/** `POST`, admin: mints a short-lived enrollment token. */
export const ENROLL_TOKEN_PATH = '/api/printers/enroll-token';

/** Install script: token-specific enrollment script, or the generic one. */
export const installScriptPath = (enrollToken?: string): string =>
  enrollToken === undefined
    ? '/install.sh'
    : `/printer/${encodeURIComponent(enrollToken)}/install`;
