// Informe copiable del diagnóstico (texto plano, se pega en el chat o en un mail).
import { CURRENT_BUILD } from '../build'
import type { CheckResult, Status } from './checks'

const MARK: Record<Status, string> = { ok: 'OK', warn: 'ATENCIÓN', fail: 'FALLA', skip: 'PENDIENTE' }

export function buildReport(equipo: string, results: CheckResult[], errors: Array<{ at: string; code: string; message: string }>): string {
  const lines: string[] = []
  lines.push('INFORME DIAGNÓSTICO — TakeasyGO Pantallas')
  lines.push(`Equipo: ${equipo || '(sin nombre)'}`)
  lines.push(`Fecha: ${new Date().toLocaleString('es-AR')} · Versión ${CURRENT_BUILD.version}`)
  lines.push('')
  for (const r of results) {
    lines.push(`[${MARK[r.status]}] ${r.title}: ${r.detail}`)
  }
  const device = results.find((r) => r.id === 'device')?.data
  if (device) {
    lines.push('')
    lines.push('— Equipo —')
    for (const [k, v] of Object.entries(device)) lines.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
  }
  const soak = results.find((r) => r.id === 'soak')?.data as { timeline?: Array<{ min: number; usedMB: number | null }> } | undefined
  if (soak?.timeline?.length) {
    lines.push('')
    lines.push('— Memoria en la prueba larga (min: MB) —')
    lines.push(soak.timeline.filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 12)) === 0 || i === a.length - 1).map((t) => `${t.min}: ${t.usedMB ?? '?'}`).join(' · '))
  }
  lines.push('')
  lines.push(`— Errores (${errors.length}) —`)
  for (const e of errors.slice(-30)) lines.push(`${e.at} ${e.code}: ${e.message}`)
  return lines.join('\n')
}
