import { NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { reservationsAdminContext } from '@/lib/reservations/admin-access'
import { buildReportQuery, groupCustomers, loadReportRows, parseReportFilters } from '@/lib/reservations/report'

// ============================================================================
// GET /api/[tenant]/reservas/contacts/export — contactos para novedades/promos
// ============================================================================
// SOLO clientes que aceptaron recibir novedades al reservar (Ley 25.326) y
// solo el administrador. Mismos filtros y alcance de sede que el reporte.
// Celdas que empiezan con = + - @ se neutralizan (inyección de fórmulas).
// La exportación queda en la auditoría (cuántos contactos, quién, filtros).
// ============================================================================

function cell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const ctx = await reservationsAdminContext(request, tenant, ['admin'])
  if (ctx instanceof NextResponse) return ctx

  const raw = Object.fromEntries(new URL(request.url).searchParams.entries())
  const filters = parseReportFilters(raw)
  const { rows, truncated } = await loadReportRows(buildReportQuery(ctx.tenantId, filters, ctx.scopeLocationIds))
  const customers = groupCustomers(rows).filter((c) => c.optIn)

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'reservations.contacts.export',
    entity: 'Reservation',
    entityId: ctx.tenantId,
    details: { contacts: customers.length, from: filters.from, to: filters.to, basis: filters.basis, locationId: filters.locationId, truncated },
    request,
    userId: ctx.userId,
    userRole: ctx.role,
  })

  const header = ['Nombre', 'Teléfono', 'Email', 'Reservas', 'Comensales', 'Vino', 'No vino', 'Última reserva', 'Cliente desde']
  const lines = customers.map((c) =>
    [c.name, c.phone, c.email, c.reservations, c.guests, c.seated, c.noShows, c.lastDate, new Date(c.firstAt.getTime() - 3 * 3600_000).toISOString().slice(0, 10)].map(cell).join(';')
  )
  const csv = '﻿' + [header.map(cell).join(';'), ...lines].join('\r\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="contactos-reservas-${filters.from}-al-${filters.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
