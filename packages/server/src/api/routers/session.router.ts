import express from 'express';
import type { Authenticate } from '../middleware/auth/passport';
import { principal } from '../middleware/auth/principal';

/** The signed-in Entra user, so the SPA can confirm management access. */
export default ({ authenticate }: { authenticate: Authenticate }) =>
  express
    .Router()
    .get('/', authenticate('entraUser'), (request, response) => {
      const who = principal(request);
      response.json({
        user:
          who.kind === 'entraUser'
            ? { id: who.id, roles: who.roles }
            : null,
      });
    });
