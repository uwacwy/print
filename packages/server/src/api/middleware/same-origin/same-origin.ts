import type { RequestHandler } from 'express';

export const UPLOAD_HEADER = 'x-print-upload';

/**
 * Cross-site forms cannot set custom headers, and without CORS a cross-origin fetch that
 * sets one fails its preflight, so requiring the header blocks CSRF without cookies.
 */
export const requireSameOrigin: RequestHandler = (
  request,
  response,
  next,
) => {
  const fetchSite = request.header('sec-fetch-site');
  if (
    request.header(UPLOAD_HEADER) !== '1' ||
    (fetchSite && fetchSite !== 'same-origin')
  ) {
    response
      .status(403)
      .json({ error: 'Refresh the page and try again.' });
    return;
  }
  next();
};
