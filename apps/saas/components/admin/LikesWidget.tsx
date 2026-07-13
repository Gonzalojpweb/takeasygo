'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Heart } from 'lucide-react'

interface LikedItem {
  name: string
  categoryName: string
  likesCount: number
  imageUrl: string
  itemId: string
}

export default function LikesWidget({ tenantSlug }: { tenantSlug: string }) {
  const [items, setItems] = useState<LikedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/${tenantSlug}/menu/likes`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => setItems(d.items ?? []))
      .finally(() => setLoading(false))
  }, [tenantSlug])

  if (loading) return null
  if (items.length === 0) return null

  const maxLikes = items[0]?.likesCount ?? 1

  return (
    <Card className="bg-card border-2 border-border/60 shadow-lg rounded-3xl overflow-hidden">
      <CardHeader className="border-b border-border/40 bg-muted/30 p-6 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10">
            <Heart size={20} className="text-red-500 fill-red-500" />
          </div>
          <div>
            <CardTitle className="text-foreground text-base font-bold">Platos más likeados</CardTitle>
            <p className="text-muted-foreground text-xs mt-0.5 font-medium">Lo que más le gusta a tus clientes</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-3">
        {items.map((item, i) => (
          <div key={item.itemId} className="flex items-center gap-3">
            <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}</span>
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Heart size={12} className="text-muted-foreground/40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{item.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{item.categoryName}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-red-400 transition-all"
                  style={{ width: `${(item.likesCount / maxLikes) * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold text-red-500 w-5 text-right">{item.likesCount}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
