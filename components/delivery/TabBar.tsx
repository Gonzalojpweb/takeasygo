'use client'

type TabType = 'available' | 'active' | 'history'

interface Props {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  availableCount: number
  activeCount: number
  historyCount: number
}

const TABS: { key: TabType; label: string; icon: string }[] = [
  { key: 'available', label: 'Disponibles', icon: '📦' },
  { key: 'active', label: 'Activos', icon: '🚗' },
  { key: 'history', label: 'Historial', icon: '📋' },
]

export default function TabBar({ activeTab, onTabChange, availableCount, activeCount, historyCount }: Props) {
  const countMap: Record<TabType, number> = {
    available: availableCount,
    active: activeCount,
    history: historyCount,
  }

  return (
    <div className="flex gap-1 mb-6 bg-zinc-100 rounded-xl p-1">
      {TABS.map(tab => {
        const isActive = activeTab === tab.key
        const count = countMap[tab.key]
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`flex-1 py-2.5 px-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
              isActive
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
            {count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                isActive ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-600'
              }`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
