import { z } from 'zod';

/** The shape of `z.treeifyError`: messages at each node, nested by property name or array index. */
export interface ErrorTree {
  errors: string[];
  items?: (ErrorTree | null)[];
  properties?: Record<string, ErrorTree>;
}
export const ErrorTree: z.ZodType<ErrorTree> = z.object({
  errors: z.array(z.string()),
  items: z.array(z.lazy(() => ErrorTree).nullable()).optional(),
  properties: z
    .record(
      z.string(),
      z.lazy(() => ErrorTree),
    )
    .optional(),
});

/** Error body for API failures that carry a machine-readable code. */
export const ApiError = z.object({
  code: z.string().optional(),
  error: z.string(),
  /** Where each validation message applies, when a request failed schema validation; `error` holds them as text. */
  issues: ErrorTree.optional(),
});
export type ApiError = z.infer<typeof ApiError>;
