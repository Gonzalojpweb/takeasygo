'use client'

import type { ServiceSlot } from '@/app/api/explore/nearby/route'
import { formatWeeklySchedule } from '@/lib/service-hours'
import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  serviceHours?: { takeaway: ServiceSlot[] }
}

export default function WeeklySchedule({ serviceHours }: Props) {
  const [expanded, setExpanded] = useState(false)
  const schedule = formatWeeklySchedule(serviceHours)

  if (!schedule.length) return null

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#8a7f7a] mt-1"
      >
        {expanded ? 'Ocultar horarios' : 'Ver horarios'}
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1">
          {schedule.map(item => (
            <div
              key={item.day}
              className={`flex justify-between items-center px-3 py-1.5 rounded-lg text-xs ${
                item.isToday
                  ? 'bg-[#10b981]/10 text-[#10b981] font-bold'
                  : 'text-[#8a7f7a]'
              }`}
            >
              <span>{item.day}</span>
              <span className={item.hours === 'Cerrado' ? 'text-[#ef4444]/60' : ''}>
                {item.hours}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
