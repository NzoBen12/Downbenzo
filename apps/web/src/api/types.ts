export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface Ref { id: string; name?: string; fullName?: string }
export interface Agency {
  id: string; code: string; name: string; city: string | null; address: string | null; phone: string | null;
  isActive: boolean; origin: string; _count?: { managers: number; visits: number };
}
export interface Manager {
  id: string; code: string; fullName: string; email: string | null; phone: string | null; agencyId: string;
  isActive: boolean; agency?: { id: string; name: string };
}
export interface Prospect {
  id: string; fullName: string; email: string | null; phone: string | null; city: string | null; interests: string[];
  status: string; notes: string | null; createdAt: string; _count?: { visits: number };
}
export interface Visit {
  id: string; scheduledAt: string; status: string; result: string | null; notes: string | null;
  agencyId: string; managerId: string; prospectId: string | null; customerId: string | null;
  agency: { id: string; name: string }; manager: { id: string; fullName: string };
  prospect: { id: string; fullName: string } | null; customer: { id: string; fullName: string } | null;
}
export interface Customer { id: string; code: string; fullName: string }
export interface Product { id: string; code: string; name: string; isDelta: boolean; isActive: boolean }
export interface CurrencyOperation {
  id: string; operatedAt: string; currency: string; amount: string; rate: string | null; status: string;
  agency: { id: string; name: string };
}
export interface Lot { id: string; code: string; quantity: number; status: string; agency: { id: string; name: string }; _count?: { cards: number } }
export interface Card {
  id: string; reference: string; maskedPan: string; status: string;
  agency: { id: string; name: string } | null; lot: { id: string; code: string } | null;
}
export interface CardMovement { id: string; type: string; occurredAt: string; note: string | null; card: { id: string; reference: string; maskedPan: string } }
export interface UserRow {
  id: string; email: string; username: string; fullName: string; isActive: boolean; isBlocked: boolean;
  lastLoginAt: string | null; role: { id: string; code: string; name: string };
}
export interface Role { id: string; code: string; name: string; description: string | null; isSystem: boolean; userCount: number; permissions: string[] }
export interface AuditEntry {
  id: string; action: string; entity: string; entityId: string | null; result: string; createdAt: string; ip: string | null;
  before: unknown; after: unknown; user: { id: string; fullName: string; email: string } | null;
}
export interface NotificationItem { id: string; title: string; type: string; link: string | null; readAt: string | null; createdAt: string }
export interface Goal { id: string; title: string; targetValue: string; currentValue: string; periodStart: string; periodEnd: string; status: string }
export interface ActionItem { id: string; title: string; dueDate: string | null; status: string }

export interface VisitSummary {
  total: number; successful: number; cancelled: number; unsuccessful: number; deferred: number; planned: number; successRate: number;
}
export interface RankingRow { id: string; name: string; total: number; successful: number; score: number }
export interface DashboardData {
  visits: VisitSummary;
  products: { sold: number; notSold: number; delta: number; totalAmount: string };
  currency: { operations: number; byCurrency: { currency: string; operations: number; amount: string }[] };
  rankings: { managers: RankingRow[]; agencies: RankingRow[] };
  trend: { date: string; total: number; successful: number }[];
  generatedAt: string;
}
export interface SearchGroup { category: string; items: { id: string; title: string; subtitle: string; href: string }[] }
export interface ConfigItem { key: string; value: unknown; category: string }
export interface ReportData { title: string; columns: { header: string; key: string }[]; rows: Record<string, string | number>[] }
