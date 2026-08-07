'use client'

import { useState, useEffect } from 'react'
import { QrCode, Smartphone, Monitor, HelpCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface DailyScan {
  date: string
  total: number
  unique: number
}

interface ReferrerStat {
  referrer: string
  count: number
}

interface RecentScan {
  sessionId: string
  deviceType: 'mobile' | 'desktop' | 'unknown'
  ip: string | null
  userAgent: string | null
  referrer: string | null
  landingPath: string | null
  createdAt: string
}

interface InviteScansData {
  summary: {
    totalScans: number
    uniqueScans: number
    days: number
    devices: { mobile: number; desktop: number; unknown: number }
    mobilePercent: number
  }
  daily: DailyScan[]
  referrers: ReferrerStat[]
  recentScans: RecentScan[]
}

function DeviceIcon({ type }: { type: string }) {
  if (type === 'mobile') return <Smartphone size={14} className="text-blue-500" />
  if (type === 'desktop') return <Monitor size={14} className="text-zinc-500" />
  return <HelpCircle size={14} className="text-zinc-400" />
}

function DeviceLabel({ type }: { type: string }) {
  if (type === 'mobile') return 'Mobile'
  if (type === 'desktop') return 'Desktop'
  return 'Otro'
}

function parseBrowser(ua: string | null): string {
  if (!ua) return 'Desconocido'
  if (/instagram/i.test(ua)) return 'Instagram'
  if (/whatsapp/i.test(ua)) return 'WhatsApp'
  if (/facebook/i.test(ua)) return 'Facebook'
  if (/twitter|x\.com/i.test(ua)) return 'Twitter/X'
  if (/chrome/i.test(ua)) return 'Chrome'
  if (/safari/i.test(ua)) return 'Safari'
  if (/firefox/i.test(ua)) return 'Firefox'
  if (/edge/i.test(ua)) return 'Edge'
  return 'Otro'
}

export default function InviteScansDashboard() {
  const [data, setData] = useState<InviteScansData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(90)

  useEffect(() => {
    fetchData()
  }, [days])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch(`/api/superadmin/invite-scans?days=${days}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error('Error fetching invite scans:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !data) {
    return <div className="p-8 text-center text-zinc-500">Cargando datos de scans...</div>
  }

  if (!data) {
    return <div className="p-8 text-center text-zinc-500">Error al cargar datos</div>
  }

  const { summary, daily, referrers, recentScans } = data
  const maxDaily = Math.max(...daily.map(d => d.total), 1)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <QrCode className="text-zinc-400" />
            Scans del QR de Invitación
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            tracking de la URL: <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-xs">takeasygo.com/app?source=invitacion</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
          <button
            onClick={fetchData}
            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Total Scans</p>
          <p className="text-3xl font-bold text-zinc-900 mt-1">{summary.totalScans.toLocaleString()}</p>
          <p className="text-xs text-zinc-400 mt-1">Últimos {summary.days} días</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Scans Únicos</p>
          <p className="text-3xl font-bold text-zinc-900 mt-1">{summary.uniqueScans.toLocaleString()}</p>
          <p className="text-xs text-zinc-400 mt-1">Por sesión</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Mobile</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{summary.mobilePercent}%</p>
          <p className="text-xs text-zinc-400 mt-1">{summary.devices.mobile.toLocaleString()} scans</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Desktop</p>
          <p className="text-3xl font-bold text-zinc-600 mt-1">{100 - summary.mobilePercent}%</p>
          <p className="text-xs text-zinc-400 mt-1">{summary.devices.desktop.toLocaleString()} scans</p>
        </div>
      </div>

      {/* Daily Chart */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6">
        <h2 className="text-sm font-semibold text-zinc-700 mb-4">Scans por día (últimos 30 días)</h2>
        <div className="flex items-end gap-1 h-40">
          {daily.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-zinc-900 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap">
                  {format(new Date(d.date + 'T12:00:00'), 'd MMM', { locale: es })}: {d.total} scans ({d.unique} únicos)
                </div>
              </div>
              <div
                className="w-full bg-blue-500 rounded-t-sm transition-all hover:bg-blue-600"
                style={{ height: `${(d.total / maxDaily) * 100}%`, minHeight: d.total > 0 ? '4px' : '1px' }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-zinc-400">
          <span>{daily.length > 0 ? format(new Date(daily[0].date + 'T12:00:00'), 'd MMM', { locale: es }) : '-'}</span>
          <span>{daily.length > 0 ? format(new Date(daily[daily.length - 1].date + 'T12:00:00'), 'd MMM', { locale: es }) : '-'}</span>
        </div>
      </div>

      {/* Device + Referrer breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Devices */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">Por Dispositivo</h2>
          <div className="space-y-3">
            {[
              { type: 'mobile', label: 'Mobile', count: summary.devices.mobile, color: 'bg-blue-500' },
              { type: 'desktop', label: 'Desktop', count: summary.devices.desktop, color: 'bg-zinc-500' },
              { type: 'unknown', label: 'Otro/Bot', count: summary.devices.unknown, color: 'bg-zinc-300' },
            ].map(d => (
              <div key={d.type} className="flex items-center gap-3">
                <DeviceIcon type={d.type} />
                <span className="text-sm text-zinc-600 w-20">{d.label}</span>
                <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', d.color)}
                    style={{ width: summary.totalScans > 0 ? `${(d.count / summary.totalScans) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-sm font-medium text-zinc-900 w-12 text-right">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Referrers */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">Por Referrer</h2>
          {referrers.length === 0 ? (
            <p className="text-sm text-zinc-400">Sin datos de referrer</p>
          ) : (
            <div className="space-y-2">
              {referrers.map(r => (
                <div key={r.referrer} className="flex items-center gap-2 text-sm">
                  <ExternalLink size={12} className="text-zinc-400 shrink-0" />
                  <span className="text-zinc-600 truncate flex-1">{r.referrer}</span>
                  <span className="font-medium text-zinc-900">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent scans table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="p-6 border-b border-zinc-100">
          <h2 className="text-sm font-semibold text-zinc-700">Últimos 50 scans</h2>
        </div>
        {recentScans.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            No hay scans registrados con source=invitacion
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase border-b border-zinc-100">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Dispositivo</th>
                  <th className="px-4 py-3 font-medium">Navegador</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                  <th className="px-4 py-3 font-medium">Referrer</th>
                  <th className="px-4 py-3 font-medium">Sesión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {recentScans.map((scan, i) => (
                  <tr key={i} className="hover:bg-zinc-50/50 transition">
                    <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">
                      {format(new Date(scan.createdAt), 'd MMM yyyy, HH:mm', { locale: es })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <DeviceIcon type={scan.deviceType} />
                        <DeviceLabel type={scan.deviceType} />
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {parseBrowser(scan.userAgent)}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs">
                      {scan.ip || '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs max-w-[200px] truncate">
                      {scan.referrer || '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 font-mono text-xs">
                      {scan.sessionId.slice(0, 8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
