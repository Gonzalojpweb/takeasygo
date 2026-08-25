'use client'

import { useEffect, useState } from 'react'
import { DollarSign } from 'lucide-react'
import { toPesos } from '@takeasygo/business'
import Link from 'next/link'

export function ComisionesBanner({ tenantSlug }: { tenantSlug: string }) {
  const [pending, setPending] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/${tenantSlug}/admin/dashboard/comisiones`)
      .then((res) => res.json())
      .then((data) => setPending(data.pending ?? 0))
      .catch(() => setPending(0))
  }, [tenantSlug])

  if (pending === null || pending === 0) return null

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-amber-50 border border-amber-200">
      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
        <DollarSign className="w-5 h-5 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm">Comisiones de transferencia pendientes</p>
        <p className="text-xs text-amber-700/70 mt-0.5">
          Son las comisiones de pedidos delivery pagados por transferencia bancaria. Las de MercadoPago se cobran automáticamente, estas las abonás cuando quieras.
        </p>
      </div>
      <p className="text-xl font-black tabular-nums text-amber-600 shrink-0">
        {toPesos(pending)}
      </p>
      <Link
        href={`/${tenantSlug}/admin/commissions`}
        className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shrink-0"
      >
        Pagar ahora
      </Link>
    </div>
  )
}
