'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Trophy, Users, Coins, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClubData {
  totalMembers: number
  membersWithPoints: number
  totalPoints: number
}

interface ClubWidgetProps {
  tenantSlug: string
}

function ClubWidgetSkeleton() {
  return (
    <Card className="rounded-2xl border">
      <CardContent className="p-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted/50 rounded-xl p-3 animate-pulse">
              <div className="h-8 w-16 bg-muted rounded mx-auto" />
              <div className="h-3 w-20 bg-muted rounded mx-auto mt-1" />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <div className="flex-1 h-10 bg-muted rounded-xl animate-pulse" />
          <div className="flex-1 h-10 bg-muted rounded-xl animate-pulse" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function ClubWidget({ tenantSlug }: ClubWidgetProps) {
  const [data, setData] = useState<ClubData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/${tenantSlug}/admin/dashboard/club`)
      .then((res) => res.json())
      .then((json) => {
        setData(json)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [tenantSlug])

  if (loading) return <ClubWidgetSkeleton />

  if (!data || data.totalMembers === 0) return null

  return (
    <Card className="rounded-2xl border">
      <CardContent className="p-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <Users className="h-5 w-5 text-primary mx-auto" />
            <p className="text-2xl font-black tabular-nums text-primary mt-1">
              {data.totalMembers}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Miembros activos</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <Coins className="h-5 w-5 text-primary mx-auto" />
            <p className="text-2xl font-black tabular-nums text-primary mt-1">
              {data.membersWithPoints}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Con puntos disponibles</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <Trophy className="h-5 w-5 text-primary mx-auto" />
            <p className="text-2xl font-black tabular-nums text-primary mt-1">
              {data.totalPoints}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Puntos en circulación</p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Link
            href={`/${tenantSlug}/admin/notificaciones`}
            className="flex-1 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Send className="h-4 w-4" />
            Enviar notificación a miembros
          </Link>
          <Link
            href={`/${tenantSlug}/admin/club`}
            className="flex-1 px-3 py-2 rounded-xl bg-muted text-foreground text-sm font-semibold border border-border flex items-center justify-center gap-2"
          >
            <Trophy className="h-4 w-4" />
            Ver detalles del club
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
