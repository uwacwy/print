import z from "../../../../../node_modules/zod/v4/classic/external.cjs";


const ColWidth = z.number().min(1).max(12).nullable();
type ColWidth = z.infer<typeof ColWidth>;
const Breakpoints = z.enum(['xs', 'sm', 'md', 'lg', 'xl']);
type Breakpoint = z.infer<typeof Breakpoints>;
export const ColWidths = z.record(Breakpoints, ColWidth);
export type ColWidths = z.infer<typeof ColWidths>;
const Slug = z.string().regex(/^[a-z0-9-]+$/);
