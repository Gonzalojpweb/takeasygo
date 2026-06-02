import { CUISINE_OPTIONS } from '@/lib/cuisine-options'

export function CuisineSelector({ current, onChange }: { current: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CUISINE_OPTIONS.map(tag => {
        const active = current.includes(tag)
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onChange(active ? current.filter(t => t !== tag) : [...current, tag])}
            className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
              active
                ? 'bg-white text-zinc-900 border-white'
                : 'bg-zinc-700 text-zinc-400 border-zinc-600 hover:text-white'
            }`}>
            {tag}
          </button>
        )
      })}
    </div>
  )
}
