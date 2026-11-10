import { z } from 'zod';

const ColWidth = z.number().min(1).max(12).nullable();
export const Breakpoint = z.enum(['xs', 'sm', 'md', 'lg', 'xl']);
export type Breakpoint = z.infer<typeof Breakpoint>;
export const ColWidths = z.record(Breakpoint, ColWidth);
export type ColWidths = z.infer<typeof ColWidths>;
