import { VisitStatus } from '@prisma/client';

/** Transiciones permitidas. SUCCESSFUL, UNSUCCESSFUL y CANCELLED son estados finales. */
const TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  PLANNED: ['SUCCESSFUL', 'UNSUCCESSFUL', 'DEFERRED', 'CANCELLED'],
  DEFERRED: ['PLANNED', 'SUCCESSFUL', 'UNSUCCESSFUL', 'CANCELLED'],
  SUCCESSFUL: [],
  UNSUCCESSFUL: [],
  CANCELLED: [],
};

export function canTransition(from: VisitStatus, to: VisitStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isEditable(status: VisitStatus): boolean {
  return status === 'PLANNED' || status === 'DEFERRED';
}

export const FINAL_STATUSES: VisitStatus[] = ['SUCCESSFUL', 'UNSUCCESSFUL', 'CANCELLED'];
