"use client"

import { useState, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import {
  Clock, Building2, UtensilsCrossed, ClipboardCheck, Users, Gift, X, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Nudge {
  _id: string
  slug: string
  type: string
  title: string
  description: string
  icon: string
  ctaLabel?: string
  ctaHref?: string
  channel: string
}

const ICON_MAP: Record<string, typeof Clock> = {
  Clock, Building2, UtensilsCrossed, ClipboardCheck, Users, Gift,
}

interface Props {
  tenantSlug: string
  /** Maximum nudges to show (default 3) */
  max?: number
  className?: string
}

/**
 * NudgeFeed — renders a compact list of actionable suggestions for the admin.
 *
 * Fetches active nudges from the API, displays them as subtle cards,
 * and allows dismissing each one. Shown in the admin layout.
 */
export default function NudgeFeed({ tenantSlug, max = 3, className }: Props) {
  const pathname = usePathname()
  const [nudges, setNudges] = useState<Nudge[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const fetchNudges = useCallback(async () => {
    try {
      const res = await fetch(`/${tenantSlug}/nudges/active`)
      if (res.ok) {
        const data = await res.json()
        setNudges(data.nudges || [])
      }
    } catch {
      // Silently fail — nudges are non-critical
    } finally {
      setLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    fetchNudges()
  }, [fetchNudges])

  const handleDismiss = async (nudgeId: string) => {
    setDismissed((prev) => new Set([...prev, nudgeId]))
    try {
      await fetch(`/${tenantSlug}/nudges/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nudgeId }),
      })
    } catch {
      // Best-effort dismiss
    }
  }

  const visibleNudges = nudges
    .filter((n) => !dismissed.has(n._id))
    .slice(0, max)

  if (loading || visibleNudges.length === 0) return null

  return (
    <div className={cn("space-y-2", className)}>
      {visibleNudges.map((nudge) => {
        const Icon = ICON_MAP[nudge.icon] || Clock
        const content = (
          <div className="group flex items-start gap-3 p-3 rounded-xl bg-blue-50/80 border border-blue-100 hover:border-blue-200 transition-all">
            <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600 mt-0.5 shrink-0">
              <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-blue-900 leading-snug">
                {nudge.title}
              </p>
              <p className="text-[11px] text-blue-700/70 mt-0.5 leading-relaxed line-clamp-2">
                {nudge.description}
              </p>
              {nudge.ctaLabel && nudge.ctaHref && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 mt-1.5 group-hover:underline">
                  {nudge.ctaLabel}
                  <ChevronRight size={10} className="mt-px" />
                </span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleDismiss(nudge._id)
              }}
              className="p-1 rounded-md hover:bg-blue-100 text-blue-400 hover:text-blue-600 transition-colors mt-0.5 shrink-0"
              title="Descartar"
            >
              <X size={12} />
            </button>
          </div>
        )

        if (nudge.ctaHref) {
          const href = nudge.ctaHref.startsWith("/") ? `/${tenantSlug}${nudge.ctaHref}` : nudge.ctaHref
          return (
            <Link key={nudge._id} href={href} className="block">
              {content}
            </Link>
          )
        }

        return <div key={nudge._id}>{content}</div>
      })}
    </div>
  )
}
