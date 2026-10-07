import { z } from 'zod';
import { paginationSchema } from '../../common/pagination';
import { exportFormatSchema } from '../../export/export.service';

export const agencyBody = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().max(80).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  isActive: z.boolean().optional(),
});
export const agencyUpdate = agencyBody.partial();
export const agencyQuery = paginationSchema.extend({
  isActive: z.enum(['true', 'false']).optional(),
  city: z.string().trim().max(80).optional(),
});
export const agencyExportQuery = agencyQuery.extend({ format: exportFormatSchema });
export type AgencyBody = z.infer<typeof agencyBody>;
export type AgencyUpdate = z.infer<typeof agencyUpdate>;
export type AgencyQuery = z.infer<typeof agencyQuery>;
