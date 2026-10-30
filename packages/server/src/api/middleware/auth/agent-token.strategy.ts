import type { Request } from 'express';
import { Strategy } from 'passport-strategy';
import {
  getPrinterByToken,
  type PrintDatabase,
} from '../../../lib/database/database.js';
import { bearer } from './credentials';
import type { AuthChallenge, Principal } from './principal';

/** Print agents authenticate with their per-printer bearer token. */
export class AgentTokenStrategy extends Strategy {
  name = 'agentToken';

  constructor(private readonly db: PrintDatabase) {
    super();
  }

  override authenticate(request: Request): void {
    const token = bearer(request);
    const printer = token
      ? getPrinterByToken(this.db, token)
      : undefined;
    if (printer) {
      return this.success({
        kind: 'agent',
        printer,
      } satisfies Principal);
    }
    this.fail(
      {
        code: token ? 'agent_token_invalid' : 'agent_token_required',
        error: 'Unauthorized',
        status: 401,
        presented: !!token,
        scheme: 'Bearer realm="print-agent"',
      } satisfies AuthChallenge,
      401,
    );
  }
}
