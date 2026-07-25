'use client'

import type { ServiceSlot } from '@/app/api/explore/nearby/route'
import { formatWeeklySchedule } from '@/lib/service-hours'
import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useHaptic } from '@/components/tgo/useHaptic'

interface Props {
  serviceHours?: { takeaway: ServiceSlot[] }
}

export default function WeeklySchedule({ serviceHours }: Props) {
  const haptic = useHaptic()
  const [expanded, setExpanded] = useState(false)
  const schedule = formatWeeklySchedule(serviceHours)

  if (!schedule.length) return null

  return (
    <div>
      <button
        onClick={() => { haptic.selection(); setExpanded(!expanded) }}
        className="flex items-center gap-1.5"
        style={{
          color: 'var(--tgo-text-muted)',
          fontSize: 'var(--tgo-type-caption)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 'var(--tgo-tracking-wider)',
          marginTop: 4,
        }}
      >
        {expanded ? 'Ocultar horarios' : 'Ver horarios'}
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1">
          {schedule.map((item) => (
            <div
              key={item.day}
              className="flex justify-between items-center"
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--tgo-radius-sm)',
                fontSize: 'var(--tgo-type-caption)',
                backgroundColor: item.isToday ? 'var(--tgo-state-success-soft)' : 'transparent',
                color: item.isToday ? 'var(--tgo-state-success)' : 'var(--tgo-text-muted)',
                fontWeight: item.isToday ? 700 : 400,
              }}
            >
              <span>{item.day}</span>
              <span style={{ color: item.hours === 'Cerrado' ? 'var(--tgo-state-danger)' : 'inherit', opacity: item.hours === 'Cerrado' ? 0.6 : 1 }}>
                {item.hours}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
