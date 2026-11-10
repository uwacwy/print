/** The singular or plural form of a noun for `count`, e.g. `${n} ${inflect(n, 'copy', 'copies')}`. */
export const inflect = (
  count: number,
  singular: string,
  plural = `${singular}s`,
): string => (count === 1 ? singular : plural);
