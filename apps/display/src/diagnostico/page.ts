// ============================================================================
// /diagnostico — pantalla del diagnóstico (DOM directo, sin frameworks)
// ============================================================================
import { SAMPLES } from './samples'
import {
  capturedErrors, installErrorCapture, listenSwMedia, deviceInfo, codecSupport, storageCheck,
  playbackA, playbackB, offlineCheck, expiryCheck, fullscreenAndWakeLock, soakTest, clearDiagnosticCaches,
  ensureSwControl, interruptedSoak,
  type CheckResult,
} from './checks'
import { buildReport } from './report'
import { CURRENT_BUILD } from '../build'

const RESULTS_KEY = 'tgd:diag-results'
const NAME_KEY = 'tgd:diag-equipo'

const ICON: Record<CheckResult['status'], string> = { ok: '✓', warn: '!', fail: '✗', skip: '…' }
const LABEL: Record<CheckResult['status'], string> = { ok: 'OK', warn: 'Atención', fail: 'Falla', skip: 'Pendiente' }
const COLOR: Record<CheckResult['status'], string> = { ok: 'var(--ok)', warn: 'var(--warn)', fail: 'var(--bad)', skip: 'var(--muted)' }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  if (text !== undefined) e.textContent = text
  return e
}

function loadResults(): Map<string, CheckResult> {
  try {
    const raw = localStorage.getItem(RESULTS_KEY)
    return new Map((raw ? JSON.parse(raw) as CheckResult[] : []).map((r) => [r.id, r]))
  } catch { return new Map() }
}
function saveResults(m: Map<string, CheckResult>) {
  try { localStorage.setItem(RESULTS_KEY, JSON.stringify([...m.values()])) } catch { /* */ }
}

export function mountDiagnostico(root: HTMLElement) {
  installErrorCapture()
  listenSwMedia()
  const results = loadResults()
  // Una prueba larga que quedó a medias (la página se recargó o se cerró) se
  // informa como interrumpida, con el minuto en que se cortó.
  const cut = interruptedSoak()
  if (cut) { results.set(cut.id, cut); saveResults(results) }
  // El service worker toma el control solo (sin «recargá una vez»).
  void ensureSwControl()

  root.innerHTML = ''
  const wrap = el('main', { style: 'max-width:880px;margin:0 auto;padding:16px 16px 48px' })
  wrap.append(
    el('h1', { style: 'font-size:22px;margin:4px 0' }, 'Diagnóstico de pantalla'),
    el('p', { style: 'color:var(--muted);margin:0 0 12px;font-size:14px' }, `Revisa si este equipo puede reproducir y guardar videos para TakeasyGO Pantallas. Nada se envía: al final copiás el informe. Versión ${CURRENT_BUILD.version}.`),
  )

  const nameRow = el('label', { style: 'display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted);margin-bottom:12px' }, 'Nombre del equipo (ej.: «TV Box sala», «TV BGH 43»)')
  const nameInput = el('input', { type: 'text', style: 'padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--fg);font-size:16px' }) as HTMLInputElement
  try { nameInput.value = localStorage.getItem(NAME_KEY) ?? '' } catch { /* */ }
  nameInput.addEventListener('input', () => { try { localStorage.setItem(NAME_KEY, nameInput.value) } catch { /* */ } })
  nameRow.append(nameInput)
  wrap.append(nameRow)

  const status = el('p', { role: 'status', 'aria-live': 'polite', style: 'min-height:22px;font-size:14px;color:var(--accent);margin:8px 0' })
  const stage = el('div', { style: 'margin:8px 0' })
  const list = el('ul', { style: 'list-style:none;padding:0;margin:12px 0;display:grid;gap:8px' })

  const btnStyle = 'min-height:48px;padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--fg);font-weight:600;cursor:pointer;text-align:left'
  const buttons = el('div', { style: 'display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))' })
  const mkBtn = (label: string, fn: () => Promise<void>) => {
    const b = el('button', { type: 'button', style: btnStyle }, label)
    b.addEventListener('click', async () => {
      for (const x of buttons.querySelectorAll('button')) (x as HTMLButtonElement).disabled = true
      try { await fn() } catch (e) { status.textContent = `Error: ${(e as Error).message}` } finally {
        for (const x of buttons.querySelectorAll('button')) (x as HTMLButtonElement).disabled = false
        render()
      }
    })
    buttons.append(b)
  }

  const put = (r: CheckResult) => { results.set(r.id, r); saveResults(results); render() }

  async function run(seconds: number) {
    status.textContent = 'Equipo, códecs y almacenamiento…'
    put(deviceInfo())
    put(await codecSupport())
    put(await storageCheck())
    put(await expiryCheck())
    for (const s of SAMPLES) {
      status.textContent = `Opción B · ${s.label}: descargando y reproduciendo ${seconds} s…`
      put(await playbackB(stage, s, seconds))
    }
    for (const s of SAMPLES.filter((x) => x.mb <= 30)) {
      status.textContent = `Opción A · ${s.label}: guardando con el service worker y reproduciendo ${seconds} s…`
      put(await playbackA(stage, s, seconds))
    }
    status.textContent = 'Listo. Probá ahora «Sin internet» y «Pantalla completa», y copiá el informe.'
  }

  mkBtn('1 · Diagnóstico rápido (15 s por video)', () => run(15))
  mkBtn('1b · Diagnóstico completo (60 s por video)', () => run(60))
  mkBtn('2 · Probar sin internet', async () => {
    status.textContent = 'Reproduciendo lo guardado…'
    put(await offlineCheck(stage, SAMPLES[0]))
    status.textContent = navigator.onLine ? 'Desconectá internet y volvé a tocar.' : 'Listo. Ahora recargá la página sin internet: si abre, la app funciona sin conexión.'
  })
  mkBtn('3 · Pantalla completa y suspensión', async () => { put(await fullscreenAndWakeLock()) })
  mkBtn('4 · Prueba larga 2 h (720p 30 MB)', async () => {
    put(await soakTest(stage, SAMPLES[1], 120, (m) => { status.textContent = m }))
  })
  mkBtn('4b · Prueba larga 2 h (1080p 30 MB)', async () => {
    put(await soakTest(stage, SAMPLES[4], 120, (m) => { status.textContent = m }))
  })
  mkBtn('Copiar informe', async () => {
    const text = buildReport(nameInput.value, [...results.values()], capturedErrors)
    try { await navigator.clipboard.writeText(text); status.textContent = 'Informe copiado. Pegalo en el chat.' } catch {
      reportBox.value = text; reportBox.style.display = 'block'; reportBox.select()
      status.textContent = 'No se pudo copiar solo: el informe está abajo, seleccionalo y copialo.'
    }
  })
  mkBtn('Borrar videos guardados', async () => {
    await clearDiagnosticCaches(SAMPLES.map((s) => s.url))
    status.textContent = 'Videos de prueba borrados de este equipo.'
  })

  const reportBox = el('textarea', { readonly: '', style: 'display:none;width:100%;min-height:240px;margin-top:12px;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:12px;padding:10px;font:12px/1.4 ui-monospace,monospace' }) as HTMLTextAreaElement

  function render() {
    list.replaceChildren(...[...results.values()].map((r) => {
      const li = el('li', { style: 'border:1px solid var(--line);background:var(--card);border-radius:12px;padding:10px 12px' })
      const head = el('div', { style: 'display:flex;gap:8px;align-items:baseline;flex-wrap:wrap' })
      head.append(
        el('span', { style: `font-weight:800;color:${COLOR[r.status]}`, 'aria-hidden': 'true' }, ICON[r.status]),
        el('strong', {}, r.title),
        el('span', { style: `font-size:12px;color:${COLOR[r.status]}` }, LABEL[r.status]),
      )
      li.append(head, el('div', { style: 'font-size:13px;color:var(--muted);margin-top:4px;word-break:break-word' }, r.detail))
      return li
    }))
  }

  wrap.append(buttons, status, stage, list, reportBox)
  root.append(wrap)
  render()
}
