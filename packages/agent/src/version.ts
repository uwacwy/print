declare const __AGENT_VERSION__: string | undefined;

/** Replaced at bundle time by build.mjs; `dev` when running from source. */
export const AGENT_VERSION =
  typeof __AGENT_VERSION__ === 'string'
    ? __AGENT_VERSION__
    : 'dev';
