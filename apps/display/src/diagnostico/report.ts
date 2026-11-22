// Informe copiable del diagnóstico (texto plano, se pega en el chat o en un mail).
import { CURRENT_BUILD } from '../build'
import { cutLines, type CheckResult, type Status } from './checks'
import type { SoakMinute, SoakSummary } from './monitor'

const MARK: Record<Status, string> = { ok: 'OK', warn: 'ATENCIÓN', fail: 'FALLA', skip: 'PENDIENTE' }

export function buildReport(equipo: string, results: CheckResult[], errors: Array<{ at: string; code: string; message: string }>): string {
  const lines: string[] = []
  lines.push('INFORME DIAGNÓSTICO — TakeasyGO Pantallas')
  lines.push(`Equipo: ${equipo || '(sin nombre)'}`)
  lines.push(`Fecha: ${new Date().toLocaleString('es-AR')} · Versión ${CURRENT_BUILD.version}`)
  lines.push('')
  for (const r of results) {
    lines.push(`[${MARK[r.status]}] ${r.title}: ${r.detail}`)
    // Cada corte con su motivo: equipo / salto de la prueba / pantalla oculta.
    for (const c of cutLines(r.data)) lines.push(`    corte ${c}`)
  }
  lines.push('')
  lines.push('Cortes: «waiting» = el video se detuvo esperando cuadros (lo que se ve como corte); «stalled» = sin datos ~3 s (informativo). Solo los de motivo «equipo» cuentan.')
  const device = results.find((r) => r.id === 'device')?.data
  if (device) {
    lines.push('')
    lines.push('— Equipo —')
    for (const [k, v] of Object.entries(device)) lines.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
  }
  const soak = results.find((r) => r.id === 'soak')?.data as { timeline?: SoakMinute[]; summary?: SoakSummary } | undefined
  if (soak?.timeline?.length) {
    lines.push('')
    lines.push('— Prueba larga minuto a minuto (min: memoria MB · cortes · cuadros perdidos · congelado/oculta) —')
    const step = Math.max(1, Math.floor(soak.timeline.length / 24))
    const marks = soak.timeline.filter((t, i, a) => i % step === 0 || i === a.length - 1 || t.cuts > 0 || t.frozen || t.hidden)
    for (const t of marks) {
      lines.push(`${t.min}: ${t.memMB ?? '?'} MB · cortes ${t.cuts}${t.cuts ? ` (${t.cutMs} ms)` : ''} · perdidos ${t.dropped ?? '?'}/${t.frames ?? '?'}${t.frozen ? ' · CONGELADO' : ''}${t.hidden ? ' · oculta' : ''}`)
    }
  }
  lines.push('')
  lines.push(`— Errores (${errors.length}) —`)
  for (const e of errors.slice(-30)) lines.push(`${e.at} ${e.code}: ${e.message}`)
  return lines.join('\n')
}
