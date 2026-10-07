import { VisitStatus } from '@prisma/client';
import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../common/pagination';
import { exportFormatSchema } from '../../export/export.service';

const statusEnum = z.nativeEnum(VisitStatus);

export const visitBody = z
  .object({
    scheduledAt: z.coerce.date(),
    agencyId: z.string().min(1),
    managerId: z.string().min(1),
    prospectId: z.string().min(1).optional().nullable(),
    customerId: z.string().min(1).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((v) => Boolean(v.prospectId) !== Boolean(v.customerId), {
    message: 'Indique exactamente un prospecto o un cliente',
    path: ['prospectId'],
  });

export const visitUpdate = z.object({
  scheduledAt: z.coerce.date().optional(),
  agencyId: z.string().min(1).optional(),
  managerId: z.string().min(1).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const visitStatusBody = z
  .object({
    status: statusEnum,
    result: z.string().trim().max(2000).optional().nullable(),
    newScheduledAt: z.coerce.date().optional(),
  })
  .refine((v) => v.status !== 'PLANNED' || Boolean(v.newScheduledAt), {
    message: 'Para reprogramar indique la nueva fecha',
    path: ['newScheduledAt'],
  });

export const visitQuery = paginationSchema.merge(dateRangeSchema).extend({
  status: statusEnum.optional(),
  agencyId: z.string().optional(),
  managerId: z.string().optional(),
  prospectId: z.string().optional(),
});
export const visitExportQuery = visitQuery.extend({ format: exportFormatSchema });
export const calendarQuery = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  status: statusEnum.optional(),
  agencyId: z.string().optional(),
  managerId: z.string().optional(),
});

export type VisitBody = z.infer<typeof visitBody>;
export type VisitUpdate = z.infer<typeof visitUpdate>;
export type VisitStatusBody = z.infer<typeof visitStatusBody>;
export type VisitQuery = z.infer<typeof visitQuery>;
export type CalendarQuery = z.infer<typeof calendarQuery>;

export const reassignBody = z.object({
  visitIds: z.array(z.string().min(1)).min(1).max(200),
  managerId: z.string().min(1),
});
export type ReassignBody = z.infer<typeof reassignBody>;
