import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequestContext } from '../../auth/auth.types';
import { Ctx } from '../../auth/decorators';
import { dataScope } from '../../common/scope';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

const searchQuery = z.object({ q: z.string().trim().min(2).max(100), limit: z.coerce.number().int().min(1).max(20).default(5) });
type SearchQuery = z.infer<typeof searchQuery>;
const ci = (q: string) => ({ contains: q, mode: 'insensitive' as const });

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search({ q, limit }: SearchQuery, ctx: RequestContext) {
    const user = ctx.user!;
    const has = (p: string) => user.permissions.includes(p);
    const scope = dataScope(user);
    const none = Promise.resolve([] as never[]);
    const [agencies, managers, prospects, customers, visits, cards, lots] = await Promise.all([
      has('agencies.read')
        ? this.prisma.agency.findMany({ where: { deletedAt: null, ...(scope.agencyId ? { id: scope.agencyId } : {}), OR: [{ name: ci(q) }, { code: ci(q) }] }, take: limit, select: { id: true, name: true, code: true } })
        : none,
      has('managers.read')
        ? this.prisma.manager.findMany({ where: { deletedAt: null, ...(scope.agencyId ? { agencyId: scope.agencyId } : {}), OR: [{ fullName: ci(q) }, { code: ci(q) }] }, take: limit, select: { id: true, fullName: true, code: true } })
        : none,
      has('prospects.read')
        ? this.prisma.prospect.findMany({ where: { deletedAt: null, OR: [{ fullName: ci(q) }, { email: ci(q) }] }, take: limit, select: { id: true, fullName: true, status: true } })
        : none,
      has('customers.read')
        ? this.prisma.customer.findMany({ where: { OR: [{ fullName: ci(q) }, { code: ci(q) }] }, take: limit, select: { id: true, fullName: true, code: true } })
        : none,
      has('visits.read')
        ? this.prisma.visit.findMany({
            where: { deletedAt: null, ...(scope.agencyId ? { agencyId: scope.agencyId } : {}), ...(scope.managerId ? { managerId: scope.managerId } : {}),
              OR: [{ prospect: { fullName: ci(q) } }, { customer: { fullName: ci(q) } }, { notes: ci(q) }] },
            take: limit, orderBy: { scheduledAt: 'desc' },
            select: { id: true, scheduledAt: true, status: true, prospect: { select: { fullName: true } }, customer: { select: { fullName: true } } },
          })
        : none,
      has('cards.read')
        ? this.prisma.card.findMany({ where: { ...(scope.agencyId ? { agencyId: scope.agencyId } : {}), reference: ci(q) }, take: limit, select: { id: true, reference: true, maskedPan: true } })
        : none,
      has('lots.read')
        ? this.prisma.lot.findMany({ where: { ...(scope.agencyId ? { agencyId: scope.agencyId } : {}), code: ci(q) }, take: limit, select: { id: true, code: true, status: true } })
        : none,
    ]);
    return {
      results: [
        { category: 'agencies', items: agencies.map((a) => ({ id: a.id, title: a.name, subtitle: a.code, href: `/agencies/${a.id}` })) },
        { category: 'managers', items: managers.map((m) => ({ id: m.id, title: m.fullName, subtitle: m.code, href: `/managers/${m.id}` })) },
        { category: 'prospects', items: prospects.map((p) => ({ id: p.id, title: p.fullName, subtitle: p.status, href: `/prospects/${p.id}` })) },
        { category: 'customers', items: customers.map((c) => ({ id: c.id, title: c.fullName, subtitle: c.code, href: `/customers` })) },
        { category: 'visits', items: visits.map((v) => ({ id: v.id, title: v.prospect?.fullName ?? v.customer?.fullName ?? 'Visita', subtitle: `${v.scheduledAt.toISOString().slice(0, 10)} · ${v.status}`, href: `/visits/${v.id}` })) },
        { category: 'cards', items: cards.map((c) => ({ id: c.id, title: c.reference, subtitle: c.maskedPan, href: `/cards/${c.id}` })) },
        { category: 'lots', items: lots.map((l) => ({ id: l.id, title: l.code, subtitle: l.status, href: `/lots/${l.id}` })) },
      ].filter((g) => g.items.length > 0),
    };
  }
}

@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}
  @Get()
  search(@Query(new ZodPipe(searchQuery)) q: SearchQuery, @Ctx() ctx: RequestContext) { return this.service.search(q, ctx); }
}

@Module({ controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}
