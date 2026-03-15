'use client'

import { Plus, Trash2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ScheduleSlot = { days: number[]; timeStart: string; timeEnd: string }

interface Props {
  slots: ScheduleSlot[]
  onChange: (slots: ScheduleSlot[]) => void
  label?: string
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function emptySlot(): ScheduleSlot {
  return { days: [1, 2, 3, 4, 5], timeStart: '09:00', timeEnd: '22:00' }
}

export default function ScheduleEditor({ slots, onChange, label }: Props) {
  function addSlot() {
    onChange([...slots, emptySlot()])
  }

  function removeSlot(index: number) {
    onChange(slots.filter((_, i) => i !== index))
  }

  function toggleDay(slotIndex: number, day: number) {
    const updated = slots.map((slot, i) => {
      if (i !== slotIndex) return slot
      const days = slot.days.includes(day)
        ? slot.days.filter(d => d !== day)
        : [...slot.days, day].sort((a, b) => a - b)
      return { ...slot, days }
    })
    onChange(updated)
  }

  function updateSlot(index: number, field: 'timeStart' | 'timeEnd', value: string) {
    onChange(slots.map((slot, i) => i === index ? { ...slot, [field]: value } : slot))
  }

  return (
    <div className="space-y-3">
      {label && (
        <div className="flex items-center gap-2">
          <Clock size={12} className="text-primary" />
          <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">{label}</span>
        </div>
      )}

      {slots.length === 0 && (
        <p className="text-[10px] text-muted-foreground/50 italic py-1">Sin franjas horarias configuradas</p>
      )}

      <div className="space-y-2">
        {slots.map((slot, i) => (
          <div key={i} className="flex flex-col gap-2 p-3 bg-white rounded-2xl border border-border/60 shadow-sm">
            {/* Days */}
            <div className="flex items-center gap-1 flex-wrap">
              {DAY_LABELS.map((label, dayIdx) => (
                <button
                  key={dayIdx}
                  type="button"
                  onClick={() => toggleDay(i, dayIdx)}
                  className={cn(
                    'w-9 h-7 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all',
                    slot.days.includes(dayIdx)
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Times + delete */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="time"
                  value={slot.timeStart}
                  onChange={e => updateSlot(i, 'timeStart', e.target.value)}
                  className="flex-1 bg-muted/40 border border-border/60 focus:border-primary/40 text-foreground text-xs font-medium rounded-xl px-3 py-1.5 outline-none transition-all"
                />
                <span className="text-muted-foreground text-xs font-bold">—</span>
                <input
                  type="time"
                  value={slot.timeEnd}
                  onChange={e => updateSlot(i, 'timeEnd', e.target.value)}
                  className="flex-1 bg-muted/40 border border-border/60 focus:border-primary/40 text-foreground text-xs font-medium rounded-xl px-3 py-1.5 outline-none transition-all"
                />
              </div>
              <button
                type="button"
                onClick={() => removeSlot(i)}
                className="h-8 w-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addSlot}
        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors px-1 py-1"
      >
        <Plus size={13} strokeWidth={3} />
        Agregar horario
      </button>
    </div>
  )
}
