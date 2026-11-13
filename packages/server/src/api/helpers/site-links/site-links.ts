import type { SiteLink } from '@uwacwy/print-shared';

const isSafeUrl = (url: string): boolean =>
  /^(https?:\/\/|mailto:|\/(?!\/))/i.test(url);

/**
 * Parses `label=Privacy&url=https://example.com/privacy&label=Terms&url=/terms`
 * into links. Labels and URLs pair up in order; URLs must be http(s), mailto or root-relative.
 */
export function parseSiteLinks(query: string): SiteLink[] {
  const params = new URLSearchParams(query);
  const labels = params.getAll('label').map((v) => v.trim());
  const urls = params.getAll('url').map((v) => v.trim());
  if (labels.length !== urls.length) {
    throw new Error(
      'every label needs a matching url (label=Text&url=https://...)',
    );
  }
  return labels.map((label, index) => {
    const url = urls[index];
    if (!label || !url || !isSafeUrl(url)) {
      throw new Error(
        `link ${index + 1} needs a label and an http(s), mailto or root-relative url`,
      );
    }
    return { label, url };
  });
}
