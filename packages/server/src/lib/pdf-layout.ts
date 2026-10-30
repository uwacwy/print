import { rgb, type PDFFont, type PDFPage, PageSizes } from 'pdf-lib';

// export const PAGE_WIDTH = 612;
// export const PAGE_HEIGHT = 792;
export const [PAGE_WIDTH, PAGE_HEIGHT] = PageSizes.Letter;
export const MARGIN = 54;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
export const BLACK = rgb(0, 0, 0);
export const GRAY = rgb(0.35, 0.35, 0.35);

/** Characters WinAnsi places in 0x80-0x9F, beyond ASCII and Latin-1 (dashes, curly quotes, etc.). */
const WIN_ANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const UNSUPPORTED = new RegExp(`[^\\x20-\\x7E\\u00A0-\\u00FF${WIN_ANSI_EXTRAS}]`, 'gu');

/**
 * Standard PDF fonts only cover WinAnsi; replace anything else so drawing never throws.
 * Unicode spaces (Intl puts U+202F before "PM" and U+2009 around range dashes) become plain spaces.
 */
export function winAnsi(text: string): string {
  return text
    .replace(/[\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u2010\u2011]/g, '-')
    .replace(UNSUPPORTED, '?');
}

/** Draws one centered line, shrinking the font to fit the page width; returns the size used. */
export function drawCentered(
  page: PDFPage,
  text: string,
  font: PDFFont,
  maxSize: number,
  y: number,
  color = BLACK,
): number {
  const safe = winAnsi(text);
  let size = maxSize;
  while (size > 8 && font.widthOfTextAtSize(safe, size) > CONTENT_WIDTH) size -= 1;
  page.drawText(safe, {
    x: (PAGE_WIDTH - font.widthOfTextAtSize(safe, size)) / 2,
    y,
    size,
    font,
    color,
  });
  return size;
}

export function drawTwoColumnTable(
  page: PDFPage,
  headings: readonly [string, string],
  rows: readonly (readonly [string, string])[],
  fonts: { regular: PDFFont; bold: PDFFont },
  options: {
    width: number;
    headingY: number;
    firstRowY: number;
    rowHeight: number;
    fontSize: number;
  },
): number {
  const left = (PAGE_WIDTH - options.width) / 2;
  const right = left + options.width;
  const { fontSize } = options;
  const headingRight = winAnsi(headings[1]);
  page.drawText(winAnsi(headings[0]), {
    x: left,
    y: options.headingY,
    size: fontSize,
    font: fonts.bold,
  });
  page.drawText(headingRight, {
    x: right - fonts.bold.widthOfTextAtSize(headingRight, fontSize),
    y: options.headingY,
    size: fontSize,
    font: fonts.bold,
  });
  page.drawLine({
    start: { x: left, y: options.headingY - 7 },
    end: { x: right, y: options.headingY - 7 },
    thickness: 0.5,
    color: GRAY,
  });
  rows.forEach(([label, value], index) => {
    const y = options.firstRowY - index * options.rowHeight;
    const rightText = winAnsi(value);
    const rightWidth = fonts.regular.widthOfTextAtSize(rightText, fontSize);
    const availableWidth = options.width - rightWidth - 18;
    let leftText = winAnsi(label);
    if (fonts.regular.widthOfTextAtSize(leftText, fontSize) > availableWidth) {
      while (
        leftText.length &&
        fonts.regular.widthOfTextAtSize(`${leftText}...`, fontSize) > availableWidth
      )
        leftText = leftText.slice(0, -1);
      leftText += '...';
    }
    page.drawText(leftText, { x: left, y, size: fontSize, font: fonts.regular });
    page.drawText(rightText, { x: right - rightWidth, y, size: fontSize, font: fonts.regular });
  });
  return options.firstRowY - rows.length * options.rowHeight;
}
